import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Service, type Context, type Plugin } from 'cordis'
import type { CatalogEntry } from '@biu/host-hub'
import {
  buildStoreManifest,
  bundleStoreEntry,
  copyPluginRuntimeDependencies,
  findEntry,
  HOST_ENTRIES,
  persistStoreManifestCreatedAt,
  listingCreatedAt,
  ensureSandboxPackageJson,
  WEB_ENTRIES,
  type PluginCreateInput,
  type StoreManifestFields,
} from './plugin-create.ts'
import { parseStoreShell, requireDeclaredShell, type StoreShell } from '../shell.ts'
import { registerBuiltinPluginLookup } from '@biu/host-account/store'
import {
  assetsRootPath,
  biuSqlitePath,
  DATA_DIR_NAME,
  currentAccountId,
  currentRequestWorkspaceId,
  copyReferencedEditorAssets,
  openAndMigrateBiu,
  readEditorContent,
  runWithRequestWorkspace,
  writeEditorContent,
} from '@biu/host-plugin-loader/data-dir'

export type StoreListing = {
  id: string
  name: string
  blurb: string
  tags: string[]
  author: string
  authorUrl: string
  enabled: boolean
  running: boolean
  bytes: number
  createdAt: number
  updatedAt: number
  lastRunAt: number | null
  hasHost: boolean
  hasWeb: boolean
  builtin?: boolean
  /** 已安装 host.js + web.js 的内容短哈希，与加载 URL 的 v 参数一致。 */
  codeVersion?: string
  headless?: boolean
  shell?: StoreShell
}

export type StoreManifest = StoreManifestFields

type StoreHub = {
  adopt(entry: CatalogEntry): Promise<unknown>
  drop(id: string): Promise<unknown>
  snapshot(): { plugins: Array<{ id: string; enabled?: boolean; state?: string }> }
}

const ALLOWED_FILES = new Set(['manifest.json', 'host.js', 'web.js'])
const README_FILE = 'README.md'
/** pack 进 .plugin 的可执行代码；版本号按这两个文件一起算。 */
const PLUGIN_CODE_FILES = ['host.js', 'web.js'] as const
const PACKED_MEDIA = /\.(mp3|wav|ogg|m4a)$/i

function packedMediaName(name: string) {
  if (!/^[A-Za-z0-9._-]+\.(mp3|wav|ogg|m4a)$/i.test(name)) return ''
  return name.replace(/\.[^.]+$/, (ext) => ext.toLowerCase())
}

async function copyPackedMedia(sandbox: string, dest: string) {
  const assetsDest = join(dest, 'assets')
  mkdirSync(assetsDest, { recursive: true })
  const fromDirs = [sandbox, join(sandbox, 'assets')]
  for (const fromDir of fromDirs) {
    if (!existsSync(fromDir)) continue
    const names = await readdir(fromDir)
    for (const name of names) {
      if (!PACKED_MEDIA.test(name)) continue
      const destName = packedMediaName(name)
      if (!destName) continue
      const from = join(fromDir, name)
      if (!(await stat(from)).isFile()) continue
      await writeFile(join(assetsDest, destName), await readFile(from))
    }
  }
}

/** 已安装插件代码短版本：host.js 与 web.js 按文件名顺序一起 SHA-1，取前 12 位。 */
export async function hashInstalledPluginCode(dir: string): Promise<string | undefined> {
  const hash = createHash('sha1')
  let any = false
  for (const name of PLUGIN_CODE_FILES) {
    const file = join(dir, name)
    if (!existsSync(file)) continue
    hash.update(name)
    hash.update('\0')
    hash.update(await readFile(file))
    any = true
  }
  return any ? hash.digest('hex').slice(0, 12) : undefined
}

export function storeWebUrl(id: string, version?: string | number) {
  const base = `/api/plugin-store/files/${encodeURIComponent(id)}/web.js`
  // 带上整包代码短哈希（host + web），让前端的「挂载键」随每次重打包变化，
  // 从而触发真正的卸载 + 重新 import；否则前端会一直用最早加载的模块实例。
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`
}

export function defaultPluginDir() {
  return process.env.BIU_PLUGIN_DIR || join(process.cwd(), '.plugin')
}

export function defaultSandboxDir() {
  return process.env.BIU_PLUGIN_DEV_DIR || join(process.cwd(), '.plugin-dev')
}

export function defaultStatePath() {
  return process.env.BIU_PLUGIN_STATE || join(process.cwd(), '.plugin', 'store.json')
}

function isSafeId(id: string) {
  return /^[a-z][a-z0-9-]{1,40}$/.test(id)
}

/** 用分隔符判断，避免 `.plugin` 误匹配 `.plugin-dev`。 */
export function isPathInside(root: string, dir: string) {
  const base = resolve(root)
  const target = resolve(dir)
  return target === base || target.startsWith(`${base}${sep}`)
}

function importHostModule(code: string) {
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`)
}

async function importHostFile(hostFile: string) {
  try {
    return await import(`${pathToFileURL(hostFile).href}?t=${Date.now()}`)
  } catch (error) {
    // data: URL 没有文件目录，无法解析插件自带的原生 node_modules。
    // 原生插件应保留原始 file:// 错误，避免回退后错误地查找宿主依赖。
    if (existsSync(join(dirname(hostFile), 'node_modules'))) throw error
    return importHostModule(await readFile(hostFile, 'utf8'))
  }
}

export { listingCreatedAt } from './plugin-create.ts'

async function pluginDirStats(dir: string): Promise<Pick<StoreListing, 'bytes' | 'updatedAt' | 'hasHost' | 'hasWeb'>> {
  const names = await readdir(dir)
  let bytes = 0
  let updatedAt = 0
  for (const name of names) {
    const file = join(dir, name)
    const st = await stat(file)
    if (!st.isFile()) continue
    bytes += st.size
    const modified = Math.floor(st.mtimeMs)
    if (modified > updatedAt) updatedAt = modified
  }
  return {
    bytes,
    updatedAt,
    hasHost: existsSync(join(dir, 'host.js')),
    hasWeb: existsSync(join(dir, 'web.js')),
  }
}

async function readManifest(dir: string): Promise<StoreManifest> {
  try {
    return await persistStoreManifestCreatedAt(dir)
  } catch {
    throw new Error(`invalid plugin manifest in ${dir}`)
  }
}

type StoreState = { enabled: string[]; lastRunAt: Record<string, number> }

function emptyState(): StoreState {
  return { enabled: [], lastRunAt: {} }
}

function parseState(raw: unknown): StoreState {
  if (!raw || typeof raw !== 'object') return emptyState()
  const enabled = (raw as { enabled?: unknown }).enabled
  const lastRaw = (raw as { lastRunAt?: unknown }).lastRunAt
  const lastRunAt: Record<string, number> = {}
  if (lastRaw && typeof lastRaw === 'object') {
    for (const [id, ts] of Object.entries(lastRaw as Record<string, unknown>)) {
      const n = Number(ts)
      if (/^[a-z][a-z0-9-]{1,40}$/.test(id) && Number.isFinite(n) && n > 0) lastRunAt[id] = Math.floor(n)
    }
  }
  if (!Array.isArray(enabled)) return { enabled: [], lastRunAt }
  return {
    enabled: [...new Set(enabled.map((id) => String(id)).filter((id) => /^[a-z][a-z0-9-]{1,40}$/.test(id)))].sort(),
    lastRunAt,
  }
}

export class PluginStoreService extends Service {
  private state: StoreState = emptyState()
  private listCache: StoreListing[] | null = null
  private sandboxWatch: FSWatcher | null = null
  private sandboxNotifyTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    ctx: Context,
    readonly pluginDir: string,
    private readonly statePath: string,
    readonly sandboxDir: string = defaultSandboxDir(),
  ) {
    super(ctx, 'pluginStore')
    this.ctx.on('dispose', registerBuiltinPluginLookup((id) => this.isBuiltin(id)))
  }

  /** 随仓库发布的 .plugin-dev 插件。用户后来开的沙箱没有这个标记。 */
  isBuiltin(id: string) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) return false
    for (const dir of [this.sandboxPath(id), this.pluginPath(id)]) {
      const file = join(dir, 'manifest.json')
      if (!existsSync(file)) continue
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as { id?: unknown; builtin?: unknown }
        if (raw.builtin === true && String(raw.id ?? '') === id) return true
      } catch {
        /* 坏清单不当内置 */
      }
    }
    return false
  }

  open() {
    mkdirSync(dirname(this.statePath), { recursive: true })
    this.state = this.readState()
    this.watchSandbox()
    return this
  }

  /** .plugin-dev 里新出现清单时，让打开着的插件表立刻重拉。 */
  private watchSandbox() {
    mkdirSync(this.sandboxDir, { recursive: true })
    try {
      this.sandboxWatch = watch(this.sandboxDir, { recursive: true }, () => this.notifySandboxChanged())
      this.ctx.on('dispose', () => {
        this.sandboxWatch?.close()
        this.sandboxWatch = null
        if (this.sandboxNotifyTimer) clearTimeout(this.sandboxNotifyTimer)
        this.sandboxNotifyTimer = null
      })
    } catch {
      /* 监听失败时，打开表格仍会拉取磁盘 */
    }
  }

  private notifySandboxChanged() {
    if (this.sandboxNotifyTimer) return
    this.sandboxNotifyTimer = setTimeout(() => {
      this.sandboxNotifyTimer = null
      let http: { broadcast?: (type: string, payload: unknown) => void } | undefined
      try {
        http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
      } catch {
        return
      }
      http?.broadcast?.('database', { ts: Date.now(), collection: '/plugins' })
    }, 80)
  }

  private hub(): StoreHub {
    return this.ctx.hub as unknown as StoreHub
  }

  private accountStore() {
    return (
      this.ctx.get('account') as {
        store?: {
          canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean
          hasPluginLoad?(accountId: string, workspaceId: string, pluginId: string): boolean
          pluginLoadsFor?(accountId: string, workspaceId: string): string[]
          loadedPluginIds?(): string[]
          setPluginLoad?(accountId: string, workspaceId: string, pluginId: string, loaded: boolean): void
          isMember?(accountId: string, workspaceId: string): boolean
          ensurePluginOwnerAssignments?(pluginId: string): number
          recordPluginPackage?(accountId: string, input: Record<string, unknown>): void
          syncInstalledPluginPackage?(input: Record<string, unknown>): boolean
          removePluginPackage?(accountId: string, pluginId: string): void
        }
      } | undefined
    )?.store
  }

  private readState(): StoreState {
    if (!existsSync(this.statePath)) return emptyState()
    try {
      return parseState(JSON.parse(readFileSync(this.statePath, 'utf8')))
    } catch {
      return emptyState()
    }
  }

  private writeState() {
    this.invalidateList()
    mkdirSync(dirname(this.statePath), { recursive: true })
    writeFileSync(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`)
  }

  private invalidateList() {
    this.listCache = null
  }

  private contentSqlitePath() {
    // Explicit/custom plugin roots represent a self-contained instance (also
    // used by tests). The default root keeps honoring BIU_HOME/Electron data.
    if (resolve(this.pluginDir) !== resolve(defaultPluginDir())) {
      return join(dirname(resolve(this.pluginDir)), DATA_DIR_NAME, 'biu.sqlite')
    }
    return biuSqlitePath()
  }

  private isEnabled(id: string) {
    return this.state.enabled.includes(id)
  }

  private setEnabled(id: string, enabled: boolean) {
    const next = new Set(this.state.enabled)
    if (enabled) next.add(id)
    else next.delete(id)
    this.state = { enabled: [...next].sort(), lastRunAt: this.state.lastRunAt }
    this.writeState()
  }

  private touchLastRun(id: string) {
    this.state = { ...this.state, lastRunAt: { ...this.state.lastRunAt, [id]: Date.now() } }
    this.writeState()
  }

  pluginPath(id: string) {
    return join(this.pluginDir, id)
  }

  sandboxPath(id: string) {
    return join(this.sandboxDir, id)
  }

  /** 在 .plugin-dev/<id>/ 开沙箱，不写入已安装目录。线上任何空间成员都能开。 */
  async initSandbox(input: PluginCreateInput) {
    if (process.env.BIU_ONLINE === '1') this.requireWorkspaceMember()
    const id = String(input.id ?? '').trim()
    const name = String(input.name ?? '').trim()
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    if (!name) throw new Error('plugin name required')
    const dest = this.sandboxPath(id)
    mkdirSync(dest, { recursive: true })
    const hostJs = String(input.hostJs ?? '').trim()
    const webSrc = input.webJs != null ? String(input.webJs).trim() : ''
    const hasWeb = Boolean(webSrc) || Boolean(findEntry(dest, WEB_ENTRIES))
    const existing = existsSync(join(dest, 'manifest.json')) ? await readManifest(dest).catch(() => undefined) : undefined
    requireDeclaredShell(input.shell, hasWeb, 'sandbox', Boolean(input.headless) || Boolean(existing?.headless))
    const manifest = buildStoreManifest(input, existing)
    await writeFile(join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    if (hostJs) {
      mkdirSync(join(dest, 'host'), { recursive: true })
      await writeFile(join(dest, 'host/index.ts'), hostJs.endsWith('\n') ? hostJs : `${hostJs}\n`)
    }
    if (webSrc) {
      mkdirSync(join(dest, 'web'), { recursive: true })
      await writeFile(join(dest, 'web/index.tsx'), webSrc.endsWith('\n') ? webSrc : `${webSrc}\n`)
    }
    await ensureSandboxPackageJson(dest, id)
    await this.ensureReadme(dest, manifest.name, manifest.blurb)
    return { id, sandboxPath: dest }
  }

  /** 线上：空间成员即可打包。改沙箱源码仍要写权限。 */
  private requireWorkspaceMember() {
    const accountId = currentAccountId()
    const workspaceId = currentRequestWorkspaceId()
    const account = this.accountStore()
    if (!accountId || !workspaceId || !account?.isMember?.(accountId, workspaceId)) throw new Error('需要登录')
  }

  /** 把沙箱 bundle 进 .plugin/<id>/。 */
  async pack(id: string) {
    if (process.env.BIU_ONLINE === '1') this.requireWorkspaceMember()
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    const sandbox = this.sandboxPath(id)
    if (!existsSync(join(sandbox, 'manifest.json'))) throw new Error(`sandbox not found: ${sandbox}`)
    const manifest = await persistStoreManifestCreatedAt(sandbox)
    const raw = JSON.parse(await readFile(join(sandbox, 'manifest.json'), 'utf8')) as unknown
    const hostEntry = findEntry(sandbox, HOST_ENTRIES)
    const webEntry = findEntry(sandbox, WEB_ENTRIES)
    if (!hostEntry && !webEntry) throw new Error('sandbox needs host/index.ts or web/index.tsx')
    requireDeclaredShell(
      raw && typeof raw === 'object' ? (raw as { shell?: unknown }).shell : undefined,
      Boolean(webEntry),
      'pack',
      Boolean(manifest.headless),
    )
    this.invalidateList()
    const dest = this.pluginPath(manifest.id)
    const staging = join(this.pluginDir, `.packing-${manifest.id}`)
    await rm(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    try {
      await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      if (hostEntry) await writeFile(join(staging, 'host.js'), await bundleStoreEntry(hostEntry, 'host'))
      if (webEntry) await writeFile(join(staging, 'web.js'), await bundleStoreEntry(webEntry, 'web'))
      copyPluginRuntimeDependencies(sandbox, staging)
      let readme = await this.readDiskReadme(id)
      if (!readme.trim()) readme = `# ${manifest.name}\n\n${manifest.blurb.trim()}\n`
      const packed = copyReferencedEditorAssets({
        body: readme,
        assetsDir: assetsRootPath(),
        destDir: staging,
      })
      await writeFile(join(staging, README_FILE), packed)
      await copyPackedMedia(sandbox, staging)
      await rm(dest, { recursive: true, force: true })
      renameSync(staging, dest)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }
    const codeVersion = (await hashInstalledPluginCode(dest)) ?? 'empty'
    this.accountStore()?.recordPluginPackage?.(currentAccountId(), {
      id: manifest.id,
      version: codeVersion,
      packageHash: codeVersion,
      packagePath: dest,
      sourceKind: 'sandbox',
      trustState: 'approved',
      tenantMode: 'assigned',
      hasWeb: Boolean(webEntry),
      hasHost: Boolean(hostEntry),
      manifest,
    })
    // 运行中才重新挂载；挂载失败不能留在运行中。
    if (this.isEnabled(manifest.id)) {
      try {
        await this.mountFromDisk(manifest, dest)
      } catch (error) {
        await this.hub().drop(manifest.id).catch(() => undefined)
        this.invalidateList()
        throw error
      }
    }
    return { id: manifest.id, sandboxPath: sandbox, pluginPath: dest }
  }

  /** 空间成员看得到 .plugin-dev；实例草稿权限仍单独放行。 */
  private canSeeSandboxes() {
    if (process.env.BIU_ONLINE !== '1') return true
    const accountId = currentAccountId()
    const workspaceId = currentRequestWorkspaceId()
    return Boolean(accountId && workspaceId && this.accountStore()?.isMember?.(accountId, workspaceId))
  }

  async listSandboxes() {
    const canReadDrafts = this.canSeeSandboxes()
    const names = existsSync(this.sandboxDir) ? await readdir(this.sandboxDir) : []
    const items: Array<{
      id: string
      name: string
      blurb: string
      tags: string[]
      author: string
      authorUrl: string
      builtin?: boolean
      hasHost: boolean
      hasWeb: boolean
      headless?: boolean
      createdAt: number
      updatedAt: number
    }> = []
    for (const name of names.sort()) {
      const dir = join(this.sandboxDir, name)
      if (!(await stat(dir)).isDirectory()) continue
      if (!existsSync(join(dir, 'manifest.json'))) continue
      const manifest = await readManifest(dir)
      if (!manifest.builtin && !canReadDrafts) continue
      const stats = await pluginDirStats(dir)
      items.push({
        id: manifest.id,
        name: manifest.name,
        blurb: manifest.blurb,
        tags: manifest.tags,
        author: manifest.author,
        authorUrl: manifest.authorUrl,
        ...(manifest.builtin ? { builtin: true } : {}),
        hasHost: Boolean(findEntry(dir, HOST_ENTRIES)),
        hasWeb: Boolean(findEntry(dir, WEB_ENTRIES)),
        ...(manifest.headless ? { headless: true } : {}),
        createdAt: listingCreatedAt(manifest.createdAt),
        updatedAt: stats.updatedAt,
      })
    }
    return items
  }

  async list(): Promise<StoreListing[]> {
    if (this.listCache) return this.withViewerLoads(this.listCache)
    const names = existsSync(this.pluginDir) ? await readdir(this.pluginDir) : []
    const running = new Set(
      this.hub()
        .snapshot()
        .plugins.filter((row) => row.enabled || row.state === 'active')
        .map((row) => row.id),
    )
    const items: StoreListing[] = []
    for (const name of names.sort()) {
      const dir = join(this.pluginDir, name)
      if (!(await stat(dir)).isDirectory()) continue
      if (!existsSync(join(dir, 'manifest.json'))) continue
      const manifest = await readManifest(dir)
      const enabled = this.isEnabled(manifest.id)
      const stats = await pluginDirStats(dir)
      const codeVersion = await hashInstalledPluginCode(dir)
      items.push({
        ...manifest,
        ...(manifest.builtin || this.isBuiltin(manifest.id) ? { builtin: true } : {}),
        enabled,
        running: running.has(manifest.id),
        bytes: stats.bytes,
        createdAt: listingCreatedAt(manifest.createdAt),
        updatedAt: stats.updatedAt,
        lastRunAt: this.state.lastRunAt[manifest.id] ?? null,
        hasHost: stats.hasHost,
        hasWeb: stats.hasWeb,
        ...(codeVersion ? { codeVersion } : {}),
        ...(manifest.headless ? { headless: true } : { shell: parseStoreShell(manifest.shell) }),
      })
    }
    this.listCache = items
    return this.withViewerLoads(items)
  }

  /** 线上每人一份加载记录。进程里的 host 仍只挂一份，没人加载时才卸下。 */
  private withViewerLoads(items: StoreListing[]) {
    if (process.env.BIU_ONLINE !== '1') return items
    const accountId = currentAccountId()
    const workspaceId = currentRequestWorkspaceId()
    const loaded = new Set(this.accountStore()?.pluginLoadsFor?.(accountId, workspaceId) ?? [])
    return items.map((item) => ({ ...item, enabled: loaded.has(item.id), running: loaded.has(item.id) }))
  }

  private hasBundle(dir: string | null) {
    if (!dir) return false
    const host = join(dir, 'host.js')
    if (existsSync(host) && readFileSync(host, 'utf8').trim()) return true
    return existsSync(join(dir, 'web.js'))
  }

  /** 安装目录没有 host.js/web.js 时，用沙箱再打一次。半成品目录不能直接挂。 */
  private async ensurePacked(id: string) {
    const hit = await this.findPluginDir(id)
    if (this.hasBundle(hit)) return hit
    const sandbox = this.sandboxPath(id)
    const canPack = existsSync(join(sandbox, 'manifest.json')) && (findEntry(sandbox, HOST_ENTRIES) || findEntry(sandbox, WEB_ENTRIES))
    if (!canPack) return hit
    await this.pack(id)
    return this.findPluginDir(id)
  }

  private async mountInstalled(id: string) {
    const hit = await this.findPluginDir(id)
    if (!hit) throw new Error(`unknown store plugin: ${id}`)
    const manifest = await readManifest(hit)
    const running = this.hub().snapshot().plugins.some((row) => row.id === manifest.id)
    if (!running) await this.mountFromDisk(manifest, hit)
    return manifest
  }

  async openPlugin(id: string) {
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    if (process.env.BIU_ONLINE === '1') {
      const accountId = currentAccountId()
      const workspaceId = currentRequestWorkspaceId()
      const account = this.accountStore()
      if (!accountId || !workspaceId || !account?.isMember?.(accountId, workspaceId)) throw new Error('需要登录')
      await this.ensurePacked(id)
      try {
        await this.mountInstalled(id)
      } catch (error) {
        account.setPluginLoad?.(accountId, workspaceId, id, false)
        await this.hub().drop(id).catch(() => undefined)
        this.invalidateList()
        throw error
      }
      account.setPluginLoad?.(accountId, workspaceId, id, true)
      this.invalidateList()
      return (await this.list()).find((item) => item.id === id)
    }
    const hit = await this.ensurePacked(id)
    if (!hit) throw new Error(`unknown store plugin: ${id}`)
    const manifest = await readManifest(hit)
    try {
      await this.mountFromDisk(manifest, hit)
    } catch (error) {
      this.setEnabled(manifest.id, false)
      await this.hub().drop(manifest.id).catch(() => undefined)
      this.invalidateList()
      throw error
    }
    this.setEnabled(manifest.id, true)
    this.touchLastRun(manifest.id)
    this.invalidateList()
    return (await this.list()).find((item) => item.id === manifest.id)
  }

  /** 关闭：停运行，.plugin 代码留着。线上只停当前这个人。 */
  async close(id: string) {
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    if (process.env.BIU_ONLINE === '1') {
      const accountId = currentAccountId()
      const workspaceId = currentRequestWorkspaceId()
      const account = this.accountStore()
      if (!accountId || !workspaceId || !account?.isMember?.(accountId, workspaceId)) throw new Error('需要登录')
      account.setPluginLoad?.(accountId, workspaceId, id, false)
      const still = account.loadedPluginIds?.().includes(id)
      if (!still) await this.hub().drop(id)
      this.invalidateList()
      return
    }
    await this.hub().drop(id)
    this.setEnabled(id, false)
    this.invalidateList()
  }

  /** 卸载：停运行，只删 .plugin/<id>/，不动 .plugin-dev。 */
  async uninstall(id: string) {
    if (process.env.BIU_ONLINE === '1') this.requireWorkspaceMember()
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    await this.hub().drop(id)
    this.setEnabled(id, false)
    const dest = this.pluginPath(id)
    if (isPathInside(this.pluginDir, dest) && !isPathInside(this.sandboxDir, dest) && existsSync(dest)) {
      await rm(dest, { recursive: true, force: true })
    }
    this.invalidateList()
    const lastRunAt = { ...this.state.lastRunAt }
    delete lastRunAt[id]
    this.state = { ...this.state, lastRunAt }
    this.writeState()
    this.accountStore()?.removePluginPackage?.(currentAccountId(), id)
  }

  /** 彻底删除：安装产物和沙箱一起删。回收站清空走这条。 */
  async destroy(id: string) {
    if (!isSafeId(id)) throw new Error(`invalid plugin id: ${id}`)
    if (this.isBuiltin(id)) throw new Error(`cannot delete built-in plugin: ${id}`)
    await this.uninstall(id)
    const sandbox = this.sandboxPath(id)
    if (isPathInside(this.sandboxDir, sandbox) && existsSync(sandbox)) {
      await rm(sandbox, { recursive: true, force: true })
    }
    this.invalidateList()
  }

  private readmeDir(id: string) {
    const sandbox = this.sandboxPath(id)
    if (existsSync(join(sandbox, 'manifest.json'))) return sandbox
    const installed = this.pluginPath(id)
    if (existsSync(join(installed, 'manifest.json'))) return installed
    return null
  }

  private async ensureReadme(dir: string, name: string, blurb: string) {
    const path = join(dir, README_FILE)
    if (existsSync(path)) return
    const body = `# ${name}\n\n${blurb.trim()}\n`
    await writeFile(path, body)
  }

  private warnReadme(error: unknown) {
    this.ctx.logger('core-plugin-system').warn(error)
  }

  private async readDiskReadme(id: string) {
    const dir = this.readmeDir(id)
    if (!dir) return ''
    const path = join(dir, README_FILE)
    if (!existsSync(path)) return ''
    return readFile(path, 'utf8')
  }

  async readReadme(id: string) {
    const sqlitePath = this.contentSqlitePath()
    if (existsSync(sqlitePath)) {
      try {
        const db = openAndMigrateBiu(sqlitePath)
        try {
          const body = readEditorContent(db, '/plugins', id)
          if (body) return body
          const text = await this.readDiskReadme(id)
          if (!text) return ''
          try {
            writeEditorContent(db, '/plugins', id, text)
          } catch (error) {
            this.warnReadme(error)
          }
          return text
        } finally {
          db.close()
        }
      } catch (error) {
        this.warnReadme(error)
      }
    }
    return this.readDiskReadme(id)
  }

  async writeReadme(id: string, markdown: string) {
    if (process.env.BIU_ONLINE === '1') this.requireWorkspaceMember()
    const text = String(markdown ?? '')
    const sqlitePath = this.contentSqlitePath()
    mkdirSync(dirname(sqlitePath), { recursive: true })
    const db = openAndMigrateBiu(sqlitePath)
    try {
      writeEditorContent(db, '/plugins', id, text)
    } finally {
      db.close()
    }
    for (const dir of [this.sandboxPath(id), this.pluginPath(id)]) {
      if (!existsSync(join(dir, 'manifest.json'))) continue
      try {
        await writeFile(join(dir, README_FILE), text)
      } catch (error) {
        this.warnReadme(error)
      }
    }
    this.invalidateList()
  }

  async restore() {
    const ids = process.env.BIU_ONLINE === '1'
      ? [...new Set([...(this.accountStore()?.loadedPluginIds?.() ?? []), ...this.state.enabled])]
      : this.state.enabled
    for (const id of ids) {
      const hit = await this.findPluginDir(id)
      if (!hit) continue
      try {
        const manifest = await readManifest(hit)
        const stats = await pluginDirStats(hit)
        const codeVersion = (await hashInstalledPluginCode(hit)) ?? 'empty'
        if (process.env.BIU_ONLINE === '1') {
          this.accountStore()?.syncInstalledPluginPackage?.({
            id: manifest.id,
            version: codeVersion,
            packageHash: codeVersion,
            packagePath: hit,
            sourceKind: 'legacy-installed',
            trustState: 'approved',
            tenantMode: 'assigned',
            hasWeb: stats.hasWeb,
            hasHost: stats.hasHost,
            manifest,
          })
        }
        await this.mountFromDisk(manifest, hit)
      } catch (error) {
        this.ctx.logger('core-plugin-system').error(error)
      }
    }
  }

  async readInstalledFile(id: string, file: string) {
    if (!isSafeId(id) || !ALLOWED_FILES.has(file)) throw new Error('not found')
    if (process.env.BIU_ONLINE === '1') {
      const accountId = currentAccountId()
      const workspaceId = currentRequestWorkspaceId()
      if (!accountId || !workspaceId || !this.accountStore()?.canAccessPlugin?.(accountId, workspaceId, id)) {
        throw new Error('not found')
      }
    } else if (!this.isEnabled(id)) throw new Error('not found')
    const hit = await this.findPluginDir(id)
    if (!hit) throw new Error('not found')
    const path = join(hit, file)
    if (!existsSync(path)) throw new Error('not found')
    return readFile(path, 'utf8')
  }

  private async findPluginDir(id: string) {
    if (!existsSync(this.pluginDir)) return null
    const guess = this.pluginPath(id)
    if (existsSync(join(guess, 'manifest.json'))) return guess
    for (const name of await readdir(this.pluginDir)) {
      const dir = join(this.pluginDir, name)
      if (!(await stat(dir)).isDirectory()) continue
      if (!existsSync(join(dir, 'manifest.json'))) continue
      const manifest = await readManifest(dir)
      if (manifest.id === id) return dir
    }
    return null
  }

  private async mountFromDisk(manifest: StoreManifest, dir: string) {
    const hostFile = join(dir, 'host.js')
    const webFile = join(dir, 'web.js')
    const hostCode = existsSync(hostFile) ? (await readFile(hostFile, 'utf8')).trim() : ''
    const hasWeb = existsSync(webFile)
    const codeVersion = await hashInstalledPluginCode(dir)
    if (!hostCode && !hasWeb) throw new Error(`plugin ${manifest.id} is not packed`)
    const mod = (hostCode
      ? await importHostFile(hostFile)
      : { name: manifest.id, apply() {} }) as Plugin & { inject?: string[]; setInstallDir?: (dir: string) => void }
    mod.setInstallDir?.(dir)
    const entry: CatalogEntry = {
      id: manifest.id,
      name: manifest.name,
      layer: 'capability',
      blurb: manifest.blurb,
      plugin: mod,
      inject: mod.inject,
      togglable: true,
      enabled: true,
      web: hasWeb ? storeWebUrl(manifest.id, codeVersion) : undefined,
      packageName: `store:${manifest.id}`,
    }
    await this.hub().adopt(entry)
  }
}

export async function openStore(ctx: Context) {
  const store = new PluginStoreService(ctx, defaultPluginDir(), defaultStatePath(), defaultSandboxDir()).open()
  try {
    await store.restore()
  } catch (error) {
    ctx.logger('core-plugin-system').error(error)
  }

  ctx.http.route('GET', '/api/plugin-store/files/:id/:file', async (route) => {
    try {
      const requestedWorkspace = String(route.query.get('workspaceId') ?? currentRequestWorkspaceId()).trim()
      if (process.env.BIU_ONLINE === '1' && !currentAccountId()) {
        route.send(401, { error: '需要登录' })
        return
      }
      if (process.env.BIU_ONLINE === '1' && !requestedWorkspace) {
        route.send(400, { error: '需要空间' })
        return
      }
      const body = await runWithRequestWorkspace(requestedWorkspace, () =>
        store.readInstalledFile(route.params.id, route.params.file),
      )
      const mime = route.params.file.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : 'application/json; charset=utf-8'
      route.res.writeHead(200, {
        'content-type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      })
      route.res.end(body)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/plugins/catalog', async (route) => {
    const accountId = currentAccountId()
    const workspaceId = currentRequestWorkspaceId()
    const account = (
      ctx.get('account') as {
        store?: {
          canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean
          isMember?(accountId: string, workspaceId: string): boolean
        }
      } | undefined
    )?.store
    const canManagePackages =
      process.env.BIU_ONLINE !== '1' || Boolean(accountId && workspaceId && account?.isMember?.(accountId, workspaceId))
    const plugins = (await store.list())
      .filter((item) => !item.builtin && !store.isBuiltin(item.id))
      .map((item) => ({
      id: item.id,
      name: item.name,
      blurb: item.blurb,
      version: item.codeVersion ?? '',
      hasWeb: item.hasWeb,
      hasHost: item.hasHost,
      available: item.enabled,
      assigned: Boolean(account?.canAccessPlugin?.(accountId, workspaceId, item.id)),
      ...(canManagePackages ? { running: item.running, bytes: item.bytes, updatedAt: item.updatedAt } : {}),
    }))
    route.send(200, { plugins, canManagePackages })
  })
  return store
}

declare module 'cordis' {
  interface Context {
    pluginStore: PluginStoreService
  }
}
