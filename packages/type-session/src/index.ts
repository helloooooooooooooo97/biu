import { nameFromSessionMascot } from './session-mascot-name.ts'
export { nameFromSessionMascot, MASCOT_COLOR_NAME, MASCOT_EYE_NAME, MASCOT_SHAPE_NAME } from './session-mascot-name.ts'
export { isSessionCompactPoint, sessionCompactSummaryText } from './compact-point.ts'
export { formatLiveUiContext, sanitizeLiveUiContext, type LiveUiContext } from './live-ui-context.ts'
export const SESSION_FORMAT_VERSION = 1

export type InboxKind = 'wake' | 'inject'

/** 谁写入这条 user/message：真人用户，或其它 session（如 Live 派工）。缺省按 user。 */
export type MessageSender =
  | { type: 'user' }
  | { type: 'session'; sessionId: string }

export type UserMessageImage = {
  name: string
  mime: string
  url: string
}

/** 写入 append 的正文（不含 seq/ts）；与 SessionEvent 判别联合一一对应。 */
export type SessionEventBody =
  | { type: 'session/open'; version: number }
  | { type: 'turn/start'; turn: number }
  | { type: 'turn/end'; turn: number; reason: string }
  | { type: 'step/start'; turn: number; step: number }
  | { type: 'step/end'; turn: number; step: number }
  | { type: 'system/prompt'; text: string }
  | { type: 'system/compact'; text: string }
  | { type: 'user/message'; text: string; kind: InboxKind; sender?: MessageSender; images?: UserMessageImage[] }
  | {
      type: 'assistant/message'
      text: string
      tool_calls?: Array<{ id: string; name: string; arguments: string }>
      usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens?: number
        cacheReadTokens?: number
        /** 本次 LLM 输入中「历史 turn」占比（0..1）；由 agent-loop 在 derive 时统计挂载。curPct=1-histPct，无需单独存储。 */
        histPct?: number
      }
    }
  | { type: 'assistant/chunk'; text: string; channel?: 'reasoning' }
  | { type: 'tool/call'; id: string; name: string; arguments: string }
  | { type: 'tool/result'; id: string; name: string; ok: boolean; detail: string; partial?: boolean }
  | {
      type: 'content/edits'
      turn: number
      files: Array<{
        path: string
        title: string
        added: number
        removed: number
        jump_line: number
        reverted?: boolean
        kind?: 'content' | 'create' | 'update' | 'delete'
      }>
    }

export type SessionEvent = SessionEventBody & {
  seq: number
  ts: number
}

export type ContentEditFile = Extract<SessionEventBody, { type: 'content/edits' }>['files'][number]

/** 同回合多次 content/edits 按 path 合并；后写覆盖同 path，其它 path 保留。 */
export function mergeContentEditFiles<T extends { path: string; kind?: string }>(prev: T[], next: T[]): T[] {
  const map = new Map<string, T>()
  for (const file of prev) {
    const path = String(file.path ?? '').trim()
    if (path) map.set(`${file.kind ?? 'content'}:${path}`, file)
  }
  for (const file of next) {
    const path = String(file.path ?? '').trim()
    if (path) map.set(`${file.kind ?? 'content'}:${path}`, file)
  }
  return [...map.values()]
}

/** 对齐 dsh workspace：Session 绑定 host 本机绝对路径，Agent 工具直接以此为 cwd。 */
export interface SessionProject {
  name: string
  path: string
  boundAt: number
}

/** Per-chat Grok shape+color(+eye) role — assigned once at create and persisted. */
export interface SessionMascot {
  shape: string
  color: string
  /** Resting eye morph frame; legacy records may omit and get backfilled. */
  eye?: number
}

export type SessionGoalStatus = 'pursuing' | 'paused' | 'achieved' | 'blocked'

export interface SessionGoal {
  id: string
  objective: string
  status: SessionGoalStatus
  turns: number
  summary?: string
}

export function normalizeSessionGoal(value: unknown): SessionGoal | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const id = String(raw.id ?? '').trim()
  const objective = String(raw.objective ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000)
  const status = raw.status
  if (!id || !objective) return undefined
  if (status !== 'pursuing' && status !== 'paused' && status !== 'achieved' && status !== 'blocked') return undefined
  const turns = typeof raw.turns === 'number' && Number.isFinite(raw.turns) ? Math.max(0, Math.floor(raw.turns)) : 0
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 4000) : ''
  return { id, objective, status, turns, ...(summary ? { summary } : {}) }
}

/** 会话级覆盖配置；未设字段回落到全局 chat-config。 */
export interface SessionConfig {
  /** 侧栏显示名；未设则仍用最近 user/message 推导 */
  title?: string
  provider?: 'deepseek' | 'openai' | 'anthropic'
  model?: string
  systemPrompt?: string
  agentMode?: 'standard' | 'minimal' | 'file'
  /** /goal 挂上的会话目标；与极简/标准/数据无关。未完成前自动续跑。 */
  goal?: SessionGoal
  /** 极简模式下常驻额外工具 */
  extraTools?: string[]
  /** 侧栏标签；一条会话可属于多个标签组 */
  tags?: string[]
  /** 侧栏置顶 */
  pinned?: boolean
  /** 记录图标 */
  emoji?: string
  /** 分面 */
  facet?: { tags: string[]; values: Record<string, Record<string, unknown>> }
  createdAt?: number
  /** 右侧检查器页签与各栏库路径，跟这条 session 走。 */
  inspector?: SessionInspectorBind
}

/** 检查器打开的页签和各栏库路径，跟这条 session 走。开合/宽度/跟随只记本机。 */
export type SessionInspectorBind = {
  tab?: string
  opened?: string[]
  dbPaths?: Record<string, string>
}

const INSPECTOR_OPENED_MAX = 24
const INSPECTOR_DB_PATHS_MAX = 32

function isInspectorDbPath(value: string) {
  return value === '/database' || value.startsWith('/database/')
}

export function normalizeInspectorBind(value: unknown): SessionInspectorBind | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const next: SessionInspectorBind = {}
  if (typeof raw.tab === 'string') next.tab = raw.tab.trim().slice(0, 160)
  if (Array.isArray(raw.opened)) {
    next.opened = [...new Set(raw.opened.map((item) => String(item).trim()).filter(Boolean))].slice(0, INSPECTOR_OPENED_MAX)
  }
  if (raw.dbPaths && typeof raw.dbPaths === 'object' && !Array.isArray(raw.dbPaths)) {
    const dbPaths: Record<string, string> = {}
    for (const [paneId, path] of Object.entries(raw.dbPaths as Record<string, unknown>)) {
      const id = String(paneId).trim()
      const stored = String(path ?? '').trim()
      if (!id || !isInspectorDbPath(stored)) continue
      dbPaths[id] = stored
      if (Object.keys(dbPaths).length >= INSPECTOR_DB_PATHS_MAX) break
    }
    next.dbPaths = dbPaths
  }
  return Object.keys(next).length ? next : undefined
}

export function mergeInspectorBind(
  base: SessionInspectorBind | undefined,
  patch: SessionInspectorBind,
): SessionInspectorBind | undefined {
  const next: SessionInspectorBind = {}
  if (typeof base?.tab === 'string') next.tab = base.tab
  if (Array.isArray(base?.opened)) next.opened = [...base.opened]
  if (base?.dbPaths) next.dbPaths = { ...base.dbPaths }
  if (typeof patch.tab === 'string') next.tab = patch.tab.trim().slice(0, 160)
  if (Array.isArray(patch.opened)) {
    next.opened = [...new Set(patch.opened.map((item) => String(item).trim()).filter(Boolean))].slice(0, INSPECTOR_OPENED_MAX)
  }
  if (patch.dbPaths) {
    const dbPaths = normalizeInspectorBind({ dbPaths: patch.dbPaths })?.dbPaths
    if (dbPaths) next.dbPaths = dbPaths
    else delete next.dbPaths
  }
  return Object.keys(next).length ? next : undefined
}

export function normalizeSessionConfig(value: unknown): SessionConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const next: SessionConfig = {}
  if (typeof raw.title === 'string' && raw.title.trim()) next.title = raw.title.trim().slice(0, 80)
  if (raw.provider === 'deepseek' || raw.provider === 'openai' || raw.provider === 'anthropic') next.provider = raw.provider
  if (typeof raw.model === 'string' && raw.model.trim()) next.model = raw.model.trim()
  if (typeof raw.systemPrompt === 'string') next.systemPrompt = raw.systemPrompt
  if (raw.agentMode === 'minimal' || raw.agentMode === 'file') next.agentMode = raw.agentMode
  if (raw.agentMode === 'standard' || raw.agentMode === 'create') next.agentMode = 'standard'
  const goal = normalizeSessionGoal(raw.goal)
  if (goal) next.goal = goal
  if (Array.isArray(raw.extraTools)) {
    next.extraTools = [...new Set(raw.extraTools.map((name) => String(name).trim()).filter(Boolean))]
  }
  if (Array.isArray(raw.tags)) {
    next.tags = [...new Set(raw.tags.map((name) => String(name).trim()).filter(Boolean))].slice(0, 24)
  }
  if (typeof raw.pinned === 'boolean') next.pinned = raw.pinned
  if (typeof raw.emoji === 'string') next.emoji = raw.emoji
  if (typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) && raw.createdAt > 0) next.createdAt = raw.createdAt
  if (raw.facet && typeof raw.facet === 'object' && !Array.isArray(raw.facet)) {
    const rec = raw.facet as Record<string, unknown>
    const tags = Array.isArray(rec.tags) ? [...new Set(rec.tags.map((item) => String(item).trim()).filter(Boolean))] : []
    const values: Record<string, Record<string, unknown>> = {}
    if (rec.values && typeof rec.values === 'object' && !Array.isArray(rec.values)) {
      for (const [key, bag] of Object.entries(rec.values as Record<string, unknown>)) {
        if (bag && typeof bag === 'object' && !Array.isArray(bag)) values[key] = { ...bag }
      }
    }
    next.facet = { tags, values }
  }
  const inspector = normalizeInspectorBind(raw.inspector)
  if (inspector) next.inspector = inspector
  return Object.keys(next).length ? next : undefined
}

export function mergeSessionConfig(
  base: SessionConfig | undefined,
  patch: SessionConfig & {
    title?: string | null
    systemPrompt?: string | null
    inspector?: SessionInspectorBind | null
    goal?: SessionGoal | null
  },
): SessionConfig | undefined {
  const next: SessionConfig = { ...(base ?? {}) }
  if ('title' in patch) {
    if (patch.title == null || !String(patch.title).trim()) delete next.title
    else next.title = String(patch.title).trim().slice(0, 80)
  }
  if (patch.provider === 'deepseek' || patch.provider === 'openai' || patch.provider === 'anthropic') next.provider = patch.provider
  if (typeof patch.model === 'string') {
    if (!patch.model.trim()) delete next.model
    else next.model = patch.model.trim()
  }
  if ('systemPrompt' in patch) {
    if (patch.systemPrompt == null) delete next.systemPrompt
    else next.systemPrompt = String(patch.systemPrompt)
  }
  if (patch.agentMode === 'minimal' || patch.agentMode === 'file') next.agentMode = patch.agentMode
  if (patch.agentMode === 'standard' || patch.agentMode === 'create') next.agentMode = 'standard'
  if ('goal' in patch) {
    if (patch.goal == null) delete next.goal
    else {
      const goal = normalizeSessionGoal(patch.goal)
      if (goal) next.goal = goal
      else delete next.goal
    }
  }
  if (Array.isArray(patch.extraTools)) {
    next.extraTools = [...new Set(patch.extraTools.map((name) => String(name).trim()).filter(Boolean))]
  }
  if (Array.isArray(patch.tags)) {
    const tags = [...new Set(patch.tags.map((name) => String(name).trim()).filter(Boolean))].slice(0, 24)
    if (tags.length) next.tags = tags
    else delete next.tags
  }
  if (typeof patch.pinned === 'boolean') {
    if (patch.pinned) next.pinned = true
    else delete next.pinned
  }
  if ('emoji' in patch) {
    if (patch.emoji == null || !String(patch.emoji)) delete next.emoji
    else next.emoji = String(patch.emoji)
  }
  if ('facet' in patch) {
    if (patch.facet == null) delete next.facet
    else next.facet = patch.facet
  }
  if (typeof patch.createdAt === 'number' && Number.isFinite(patch.createdAt) && patch.createdAt > 0) {
    next.createdAt = patch.createdAt
  }
  if ('inspector' in patch) {
    if (patch.inspector == null) delete next.inspector
    else {
      const incoming = normalizeInspectorBind(patch.inspector) ?? patch.inspector
      const inspector = mergeInspectorBind(next.inspector, incoming)
      if (inspector) next.inspector = inspector
      else delete next.inspector
    }
  }
  return Object.keys(next).length ? next : undefined
}

export interface SessionRecord {
  id: string
  version: number
  events: SessionEvent[]
  project?: SessionProject
  mascot?: SessionMascot
  config?: SessionConfig
}

/** 侧栏列表用：不必加载整段 events。 */
export interface SessionSummary {
  id: string
  version: number
  eventCount: number
  title: string
  updatedAt: number
  /** 最近一条 user/message 或 assistant/message 的时间。工具和流式片段不算。 */
  lastMessageAt?: number
  project?: SessionProject
  mascot?: SessionMascot
  config?: SessionConfig
}

/** 侧栏排序用：只认发出的消息，忽略工具、步骤和流式片段。 */
export function lastSpokenAt(events: SessionEvent[]): number {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type === 'user/message' || event?.type === 'assistant/message') return event.ts
  }
  return 0
}

export function deriveEventTitle(events: SessionEvent[], fallbackId: string): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type === 'user/message' && event.text.trim()) return event.text.slice(0, 48)
  }
  return fallbackId.slice(0, 8)
}

export function sessionDisplayTitle(record: {
  id: string
  events: SessionEvent[]
  config?: SessionConfig
  mascot?: SessionMascot
}): string {
  const named = record.config?.title?.trim()
  if (named) return named.slice(0, 80)
  const fromChat = deriveEventTitle(record.events, '')
  if (fromChat) return fromChat
  if (record.mascot) return nameFromSessionMascot(record.mascot)
  return record.id.slice(0, 8)
}

export interface SessionStore {
  load(id: string): Promise<SessionRecord | undefined>
  save(record: SessionRecord): Promise<void>
  list(): Promise<string[]>
  listSummaries(): Promise<SessionSummary[]>
  delete(id: string): Promise<boolean>
}
