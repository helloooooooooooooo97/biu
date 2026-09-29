import type { Context } from 'cordis'
import { FILE_TOOL_NAMES, MINIMAL_TOOL_NAMES, normalizeAgentMode, type AgentToolMode } from '@biu/host-tools'
import {
  collectLiveDispatchedTasks,
  type DispatchedTask,
  type TaskDispatchSource,
} from '@biu/host-live-sessions/usage'
import type { SessionEvent } from '@biu/type-session'

export type ToolSourceId = 'minimal' | 'db' | 'plugin' | 'store'

export interface InspectorToolRow {
  name: string
  description: string
  source: ToolSourceId
  active: boolean
  configurable: boolean
}

export interface InspectorSourceInfo {
  id: ToolSourceId
  label: string
  description: string
}

const SOURCE_INFO: InspectorSourceInfo[] = [
  {
    id: 'minimal',
    label: '极简模式',
    description: 'agentMode=minimal 时的底座工具（bash、str_replace_editor）。',
  },
  {
    id: 'db',
    label: '数据库',
    description: 'agentMode=file 时仅开放这些 db_* 工具（Biu 文件系统）。',
  },
  {
    id: 'plugin',
    label: '插件注册',
    description: '内置 seams 工具；标准模式全开，极简需勾选常驻或 slash 临时放开。',
  },
  {
    id: 'store',
    label: '商店插件',
    description: '已安装商店插件注册的工具，标准模式可调用。',
  },
]

export function toolSourceOf(name: string, origin?: 'core' | 'store'): ToolSourceId {
  if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(name)) return 'minimal'
  if ((FILE_TOOL_NAMES as readonly string[]).includes(name)) return 'db'
  if (origin === 'store') return 'store'
  return 'plugin'
}

export function isToolActiveForSession(opts: {
  name: string
  mode: AgentToolMode
  pinnedExtras: readonly string[]
  origin?: 'core' | 'store'
}): boolean {
  if (opts.mode === 'standard') return true
  if (opts.origin === 'store' || toolSourceOf(opts.name, opts.origin) === 'store') return false
  if (opts.mode === 'file') return (FILE_TOOL_NAMES as readonly string[]).includes(opts.name)
  if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(opts.name)) return true
  return opts.pinnedExtras.includes(opts.name)
}

export function buildInspectorTools(
  catalog: Array<{ name: string; description: string; origin?: 'core' | 'store' }>,
  opts: { mode: AgentToolMode; pinnedExtras: readonly string[] },
): InspectorToolRow[] {
  return catalog
    .map((item) => {
      const source = toolSourceOf(item.name, item.origin)
      return {
        name: item.name,
        description: item.description,
        source,
        active: isToolActiveForSession({
          name: item.name,
          mode: opts.mode,
          pinnedExtras: opts.pinnedExtras,
          origin: item.origin,
        }),
        configurable: opts.mode === 'minimal' && source === 'plugin',
      }
    })
    .sort((a, b) => {
      const order = { minimal: 0, db: 1, plugin: 2, store: 3 } as const
      const diff = order[a.source] - order[b.source]
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
}

export function registerChatInspectorRoutes(ctx: Context) {
  ctx.http.route('GET', '/api/sessions/:id/inspector', async (route) => {
    const id = route.params.id
    const record = await ctx.sessions.get(id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const resolved = ctx.chat.resolveEffective(id)
    const mode: AgentToolMode = normalizeAgentMode(resolved.effective.agentMode)
    const pinnedExtras = Array.isArray(resolved.effective.extraTools) ? resolved.effective.extraTools : []
    const tools = buildInspectorTools(ctx.tools.catalog(), { mode, pinnedExtras })
    const title =
      'title' in resolved.effective && typeof resolved.effective.title === 'string'
        ? resolved.effective.title
        : record.config?.title ?? null
    const body: Record<string, unknown> = {
      sessionId: id,
      title,
      agentMode: mode,
      extraTools: pinnedExtras,
      defaults: resolved.defaults,
      config: resolved.config ?? null,
      effective: resolved.effective,
      sources: SOURCE_INFO,
      tools,
      contextWindow: ctx.chat.contextWindowFor(id),
      contextWindowTokens: ctx.chat.contextWindowFor(id) === '1m' ? 1_000_000 : 200_000,
    }
    const dispatched = await loadDispatchedUsage(ctx, id, record.events)
    const { titles, mascots, projects } = await sessionDecorations(ctx)
    body.dispatchedUsage = dispatched.total
    body.dispatchedUsageByTurn = Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [key, value.usage]),
    )
    body.dispatchedTasksByTurn = Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [
        key,
        value.tasks.map((task) => decorateTask(task, titles, mascots, projects)),
      ]),
    )
    route.send(200, body)
  })

  ctx.http.route('GET', '/api/sessions/:id/dispatched-usage', async (route) => {
    const id = route.params.id
    const record = await ctx.sessions.get(id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const dispatched = await loadDispatchedUsage(ctx, id, record.events)
    const { titles, mascots, projects } = await sessionDecorations(ctx)
    const tasksByTurn: Record<string, Array<Record<string, unknown>>> = {}
    const usageByTurn: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(dispatched.byLiveTurn)) {
      usageByTurn[key] = value.usage
      tasksByTurn[key] = value.tasks.map((task) => decorateTask(task, titles, mascots, projects))
    }
    route.send(200, {
      sessionId: id,
      dispatchedUsage: dispatched.total,
      dispatchedUsageByTurn: usageByTurn,
      dispatchedTasksByTurn: tasksByTurn,
    })
  })
}

async function sessionDecorations(ctx: Context) {
  const titles = new Map<string, string>()
  const mascots = new Map<string, { shape: string; color: string; eye?: number }>()
  const projects = new Map<string, { name: string; path?: string }>()
  for (const item of await ctx.sessions.listSummaries()) {
    titles.set(item.id, item.title)
    if (item.mascot) mascots.set(item.id, item.mascot)
    if (item.project?.name) {
      projects.set(item.id, {
        name: item.project.name,
        ...(item.project.path ? { path: item.project.path } : {}),
      })
    }
  }
  return { titles, mascots, projects }
}

function decorateTask(
  task: DispatchedTask,
  titles: Map<string, string>,
  mascots: Map<string, { shape: string; color: string; eye?: number }>,
  projects: Map<string, { name: string; path?: string }>,
) {
  return {
    ...task,
    title: titles.get(task.sessionId) ?? task.sessionId.slice(0, 8),
    ...(mascots.get(task.sessionId) ? { mascot: mascots.get(task.sessionId) } : {}),
    ...(projects.get(task.sessionId) ? { project: projects.get(task.sessionId) } : {}),
  }
}

/** 从 task 体系取出本 live（作为 creator）派发的任务，作为派工统计数据源（替代旧的 wake/inject 扫描）。 */
export async function loadLiveDispatchTasks(
  ctx: Context & { tasks?: { list(filter: { creatorSessionId?: string }): Array<{ id: string; title: string; status: 'todo' | 'doing' | 'done'; createdAt: number; assignee?: { sessionId?: string } | null }> } },
  liveId: string,
): Promise<TaskDispatchSource[]> {
  if (!ctx.tasks) return []
  const rows = ctx.tasks.list({ creatorSessionId: liveId })
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      sessionId: row.assignee?.sessionId ?? '',
      createdAt: row.createdAt,
      status: row.status,
    }))
    .filter((item) => Boolean(item.sessionId))
}

async function loadDispatchedUsage(
  ctx: Context,
  liveId: string,
  liveEvents: SessionEvent[],
) {
  const summaries = await ctx.sessions.listSummaries()
  const workers: Array<{ id: string; events: SessionEvent[] }> = []
  for (const item of summaries) {
    if (item.id === liveId) continue
    const worker = await ctx.sessions.require(item.id)
    workers.push({ id: item.id, events: worker.events })
  }
  const liveTasks = await loadLiveDispatchTasks(ctx, liveId)
  return collectLiveDispatchedTasks(liveId, liveEvents, workers, liveTasks)
}
