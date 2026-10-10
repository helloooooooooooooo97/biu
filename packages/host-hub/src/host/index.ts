import { Service, type Context, type Fiber, type Plugin } from 'cordis'
import { findRepoRoot, readCordisConfig } from '@biu/host-plugin-loader'
import type { CatalogEntry } from './catalog.ts'
import { kernelCatalogRows } from './kernel-rows.ts'
import { resolveCatalog } from './resolve-catalog.ts'
import type { PageSpec } from '@biu/type-http'
import { HUB_CHANGE, HUB_CHANNEL_EVENT, HUB_CHANNEL_SNAPSHOT } from '@biu/type-http'
import { runWithToolOrigin } from '@biu/host-tools'
import { currentAccountId, currentRequestWorkspaceId, runWithPlugin } from '@biu/host-plugin-loader/data-dir'

export { HUB_CHANGE, HUB_CHANNEL_EVENT, HUB_CHANNEL_SNAPSHOT }

const STATE = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading']

interface ForkRecord {
  entry: CatalogEntry
  fiber?: Fiber
}

export class HubService extends Service {
  private forks = new Map<string, ForkRecord>()
  private pages: PageSpec[] = []
  private events: Array<{ id: string; ts: number; mode: string; name: string; args: unknown[] }> = []
  private seq = 0
  private eventSeq = 0

  constructor(ctx: Context, catalog: CatalogEntry[]) {
    super(ctx, 'hub')
    ctx.on('internal/dispatch', (mode, name, args) => {
      if (skipHubEvent(name, args)) return
      this.eventSeq += 1
      this.events.unshift({
        id: `evt-${this.eventSeq}`,
        ts: Date.now(),
        mode,
        name,
        args: clone(args),
      })
      this.events.splice(80)
      ctx.http.broadcast(HUB_CHANNEL_EVENT, this.events[0])
    })
    let snapTimer: ReturnType<typeof setTimeout> | null = null
    const pushSnapshot = () => {
      if (snapTimer) return
      snapTimer = setTimeout(() => {
        snapTimer = null
        if (process.env.BIU_ONLINE === '1') {
          // Snapshot contains an account-specific plugin manifest. Push only an
          // invalidation signal; every browser pulls its own filtered snapshot.
          ctx.http.broadcast('plugins/changed', { ts: Date.now() })
        } else {
          ctx.http.broadcast(HUB_CHANNEL_SNAPSHOT, this.snapshot())
        }
      }, 40)
    }
    ctx.on('internal/status', pushSnapshot)
    ctx.on(HUB_CHANGE, pushSnapshot)
    for (const entry of catalog) {
      this.forks.set(entry.id, { entry })
    }
  }

  /** 等内核插件 ACTIVE 后再对外提供 snapshot，避免前端拿到 enabled:false 而不挂 chat-ui。 */
  async mountEnabled() {
    for (const record of this.forks.values()) {
      if (record.entry.enabled) await this.mount(record.entry.id)
    }
  }

  // 在hub注册对应的插件
  register(page: PageSpec) {
    return this.ctx.effect(() => {
      this.pages.push(page)
      this.ctx.emit(HUB_CHANGE)
      return () => {
        this.pages = this.pages.filter((item) => item !== page)
        this.ctx.emit(HUB_CHANGE)
      }
    }, `hub.registerPage ${page.id}`)
  }

  listEvents() {
    return [...this.events]
  }

  snapshot() {
    const config = readCordisConfig(findRepoRoot())
    const plugins = [
      ...kernelCatalogRows(config.host ?? [], 'host'),
      ...kernelCatalogRows(config.web ?? [], 'web'),
      ...[...this.forks.values()].map(({ entry, fiber }) => ({
        id: entry.id,
        name: entry.name,
        layer: entry.layer,
        blurb: entry.blurb,
        inject: entry.inject ?? [],
        togglable: entry.togglable,
        enabled: Boolean(fiber && fiber.uid !== null),
        state: fiber ? STATE[fiber.state] ?? String(fiber.state) : 'off',
        ...(entry.web ? { web: entry.web } : {}),
        ...(entry.packageName ? { packageName: entry.packageName } : {}),
      })),
    ]
    return {
      seq: ++this.seq,
      plugins,
      pages: [...this.pages],
      routes: this.ctx.http.listRoutes(),
      events: this.events,
      tools: this.ctx.tools.names(),
      collections: listSnapshotCollections(this.ctx),
      services: [
        'http', 'hub', 'tools', 'llm', 'agentLoop', 'agents', 'approvals',
        'sessionStore', 'sessions', 'systemPrompt', 'fs', 'subprocess', 'sandbox',
        'shell', 'jobs', 'mcp', 'terminals', 'lsp', 'subagents', 'chat', 'database',
      ].filter((name) => Boolean(this.ctx.get(name))),
    }
  }

  snapshotFor(accountId: string, workspaceId: string) {
    const snapshot = this.snapshot()
    if (process.env.BIU_ONLINE !== '1') return snapshot
    const store = (
      this.ctx.get('account') as {
        store?: { canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean }
      } | undefined
    )?.store
    const allowed = new Set(
      snapshot.plugins
        .filter(
          (plugin) =>
            !isStorePackage(plugin.packageName) ||
            Boolean(store?.canAccessPlugin?.(accountId, workspaceId, plugin.id)),
        )
        .map((plugin) => plugin.id),
    )
    const plugins = snapshot.plugins
      .filter((plugin) => allowed.has(plugin.id))
      .map((plugin) => {
        if (!isStorePackage(plugin.packageName) || !plugin.web) return plugin
        const separator = plugin.web.includes('?') ? '&' : '?'
        return {
          ...plugin,
          web: `${plugin.web}${separator}workspaceId=${encodeURIComponent(workspaceId)}`,
        }
      })
    return {
      ...snapshot,
      plugins,
      pages: snapshot.pages.filter((page) => allowed.has(page.plugin)),
    }
  }

  async setEnabled(id: string, enabled: boolean) {
    const record = this.forks.get(id)
    if (!record) throw new Error(`unknown plugin: ${id}`)
    if (!record.entry.togglable) throw new Error(`${id} 是核心层，不能卸载`)
    if (enabled) await this.mount(id)
    else await this.unmount(id)
    this.ctx.emit(HUB_CHANGE)
    return this.snapshot()
  }

  /** 运行时挂上商店已安装包（预编译 ESM），不改 cordis.plugins.json。 */
  async adopt(entry: CatalogEntry) {
    const existing = this.forks.get(entry.id)
    if (existing && !isStorePackage(existing.entry.packageName)) {
      throw new Error(`cannot replace built-in plugin ${entry.id}`)
    }
    if (existing?.fiber) await this.unmount(entry.id)
    this.forks.set(entry.id, { entry })
    if (entry.enabled !== false) await this.mount(entry.id)
    this.ctx.emit(HUB_CHANGE)
    return this.snapshot()
  }

  /** 卸掉商店包，内置 cap 不能走这条路径。 */
  async drop(id: string) {
    const existing = this.forks.get(id)
    if (!existing) return this.snapshot()
    if (!isStorePackage(existing.entry.packageName)) {
      throw new Error(`cannot drop built-in plugin ${id}`)
    }
    await this.unmount(id)
    this.forks.delete(id)
    this.ctx.emit(HUB_CHANGE)
    return this.snapshot()
  }

  private async mount(id: string) {
    const record = this.forks.get(id)
    if (!record || (record.fiber && record.fiber.uid !== null)) return
    const mount = () => {
      record.fiber = this.ctx.plugin(record.entry.plugin as Plugin, record.entry.config)
    }
    if (isStorePackage(record.entry.packageName)) {
      runWithPlugin(id, () => runWithToolOrigin('store', mount))
    }
    else mount()
    await record.fiber
  }

  private async unmount(id: string) {
    const record = this.forks.get(id)
    if (!record?.fiber) return
    await record.fiber.dispose()
    record.fiber = undefined
  }
}

function clone(value: unknown): unknown[] {
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'function' ? '[fn]' : item)))
  } catch {
    return ['[unserializable]']
  }
}

/** 心跳和路由登记会把 EventLog / WS 打满；FS 登记多条 /api/db 路由后更明显。 */
export function skipHubEvent(name: string, args?: unknown[]) {
  if (name.startsWith('internal/')) return true
  if (name === 'llm/stream' || name === 'clock/tick' || name === 'hub/change') return true
  if (name === 'session/event') {
    const payload = args?.[0] as { event?: { type?: string } } | undefined
    if (payload?.event?.type === 'assistant/chunk') return true
  }
  return false
}

function listSnapshotCollections(ctx: Context) {
  const db = ctx.get('database') as
    | { collectionsList?: () => Array<{ id: string; path: string; label?: string; view?: unknown }> }
    | undefined
  if (!db?.collectionsList) return []
  return db.collectionsList().map((item) => ({
    id: item.id,
    path: item.path,
    kind: 'collection' as const,
    label: item.label ?? item.id,
    view: item.view ?? null,
  }))
}

function isStorePackage(packageName?: string) {
  return typeof packageName === 'string' && packageName.startsWith('store:')
}

export type { CatalogEntry } from './catalog.ts'

export const name = 'hub'
export const inject = ['http', 'tools']

export async function apply(ctx: Context) {
  const catalog = await resolveCatalog()
  const hub = new HubService(ctx, catalog)
  await hub.mountEnabled()
  ctx.http.route('GET', '/api/snapshot', (route) => {
    route.res.setHeader('cache-control', 'private, no-store')
    route.res.setHeader('vary', 'Authorization, Cookie, X-Biu-Workspace-Id')
    route.send(200, ctx.hub.snapshotFor(currentAccountId(), currentRequestWorkspaceId()))
  })
  if (process.env.BIU_ONLINE !== '1') ctx.http.broadcast(HUB_CHANNEL_SNAPSHOT, ctx.hub.snapshot())
  ctx.http.route('POST', '/api/plugins/:id', async (route) => {
    const payload = (await route.json()) as { enabled?: boolean }
    try {
      route.send(200, await ctx.hub.setEnabled(route.params.id, Boolean(payload.enabled)))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
}
