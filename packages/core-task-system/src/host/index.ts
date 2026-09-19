import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { dataHome, dataPath, openAndMigrateBiu, readEditorContent, writeEditorContent } from '@biu/host-plugin-loader/data-dir'
import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import { emptySchemaValue, normalizeSchemaValue, type SchemaFieldValue } from '@biu/type-file-system'
import { startTaskClock } from './clock.ts'
import { tasksCollection } from './collection.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync
type SQLInputValue = import('node:sqlite').SQLInputValue

export type TaskStatus = 'todo' | 'doing' | 'done' | 'failed'
export type TaskPriority = 'low' | 'med' | 'high'
export type TaskDifficulty = 'low' | 'med' | 'high'
export type TaskActorKind = 'user' | 'agent'

export type TaskActor = {
  kind: TaskActorKind
  sessionId?: string
  name: string
  mascot?: { shape: string; color: string; eye?: number }
}

export type TaskExecution = {
  status: 'idle' | 'running' | 'unassigned'
  reason?: string
  turn: number | null
  assistantText: string
  updatedAt: number
}

/** 一次消费额度（input/output/cacheRead/total，单位 token）。与任务面板 .traj-usage 对齐。 */
export type TaskUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
}

/** agent 通过 task_report 主动提交的一条执行报告 */
export type TaskReport = {
  sessionId: string
  sessionName?: string
  turn: number | null
  status: 'doing' | 'done'
  note?: string
  ts: number
  /** 该 report 所在（session, turn）当回合消耗的固化解像：task_report 落库时固化，删 session 也不丢。 */
  usage?: TaskUsage
}

/** trigger 调度状态机：idle → pending → delivered → done（周期任务下轮重置回 idle） */
export type TaskTriggerState = 'idle' | 'pending' | 'delivered' | 'done' | 'cancelled'

/**
 * 任务统一自动触发配置。三种触发源共用：
 *  - cron: 定时 cron 表达式（标准 5 字段：分 时 日 月 周）
 *  - at:   特定时间戳（一次性）
 *  - on:   自动触发事件（依赖完成 dep:done / 回合结束 turn:end 等）
 */
export type TaskTrigger = {
  enabled: boolean
  cron: string | null
  at: number | null
  on: string[]
  state: TaskTriggerState
  lastRun: number | null
}

const TRIGGER_STATES = new Set<TaskTriggerState>(['idle', 'pending', 'delivered', 'done', 'cancelled'])
const TRIGGER_ON_EVENTS = new Set<string>(['dep:done', 'turn:end'])

export function defaultTrigger(): TaskTrigger {
  return { enabled: false, cron: null, at: null, on: [], state: 'idle', lastRun: null }
}

export function normalizeTrigger(value: unknown): TaskTrigger {
  const d = defaultTrigger()
  if (!value || typeof value !== 'object') return d
  const raw = value as Record<string, unknown>
  return {
    enabled: raw.enabled === true,
    cron: typeof raw.cron === 'string' && /^[0-9*,/\- ?]+$/.test(raw.cron.trim()) ? raw.cron.trim() : null,
    at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? Number(raw.at) : null,
    on: Array.isArray(raw.on)
      ? [...new Set((raw.on as unknown[]).map((e) => String(e)).filter((e) => TRIGGER_ON_EVENTS.has(e)))]
      : [],
    state: TRIGGER_STATES.has(raw.state as TaskTriggerState) ? (raw.state as TaskTriggerState) : 'idle',
    lastRun: typeof raw.lastRun === 'number' && Number.isFinite(raw.lastRun) ? Number(raw.lastRun) : null,
  }
}

export type TaskRow = {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  /** 难度（高/中/低） */
  difficulty: TaskDifficulty
  dueAt: number | null
  /** 任务描述 */
  description: string
  /** 备忘 */
  notes: string
  /** 归属项目（可为空） */
  project: string | null
  /** 标签（类型/性质） */
  tags: string[]
  /** 父任务 id（树：最大 MAX_DEPTH 层） */
  parentId: string | null
  /** 依赖的任务 id 列表（DAG：无环） */
  dependsOn: string[]
  /** 树深度（根=0） */
  depth: number
  /** 阻塞状态（派生）：todo 且存在未完成的依赖任务 */
  blocked?: boolean
  /** 阻塞来源任务 id（派生）：哪些未完成的依赖（含递归）阻塞了它 */
  blockedBy?: string[]
  /** report 中 done 的次数（派生） */
  doneCount?: number
  sort: number
  emoji: string
  facet: SchemaFieldValue
  createdAt: number
  updatedAt: number
  creator: TaskActor
  assignee: TaskActor | null
  assignedAt: number | null
  /** agent 通过 task_report 提交的执行报告历史 */
  reports?: TaskReport[]
  /** 列表接口按需附带：优先从 reports 派生，无 reports 时才从事件推导 */
  execution?: TaskExecution
  /** 本任务持久化消耗：由各 report.usage 聚合（后端在 present 时固化，删 session 不丢）。 */
  usage?: TaskUsage
  /** 本任务总消耗 token（= usage.totalTokens），方便前端/列表直接展示。 */
  totalTokens?: number
  /** 自动触发配置（定时/特定时间/事件）。source 为 null 时自动触发不开启。 */
  trigger?: TaskTrigger
  /** 下次触发时间戳（派生）：当前状态 idle/pending 且有命中条件时计算。 */
  nextTriggerAt?: number | null
  /** 进度汇报提醒间隔（秒）。派发后若超过该时长未 report，向执行会话追问进展。默认 60。 */
  reportIntervalSec: number
  /** 上次进度追问时间戳（ms），用于追问冷却（冷却窗口=reportIntervalSec）。 */
  lastReportPromptAt: number | null
  /** 自上次汇报以来已追问次数。达到 MAX_REPORT_PROMPTS 后停止，避免把执行会话问死。 */
  reportPromptCount: number
}

export type TaskCreateInput = {
  title: string
  status?: TaskStatus
  priority?: TaskPriority
  difficulty?: TaskDifficulty
  assignee?: TaskActor | null
  assigneeSessionId?: string
  dueAt?: number | null
  description?: string
  notes?: string
  creator?: TaskActor
  project?: string | null
  tags?: string[]
  parentId?: string | null
  dependsOn?: string[]
  trigger?: Partial<TaskTrigger>
  /** 进度汇报提醒间隔（秒），默认 60。 */
  reportIntervalSec?: number
  emoji?: string
  facet?: SchemaFieldValue
}

export type TaskUpdateInput = Partial<{
  title: string
  status: TaskStatus
  priority: TaskPriority
  difficulty: TaskDifficulty
  assignee: TaskActor | null
  assigneeSessionId: string | null
  creator: TaskActor
  creatorSessionId: string | null
  dueAt: number | null
  description: string
  notes: string
  sort: number
  project: string | null
  tags: string[]
  parentId: string | null
  dependsOn: string[]
  trigger: Partial<TaskTrigger>
  /** 进度汇报提醒间隔（秒），默认 60。 */
  reportIntervalSec: number
  /** 上次进度追问时间戳（ms），仅供内部监测更新。 */
  lastReportPromptAt: number | null
  /** 自上次汇报以来已追问次数。 */
  reportPromptCount: number
  emoji: string
  facet: SchemaFieldValue
}>

export type TaskListFilter = {
  status?: TaskStatus
  q?: string
  /** 精确过滤创建者（creator sessionId，用于 Live 派工统计） */
  creatorSessionId?: string
}

type SessionEventLite = {
  type: string
  text?: string
  seq?: number
  turn?: number
  reason?: string
  ts?: number
}

type SessionPeek = {
  id: string
  config?: { title?: string }
  mascot?: { shape: string; color: string; eye?: number }
  events?: SessionEventLite[]
}

type HostCtx = Context & {
  http: {
    route: (
      method: string,
      pattern: string,
      handler: (route: {
        params: Record<string, string>
        query: URLSearchParams
        json: <T = unknown>() => Promise<T>
        send: (status: number, body: unknown) => void
      }) => void | Promise<void>,
    ) => unknown
    broadcast: (type: string, payload: unknown) => void
  }
  hub: {
    register: (page: {
      id: string
      title: string
      subtitle: string
      plugin: string
      kind: string
    }) => unknown
  }
  tools: {
    register: (spec: {
      name: string
      description: string
      parameters: Record<string, unknown>
      execute: (args: Record<string, unknown>) => unknown
    }) => unknown
  }
  sessions?: {
    peek: (id: string) => SessionPeek | undefined
    get?: (id: string) => Promise<SessionPeek | undefined>
    /** 派发消息（与前端 sendMessage 同语义）：wake 优先，目标忙碌且已有 wake 排队时后端自动退化为 inject。wait=false 时入队后立即返回。 */
    sendMessage: (
      id: string,
      text: string,
      opts?: { wait?: boolean; sender?: { type: 'session'; sessionId: string } },
    ) => Promise<{ text: string; steps: unknown[] }>
  }
}

const STATUSES = new Set<TaskStatus>(['todo', 'doing', 'done', 'failed'])
const PRIORITIES = new Set<TaskPriority>(['low', 'med', 'high'])
const DIFFICULTIES = new Set<TaskDifficulty>(['low', 'med', 'high'])

function now() {
  return Date.now()
}

function nextId() {
  return `task_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 树的嵌套最大深度（根=0，叶子到 MAX_DEPTH 为止） */
const MAX_DEPTH = 3

/**
 * 判断依赖链是否全部完成（递归，沿 dependsOn 向下）。
 * seen 用于防御环（create/update 已防环，这里作为兜底）。
 */
export function depsSatisfied(row: TaskRow, getById: (id: string) => TaskRow | undefined, seen: Set<string> = new Set()): boolean {
  for (const depId of row.dependsOn ?? []) {
    if (seen.has(depId)) continue
    seen.add(depId)
    const dep = getById(depId)
    if (!dep || dep.status !== 'done') return false
    if (!depsSatisfied(dep, getById, seen)) return false
  }
  return true
}

/** 派生阻塞：任务处于待办状态 且 存在未完成的依赖 → true */
export function computeBlocked(row: TaskRow, getById: (id: string) => TaskRow | undefined): boolean {
  if (row.status !== 'todo') return false
  return !depsSatisfied(row, getById)
}

/**
 * 计算阻塞该任务的具体来源任务 id 列表（递归沿 dependsOn 收集所有未完成的依赖及其依赖）。
 * 返回顺序即阻塞链从近到远。
 */
export function computeBlockedBy(row: TaskRow, getById: (id: string) => TaskRow | undefined, seen: Set<string> = new Set()): string[] {
  if (row.status !== 'todo') return []
  const out: string[] = []
  for (const depId of row.dependsOn ?? []) {
    if (seen.has(depId)) continue
    const dep = getById(depId)
    if (!dep) {
      out.push(depId)
      continue
    }
    if (dep.status !== 'done') {
      out.push(depId)
      seen.add(depId)
      // 递归：依赖任务若也被阻塞（它的依赖未完成），一并加入，说明阻塞链路
      for (const sub of computeBlockedBy(dep, getById, seen)) {
        if (!out.includes(sub)) out.push(sub)
      }
    }
  }
  return out
}

/**
 * 极简 cron 解析：把标准 5 字段（分 时 日 月 周）或 6 字段（秒 分 时 日 月 周）cron
 * 表达式解析为「在某时间点是否命中的谓词」。
 * 字段（自前向后）：秒(0-59，仅 6 字段) 分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-7，0 与 7 都表示周日)。
 * 支持：* 号、a,b 列表、a-b 区间、星号斜杠 n 步进。日与周都受限时按 GNU 语义（取并集）。
 * 不解析 L 与 W、井号 等扩展。
 * 5 字段 → 分钟/整分命中谓词（秒不参与）；6 字段 → 秒级命中谓词。
 */
const CRON_FIELD_RANGES: [number, number][] = [
  [0, 59], // 秒（仅 6 字段 cron 使用）
  [0, 59], // 分
  [0, 23], // 时
  [1, 31], // 日
  [1, 12], // 月
  [0, 7], // 周
]

export type CronMatch = {
  hasSeconds: boolean
  /** 判断某日期时刻是否命中（秒级 cron 时 seconds 参与判定）。 */
  (date: Date): boolean
}

export function parseCron(expr: string): CronMatch | null {
  if (!expr || typeof expr !== 'string') return null
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) return null
  const hasSeconds = parts.length === 6
  // 内部统一字段顺序：partIdx → [秒?, 分, 时, 日, 月, 周]，其中秒仅 6 字段时有。
  // fields 数组固定 6 个槽位（秒位可能为空）。
  const fields: (Set<number> | null)[] = [null, null, null, null, null, null]
  const wilds: (boolean | null)[] = [null, null, null, null, null, null]
  // 秒字段（仅 6 字段存在）占用 CRON_FIELD_RANGES[0]
  const parseFieldRange = (idx: number): { set: Set<number>; isWild: boolean } | null => {
    const [min, max] = CRON_FIELD_RANGES[idx]!
    const token = parts[hasSeconds ? idx : idx - 1]!
    const set = new Set<number>()
    const frags = token.split(',')
    let ok = true
    let isWild = frags.length === 1 && /^\*(\/\d+)?$/.test(frags[0]!)
    for (const frag of frags) {
      if (!frag) { ok = false; break }
      let m1: number
      let m2: number
      let step = 1
      const stepMatch = frag.match(/^(.+?)\/(\d+)$/)
      if (stepMatch) {
        const base = stepMatch[1]!
        const st = Number(stepMatch[2])
        if (!Number.isFinite(st) || st <= 0) { ok = false; break }
        step = st
        const sub = base.includes('-') ? base : `${base}-${max}`
        const [a, b] = sub.split('-').map((s) => s.trim())
        m1 = a === '*' ? min : Number(a)
        m2 = b === '*' ? max : Number(b)
        if (!Number.isFinite(m1) || !Number.isFinite(m2)) { ok = false; break }
      } else if (frag.includes('-')) {
        const [a, b] = frag.split('-').map((s) => s.trim())
        m1 = Number(a)
        m2 = Number(b)
        if (!Number.isFinite(m1) || !Number.isFinite(m2)) { ok = false; break }
      } else if (frag === '*') {
        m1 = min
        m2 = max
      } else {
        m1 = Number(frag)
        m2 = Number(frag)
        if (!Number.isFinite(m1)) { ok = false; break }
      }
      for (let v = m1; v <= m2; v += step) {
        set.add(v)
      }
    }
    if (!ok) return null
    return { set, isWild }
  }
  // 解析 6 个槽位（秒可选）
  if (hasSeconds) {
    const s = parseFieldRange(0) // 秒
    if (!s) return null
    fields[0] = s.set
    wilds[0] = s.isWild
  }
  for (let i = 1; i <= 5; i++) {
    // 分=1,时=2,日=3,月=4,周=5 对应 CRON_FIELD_RANGES 索引（周特殊：0/7 允许）
    const f = parseFieldRange(i)
    if (!f) return null
    fields[i] = f.set
    wilds[i] = f.isWild
  }
  const seconds = hasSeconds ? fields[0]! : null
  const minute = fields[1]!
  const hour = fields[2]!
  const dom = fields[3]!
  const month = fields[4]!
  const dowRaw = fields[5]!
  // 周 0/7 归一为 0
  const dow = new Set<number>()
  for (const d of dowRaw) dow.add(d % 7)

  const match = (date: Date): boolean => {
    if (seconds && !seconds.has(date.getSeconds())) return false
    if (!minute.has(date.getMinutes())) return false
    if (!hour.has(date.getHours())) return false
    if (!month.has(date.getMonth() + 1)) return false
    const isDom = dom.has(date.getDate())
    const isDow = dow.has(date.getDay())
    // 日/月通配语义：dom 与 dow 都通配 → 每天；dom 通配且 dow 受限 → 按 dow；
    // dom 受限且 dow 通配 → 按 dom；两者都受限 → 满足其一即可（GNU 并集）。
    const domWild = wilds[3]!
    const dowWild = wilds[5]!
    if (domWild && dowWild) return isDom && isDow
    if (domWild) return isDow
    if (dowWild) return isDom
    return isDom || isDow
  }
  match.hasSeconds = hasSeconds
  return match
}

/** 计算某任务在 now 之后的「下次触发时间戳」。返回 null 表示无启用触发源。 */
export function computeNextTriggerAt(row: { trigger?: TaskTrigger; status?: TaskStatus }, nowTs = Date.now()): number | null {
  const tr = row.trigger
  if (!tr || !tr.enabled) return null
  // at：一次性特定时间（未来）
  if (tr.at != null && tr.at > nowTs) return tr.at
  // cron：在下一次对齐（minute 或 second）内查找；定长扫描（防年跨度，扫描范围约一年）
  if (tr.cron) {
    const match = parseCron(tr.cron)
    if (match) {
      // 6 字段秒级 cron：按 1000ms 步进扫描（秒级高频，扫描未来 24h 内即可）
      if (match.hasSeconds) {
        const secTs = Math.floor(nowTs / 1000) * 1000
        for (let step = 0; step < 24 * 3600; step++) {
          const t = new Date(secTs + step * 1000)
          if (match(t)) return t.getTime()
        }
        return null
      }
      // 5 字段分钟级 cron：按 60000ms 步进扫描（扫描范围约一年）
      const minuteTs = Math.floor(nowTs / 60_000) * 60_000
      for (let step = 0; step < 366 * 24 * 60; step++) {
        const t = new Date(minuteTs + step * 60_000)
        if (match(t)) return t.getTime()
      }
    }
  }
  return null
}

function asStatus(value: unknown, fallback: TaskStatus = 'todo'): TaskStatus {
  const raw = String(value ?? fallback)
  return STATUSES.has(raw as TaskStatus) ? (raw as TaskStatus) : fallback
}

function asPriority(value: unknown, fallback: TaskPriority = 'med'): TaskPriority {
  const raw = String(value ?? fallback)
  return PRIORITIES.has(raw as TaskPriority) ? (raw as TaskPriority) : fallback
}

function asDifficulty(value: unknown, fallback: TaskDifficulty = 'med'): TaskDifficulty {
  const raw = String(value ?? fallback)
  return DIFFICULTIES.has(raw as TaskDifficulty) ? (raw as TaskDifficulty) : fallback
}

function normalizeActor(value: unknown, fallbackName = '用户'): TaskActor | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { kind: 'user', name: name.slice(0, 80) } : null
  }
  if (typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const kind: TaskActorKind = raw.kind === 'agent' ? 'agent' : 'user'
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : kind === 'agent'
        ? 'Agent'
        : fallbackName
  const sessionId =
    typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId.trim() : undefined
  let mascot: TaskActor['mascot']
  if (raw.mascot && typeof raw.mascot === 'object') {
    const m = raw.mascot as Record<string, unknown>
    if (typeof m.shape === 'string' && typeof m.color === 'string') {
      mascot = {
        shape: m.shape,
        color: m.color,
        ...(typeof m.eye === 'number' ? { eye: m.eye } : {}),
      }
    }
  }
  return {
    kind,
    name,
    ...(sessionId ? { sessionId } : {}),
    ...(mascot ? { mascot } : {}),
  }
}

function actorFromSession(record: SessionPeek): TaskActor {
  let name = record.config?.title?.trim() ?? ''
  if (!name && Array.isArray(record.events)) {
    for (let i = record.events.length - 1; i >= 0; i -= 1) {
      const event = record.events[i]
      if (event?.type === 'user/message' && typeof event.text === 'string' && event.text.trim()) {
        name = event.text.trim().slice(0, 48)
        break
      }
    }
  }
  if (!name) name = record.id.slice(0, 8)
  return {
    kind: 'agent',
    sessionId: record.id,
    name,
    ...(record.mascot ? { mascot: record.mascot } : {}),
  }
}

async function resolveCreator(host: HostCtx, explicit?: TaskActor): Promise<TaskActor> {
  if (explicit) return normalizeActor(explicit, '用户') ?? { kind: 'user', name: '用户' }
  const sessionId = currentSessionId()
  // 只要有调用方 session，就以该 agent 为创建人；不因 sessions service 未就绪而回退成"用户"。
  if (sessionId) {
    if (host.sessions) {
      const peeked = host.sessions.peek(sessionId) ?? (await host.sessions.get?.(sessionId))
      if (peeked) return actorFromSession(peeked)
    }
    return { kind: 'agent', sessionId, name: sessionId.slice(0, 8) }
  }
  return { kind: 'user', name: '用户' }
}

async function resolveAssignee(
  host: HostCtx,
  input: { assignee?: unknown; assigneeSessionId?: string | null },
): Promise<{ assignee: TaskActor | null; touchAssignedAt: boolean }> {
  if ('assigneeSessionId' in input) {
    const sid = input.assigneeSessionId?.trim()
    if (!sid) return { assignee: null, touchAssignedAt: true }
    if (host.sessions) {
      const peeked = host.sessions.peek(sid) ?? (await host.sessions.get?.(sid))
      if (peeked) return { assignee: actorFromSession(peeked), touchAssignedAt: true }
    }
    return { assignee: { kind: 'agent', sessionId: sid, name: sid.slice(0, 8) }, touchAssignedAt: true }
  }
  if ('assignee' in input) {
    const assignee = await coerceAssigneeArg(host, input.assignee)
    return { assignee, touchAssignedAt: true }
  }
  return { assignee: null, touchAssignedAt: false }
}

/**
 * 工具 / API 入参归一：
 * - null / '' → 清空
 * - string 人名 → user
 * - string sessionId / UUID → agent（查 sessions）
 * - JSON 字符串对象 / actor 对象 → agent|user（带 sessionId 时补全 mascot/name）
 */
export async function coerceAssigneeArg(host: HostCtx, value: unknown): Promise<TaskActor | null> {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return coerceAssigneeArg(host, JSON.parse(trimmed))
      } catch {
        /* fall through as plain name */
      }
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(trimmed) || (trimmed.length >= 20 && !/\s/.test(trimmed))) {
      const resolved = await resolveAssignee(host, { assigneeSessionId: trimmed })
      return resolved.assignee
    }
    return { kind: 'user', name: trimmed.slice(0, 80) }
  }
  if (typeof value !== 'object') return null
  // 避免 String(object) → "[object Object]"
  const actor = normalizeActor(value)
  if (!actor) return null
  if (actor.sessionId) {
    if (host.sessions) {
      const peeked = host.sessions.peek(actor.sessionId) ?? (await host.sessions.get?.(actor.sessionId))
      if (peeked) {
        const fromSession = actorFromSession(peeked)
        return {
          ...fromSession,
          ...(actor.name && actor.name !== 'Agent' ? { name: actor.name } : {}),
          ...(actor.mascot ? { mascot: actor.mascot } : {}),
        }
      }
    }
    return {
      kind: 'agent',
      sessionId: actor.sessionId,
      name: actor.name || actor.sessionId.slice(0, 8),
      ...(actor.mascot ? { mascot: actor.mascot } : {}),
    }
  }
  return actor
}

const ASSIGNEE_PARAM = {
  description:
    '分配人。写执行人字段：sessionId 字符串、或 actor 对象 { kind, sessionId?, name?, mascot? }；空则清空。',
} as const

const ASSIGNEE_SESSION_PARAM = {
  type: ['string', 'null'] as const,
  description: '分配给某 session（Agent）；null 清空。与 assignee 二选一，优先本字段。',
}

function actorsEqual(a: TaskActor | null, b: TaskActor | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.kind === b.kind && a.name === b.name && (a.sessionId ?? '') === (b.sessionId ?? '')
}

/**
 * 追加在 task_deliver 默认派工消息末尾的协作规范：引导执行 agent 用本系统任务体系做后续派发与协作，
 * 而不是绕过任务系统直接 dispatch 子 session。让需求可跟踪、进度可回传、派发人收到回执。
 */
export const DELIVER_COLLABORATION_NOTE = [
  '',
  '【协作规范】请优先使用本系统的任务体系进行后续任务派发与协作：',
  '新需求请用 db_create 在 /tasks 批量建记录（records 数组）、用 db_action path=/tasks/<id> action=deliver 派工、action=report 上报进度。',
  '这样需求可被跟踪、进度可回传、派发人会收到回执。避免绕过任务系统直接 dispatch 子 session。',
].join('\n')

/**
 * 生成 task_deliver 派工消息的默认文案：把任务关键信息整理成一段给执行 agent 的指令。
 * 末尾固定追加【协作规范】段落，引导执行 agent 优先走任务体系。自定义 text 时不经过本函数。
 */
export function buildDeliverText(row: TaskRow): string {
  const lines: string[] = []
  lines.push(`【任务派发】${row.title}`)
  if (row.status) lines.push(`状态：${row.status}`)
  if (row.priority) lines.push(`优先级：${row.priority}`)
  if (row.difficulty) lines.push(`难度：${row.difficulty}`)
  if (row.dueAt) lines.push(`截止：${new Date(row.dueAt).toLocaleString()}`)
  if (row.project) lines.push(`项目：${row.project}`)
  if (row.tags?.length) lines.push(`标签：${row.tags.join(', ')}`)
  if (row.description?.trim()) lines.push(`\n描述：\n${row.description.trim()}`)
  if (row.notes?.trim()) lines.push(`\n备忘：\n${row.notes.trim()}`)
  lines.push(`\n任务 id：${row.id}`)
  lines.push(DELIVER_COLLABORATION_NOTE)
  return lines.join('\n')
}

/**
 * task_report 上报后，把子 agent（上报方 session）的进度/info 返回给"分配任务的人"（任务的 creator session）。
 * 与前端 sendMessage 同语义：wake 优先，目标忙碌且已有 wake 排队时后端自动退回为 inject（并入下一回合），
 * 不阻塞子 agent 当前回合（wait:false 入队后立即返回）。若 creator 无 session（如纯用户创建的），则跳过。
 */
export async function reportBackToCreator(
  host: HostCtx,
  row: TaskRow,
  report: TaskReport,
): Promise<{ ok: boolean; reason?: string; sessionId?: string }> {
  const creator = row.creator
  const assignerSessionId = creator?.kind === 'agent' ? creator.sessionId : undefined
  if (!assignerSessionId) {
    return { ok: false, reason: 'creator 无 session，无需回传' }
  }
  if (!host.sessions?.sendMessage) {
    return { ok: false, reason: 'sessions.sendMessage 不可用' }
  }
  // 不要回传给上报者自己（分配人不能是执行人自己）
  if (assignerSessionId === report.sessionId) {
    return { ok: false, reason: '分配人即上报人，无需回传' }
  }
  const who = report.sessionName || report.sessionId.slice?.(0, 8) || report.sessionId
  const statusLabel = report.status === 'done' ? '✅ 已完成' : '🔵 进行中'
  const text = [
    `【任务进度回传】${row.title}`,
    `任务 id：${row.id}`,
    `执行 agent：${who}`,
    `状态：${statusLabel}`,
    ...(report.turn != null ? [`回合：${report.turn}`] : []),
    ...(report.note ? [`说明：${report.note}`] : []),
  ].join('\n')
  try {
    const sender = { type: 'session' as const, sessionId: report.sessionId }
    // 和前端 sendMessage 同一接口：wake 优先，忙碌且已有 wake 排队时自动退化为 inject
    await host.sessions.sendMessage(assignerSessionId, text, { wait: false, sender })
    return { ok: true, sessionId: assignerSessionId }
  } catch (error) {
    return { ok: false, reason: String(error) }
  }
}

function mapRow(row: Record<string, unknown>): TaskRow {
  let creator: TaskActor = { kind: 'user', name: '用户' }
  if (typeof row.creator_json === 'string' && row.creator_json) {
    try {
      creator = normalizeActor(JSON.parse(row.creator_json), '用户') ?? creator
    } catch {
      /* ignore */
    }
  }

  let assignee: TaskActor | null = null
  if (typeof row.assignee_json === 'string' && row.assignee_json) {
    try {
      assignee = normalizeActor(JSON.parse(row.assignee_json))
    } catch {
      /* ignore */
    }
  } else if (typeof row.assignee === 'string' && row.assignee.trim()) {
    assignee = { kind: 'user', name: row.assignee.trim() }
  }

  const assignedAt =
    row.assigned_at == null || row.assigned_at === ''
      ? assignee
        ? Number(row.created_at ?? 0) || null
        : null
      : Number(row.assigned_at)

  const reports: TaskReport[] = []
  if (typeof row.reports_json === 'string' && row.reports_json) {
    try {
      const parsed = JSON.parse(row.reports_json)
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (r && typeof r === 'object' && typeof r.sessionId === 'string') {
            const report: TaskReport = {
              sessionId: String(r.sessionId),
              ...(typeof r.sessionName === 'string' ? { sessionName: r.sessionName } : {}),
              turn: typeof r.turn === 'number' ? r.turn : null,
              status: r.status === 'doing' || r.status === 'done' ? r.status : 'doing',
              ...(typeof r.note === 'string' ? { note: r.note } : {}),
              ts: typeof r.ts === 'number' ? r.ts : Number(row.updated_at ?? 0),
            }
            if (r.usage && typeof r.usage === 'object') {
              const u = r.usage as Record<string, unknown>
              if (typeof u.inputTokens === 'number' && typeof u.outputTokens === 'number') {
                const inputTokens = Number(u.inputTokens) || 0
                const outputTokens = Number(u.outputTokens) || 0
                const cacheReadTokens = Number(u.cacheReadTokens) || 0
                report.usage = {
                  inputTokens,
                  outputTokens,
                  cacheReadTokens,
                  totalTokens: Number(u.totalTokens) || inputTokens + outputTokens,
                }
              }
            }
            reports.push(report)
          }
        }
      }
    } catch {
      /* ignore malformed reports */
    }
  }

  const tags: string[] = []
  if (typeof row.tags_json === 'string' && row.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json)
      if (Array.isArray(parsed)) {
        for (const tag of parsed) {
          if (typeof tag === 'string' && tag.trim()) {
            const t = tag.trim()
            if (!tags.includes(t)) tags.push(t)
          }
        }
      }
    } catch {
      /* ignore malformed tags */
    }
  }

  const dependsOn: string[] = []
  if (typeof row.depends_on === 'string' && row.depends_on) {
    try {
      const parsed = JSON.parse(row.depends_on)
      if (Array.isArray(parsed)) {
        for (const d of parsed) {
          if (typeof d === 'string' && d && !dependsOn.includes(d)) dependsOn.push(d)
        }
      }
    } catch {
      /* ignore malformed depends_on */
    }
  }

  let facet = emptySchemaValue()
  if (typeof row.facet_json === 'string' && row.facet_json) {
    try {
      facet = normalizeSchemaValue(JSON.parse(row.facet_json))
    } catch {
      facet = emptySchemaValue()
    }
  }

  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    status: asStatus(row.status),
    priority: asPriority(row.priority),
    difficulty: asDifficulty(row.difficulty),
    dueAt: row.due_at == null ? null : Number(row.due_at),
    description: String(row.description ?? ''),
    notes: String(row.notes ?? ''),
    project: typeof row.project === 'string' && row.project.trim() ? row.project.trim() : null,
    tags,
    parentId: typeof row.parent_id === 'string' && row.parent_id ? row.parent_id : null,
    dependsOn,
    depth: typeof row.depth === 'number' ? Number(row.depth) : 0,
    sort: Number(row.sort ?? 0),
    emoji: String(row.emoji ?? ''),
    facet,
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    creator,
    assignee,
    assignedAt: assignee ? assignedAt : null,
    reports,
    trigger: (() => {
      if (typeof row.trigger_json === 'string' && row.trigger_json) {
        try {
          return normalizeTrigger(JSON.parse(row.trigger_json))
        } catch {
          /* ignore */
        }
      }
      return undefined
    })(),
    reportIntervalSec: normalizeReportIntervalSec(row.report_interval_sec),
    lastReportPromptAt:
      row.last_report_prompt_at == null || row.last_report_prompt_at === ''
        ? null
        : Number(row.last_report_prompt_at),
    reportPromptCount: Math.max(0, Math.round(Number(row.report_prompt_count) || 0)),
  }
}

/**
 * 从 assignee session 事件流推导执行情况。
 * 只看 turn/start…turn/end；不查询 agents.isBusy（任务层不耦合 agent 运行时）。
 * 已分配但尚无 turn → idle（空窗期由任务自身 status/doing 表达）。
 */
export function deriveExecution(events: SessionEventLite[] | undefined): TaskExecution {
  if (!events?.length) {
    return { status: 'idle', turn: null, assistantText: '', updatedAt: 0 }
  }
  let turn: number | null = null
  let openTurn = false
  let reason: string | undefined
  let assistantText = ''
  const chunks: string[] = []
  for (const event of events) {
    if (event.type === 'turn/start') {
      turn = typeof event.turn === 'number' ? event.turn : turn
      openTurn = true
      reason = undefined
      assistantText = ''
      chunks.length = 0
    } else if (event.type === 'turn/end') {
      turn = typeof event.turn === 'number' ? event.turn : turn
      reason = typeof event.reason === 'string' ? event.reason : undefined
      openTurn = false
    } else if (event.type === 'assistant/message' && typeof event.text === 'string' && event.text.trim()) {
      assistantText = event.text
      chunks.length = 0
    } else if (event.type === 'assistant/chunk' && typeof event.text === 'string') {
      chunks.push(event.text)
    }
  }
  if (!assistantText && chunks.length) assistantText = chunks.join('')
  if (assistantText.length > 240) assistantText = `${assistantText.slice(0, 240)}…`
  const newest = events.at(-1)
  return {
    status: openTurn ? 'running' : 'idle',
    ...(reason ? { reason } : {}),
    turn,
    assistantText,
    updatedAt: typeof newest?.ts === 'number' ? newest.ts : 0,
  }
}

/**
 * 从 agent 通过 task_report 提交的报告历史派生执行状态。
 * 任务当前状态 = 最新一次 report 的 status：
 *  - 最新为 done  -> idle + reason 'complete'（已完成）
 *  - 最新为 doing -> running（进行中）
 *  - 没有 report  -> unassigned？不：任务已分配但 agent 尚未开始，应视为 idle（等进行）。
 * 用最新的 done/doing 判定，后一个 report 天然覆盖前一个状态。
 */
export function deriveExecutionFromReports(reports: TaskReport[] | undefined): TaskExecution {
  if (!reports?.length) {
    return { status: 'idle', turn: null, assistantText: '', updatedAt: 0 }
  }
  const last = reports[reports.length - 1]
  return {
    status: last.status === 'done' ? 'idle' : 'running',
    ...(last.status === 'done' ? { reason: 'complete' } : {}),
    turn: last.turn,
    assistantText: typeof last.note === 'string' && last.note ? last.note.slice(0, 240) : '',
    updatedAt: last.ts,
  }
}

const ZERO_USAGE: TaskUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
}

/** 把一组 usage 相加（input/output/cacheRead/total 各自累加）。 */
export function sumUsageSum(...usages: TaskUsage[]): TaskUsage {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let totalTokens = 0
  for (const u of usages) {
    inputTokens += u.inputTokens
    outputTokens += u.outputTokens
    cacheReadTokens += u.cacheReadTokens
    totalTokens += u.totalTokens
  }
  return { inputTokens, outputTokens, cacheReadTokens, totalTokens }
}

/** 聚合一个任务全部 report 的 usage（同名 session+turn 去重后加总）→ 任务持久消耗。
 *  同一 (session, turn) 取后一次上报（覆盖，避免 peer 反复上报导致重复计费）。 */
export function sumReportUsage(reports: TaskReport[] | undefined): TaskUsage | undefined {
  if (!reports?.length) return undefined
  const byKey = new Map<string, TaskUsage>()
  for (const r of reports) {
    if (!r.usage) continue
    byKey.set(`${r.sessionId}:${r.turn ?? ''}`, r.usage)
  }
  return byKey.size ? sumUsageSum(...byKey.values()) : undefined
}

/** 从 session 事件流计算某 turn 的消耗（assistant/message usage 汇总），纯函数。 */
export function computeTurnUsage(
  events: Array<Record<string, unknown>> | undefined,
  turn: number | null | undefined,
): TaskUsage | undefined {
  if (!events?.length || turn == null) return undefined
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let totalTokens = 0
  let curTurn: number | null = null
  for (const event of events) {
    if (event?.type === 'turn/start' && typeof event.turn === 'number') {
      curTurn = event.turn
    } else if (event?.type === 'assistant/message' && curTurn === turn && event.usage && typeof event.usage === 'object') {
      const u = event.usage as Record<string, unknown>
      const input = Number(u.inputTokens) || 0
      const output = Number(u.outputTokens) || 0
      const cache = Number(u.cacheReadTokens) || 0
      inputTokens += input
      outputTokens += output
      cacheReadTokens += cache
      totalTokens += Number(u.totalTokens) || input + output
    }
  }
  if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0) return undefined
  return { inputTokens, outputTokens, cacheReadTokens, totalTokens }
}

/**
 * 进度超时判定。
 * 距最近一次 report（无 report 时以 assignedAt 为基线）超过 reportIntervalSec、不在冷却窗口内、
 * 且本轮追问次数未达 MAX_REPORT_PROMPTS 时，应再追一次。次数用尽后停，避免把执行会话问死。
 */
export const DEFAULT_REPORT_INTERVAL_SEC = 60
/** 同一段未汇报窗口内最多追问几次。 */
export const MAX_REPORT_PROMPTS = 3

export function normalizeReportIntervalSec(value: unknown, fallback = DEFAULT_REPORT_INTERVAL_SEC): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

export type PromptProgressVerdict = {
  shouldPrompt: boolean
  shouldFail: boolean
  overdueSec: number
  intervalMs: number
}

export function shouldPromptProgress(row: TaskRow, nowTs: number): PromptProgressVerdict {
  const none: PromptProgressVerdict = { shouldPrompt: false, shouldFail: false, overdueSec: 0, intervalMs: 0 }
  if (row.status === 'done' || row.status === 'failed') return none
  if (!row.assignedAt) return none
  if (!row.assignee?.sessionId) return none
  if (row.creator?.kind !== 'agent' || !row.creator.sessionId) return none
  const intervalSec = normalizeReportIntervalSec(row.reportIntervalSec)
  const intervalMs = intervalSec * 1000
  const lastReportTs = row.reports?.length ? row.reports[row.reports.length - 1].ts : row.assignedAt
  const count = Math.max(0, Math.round(Number(row.reportPromptCount) || 0))
  const overdueSec = Math.max(1, Math.floor((nowTs - lastReportTs) / 1000))
  if (count >= MAX_REPORT_PROMPTS) {
    if (row.lastReportPromptAt != null && nowTs - row.lastReportPromptAt < intervalMs) return none
    return { shouldPrompt: false, shouldFail: true, overdueSec, intervalMs }
  }
  if (nowTs - lastReportTs <= intervalMs) return { shouldPrompt: false, shouldFail: false, overdueSec: 0, intervalMs }
  if (row.lastReportPromptAt != null && nowTs - row.lastReportPromptAt < intervalMs) {
    return { shouldPrompt: false, shouldFail: false, overdueSec: 0, intervalMs }
  }
  return { shouldPrompt: true, shouldFail: false, overdueSec, intervalMs }
}

export class TasksService extends Service {
  private db!: DatabaseSync

  constructor(ctx: Context, private dbPath: string) {
    super(ctx, 'tasks')
  }

  open() {
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = openAndMigrateBiu(this.dbPath, { foreignKeys: false })
    return this
  }

  private emitChange(extra: Record<string, unknown> = {}) {
    try {
      const host = this.ctx as HostCtx
      host.http?.broadcast?.('tasks', { ts: now(), ...extra })
    } catch {
      /* host http 未就绪（单测） */
    }
  }

  list(filter: TaskListFilter = {}): TaskRow[] {
    const clauses: string[] = []
    const params: SQLInputValue[] = []
    if (filter.status) {
      clauses.push('status = ?')
      params.push(filter.status)
    }
    if (filter.q?.trim()) {
      clauses.push(
        '(title LIKE ? OR description LIKE ? OR IFNULL(c.body, \'\') LIKE ? OR notes LIKE ? OR assignee LIKE ? OR creator_json LIKE ? OR assignee_json LIKE ?)',
      )
      const like = `%${filter.q.trim()}%`
      params.push(like, like, like, like, like, like, like)
    }
    if (filter.creatorSessionId?.trim()) {
      clauses.push('creator_json LIKE ?')
      params.push(`%${filter.creatorSessionId.trim()}%`)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.db
      .prepare(
        `SELECT tasks.* FROM tasks
         LEFT JOIN editor_content c ON c.collection = '/tasks' AND c.record_id = tasks.id
         ${where} ORDER BY
          CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
          sort DESC, updated_at DESC`,
      )
      .all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => this.withEditorDescription(mapRow(row)))
  }

  get(id: string): TaskRow | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.withEditorDescription(mapRow(row)) : undefined
  }

  private withEditorDescription(row: TaskRow): TaskRow {
    const body = readEditorContent(this.db, '/tasks', row.id)
    return body ? { ...row, description: body } : row
  }

  create(input: TaskCreateInput & { creator: TaskActor; assignee?: TaskActor | null; assignedAt?: number | null }): TaskRow {
    const title = String(input.title ?? '').trim()
    if (!title) throw new Error('title required')
    const id = nextId()
    const ts = now()
    const status = asStatus(input.status)
    const priority = asPriority(input.priority)
    const difficulty = asDifficulty(input.difficulty)
    const dueAt = input.dueAt == null || Number.isNaN(Number(input.dueAt)) ? null : Number(input.dueAt)
    const description = String(input.description ?? '')
    const notes = String(input.notes ?? '')
    const project = typeof input.project === 'string' && input.project.trim() ? input.project.trim() : ''
    const tags = (Array.isArray(input.tags) ? input.tags : []).map((t) => String(t).trim()).filter((t) => t)

    // 树：父任务存在 + 深度不超 MAX_DEPTH；否则抛错
    const parentId = typeof input.parentId === 'string' && input.parentId ? input.parentId : null
    let depth = 0
    if (parentId) {
      const parent = this.get(parentId)
      if (!parent) throw new Error(`unknown parent task: ${parentId}`)
      if (parent.depth + 1 > MAX_DEPTH) throw new Error(`depth exceeds MAX_DEPTH=${MAX_DEPTH}`)
      depth = parent.depth + 1
    }
    const dependsOn = (Array.isArray(input.dependsOn) ? input.dependsOn : [])
      .map((d) => String(d))
      .filter((d) => d && d !== id)

    // source==null 时自动触发不开启（enabled=false），保证无 trigger 的普通任务不被 driver 影响。
    const trigger = normalizeTrigger(input.trigger)

    // 进度汇报提醒间隔（秒）：默认 60；非法值回退默认。
    const reportIntervalSec =
      input.reportIntervalSec == null || Number.isNaN(Number(input.reportIntervalSec)) || Number(input.reportIntervalSec) <= 0
        ? 60
        : Math.round(Number(input.reportIntervalSec))

    const creator = normalizeActor(input.creator, '用户') ?? { kind: 'user', name: '用户' }
    const assignee = input.assignee ? normalizeActor(input.assignee) : null
    const assignedAt = assignee ? (input.assignedAt ?? ts) : null
    const assigneeLabel = assignee?.name ?? ''
    const maxSort = this.db
      .prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM tasks WHERE status = ?')
      .get(status) as { m: number }
    const sort = Number(maxSort?.m ?? 0) + 1
    this.db
      .prepare(
        `INSERT INTO tasks (
          id, title, status, priority, difficulty, assignee, due_at, description, notes, sort,
          created_at, updated_at, creator_json, assignee_json, assigned_at,
          project, tags_json, parent_id, depends_on, depth, trigger_json,
          report_interval_sec, facet_json, emoji
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        title,
        status,
        priority,
        difficulty,
        assigneeLabel,
        dueAt,
        description,
        notes,
        sort,
        ts,
        ts,
        JSON.stringify(creator),
        assignee ? JSON.stringify(assignee) : null,
        assignedAt,
        project,
        JSON.stringify(tags),
        parentId,
        JSON.stringify(dependsOn),
        depth,
        JSON.stringify(trigger),
        reportIntervalSec,
        JSON.stringify(normalizeSchemaValue(input.facet)),
        typeof input.emoji === 'string' ? input.emoji : '',
      )
    writeEditorContent(this.db, '/tasks', id, description)
    this.emitChange()
    return this.get(id)!
  }

  update(id: string, patch: TaskUpdateInput & { assignee?: TaskActor | null; assignedAt?: number | null }): TaskRow {
    const current = this.get(id)
    if (!current) throw new Error('unknown task')
    const title = patch.title != null ? String(patch.title).trim() : current.title
    if (!title) throw new Error('title required')
    const status = patch.status != null ? asStatus(patch.status) : current.status
    const priority = patch.priority != null ? asPriority(patch.priority) : current.priority
    const difficulty = patch.difficulty != null ? asDifficulty(patch.difficulty) : current.difficulty
    const dueAt =
      patch.dueAt === undefined
        ? current.dueAt
        : patch.dueAt == null || Number.isNaN(Number(patch.dueAt))
          ? null
          : Number(patch.dueAt)
    const notes = patch.notes != null ? String(patch.notes) : current.notes
    const description = patch.description != null ? String(patch.description) : current.description
    const project =
      patch.project === undefined
        ? (current.project ?? '')
        : typeof patch.project === 'string' && patch.project.trim()
          ? patch.project.trim()
          : ''
    const tags =
      Array.isArray(patch.tags)
        ? (patch.tags.map((t) => String(t).trim()).filter((t) => t))
        : current.tags
    let sort = patch.sort != null ? Number(patch.sort) : current.sort
    if (status !== current.status && patch.sort == null) {
      const maxSort = this.db
        .prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM tasks WHERE status = ?')
        .get(status) as { m: number }
      sort = Number(maxSort?.m ?? 0) + 1
    }

    let creator = current.creator
    if ('creator' in patch) {
      creator = patch.creator ? (normalizeActor(patch.creator, '用户') ?? { kind: 'user', name: '用户' }) : { kind: 'user', name: '用户' }
    }

    let assignee = current.assignee
    let assignedAt = current.assignedAt
    if ('assignee' in patch) {
      assignee = patch.assignee ? normalizeActor(patch.assignee) : null
      if (!actorsEqual(assignee, current.assignee)) {
        assignedAt = assignee ? (patch.assignedAt ?? now()) : null
      }
    }

    // 树：改父任务时重算 depth（并级联更新其下所有子树）
    let parentId = current.parentId
    let depth = current.depth
    if ('parentId' in patch) {
      parentId = typeof patch.parentId === 'string' && patch.parentId ? patch.parentId : null
      if (parentId) {
        if (parentId === id) throw new Error('cannot set a task as its own parent')
        const parent = this.get(parentId)
        if (!parent) throw new Error(`unknown parent task: ${parentId}`)
        if (parent.depth + 1 > MAX_DEPTH) throw new Error(`depth exceeds MAX_DEPTH=${MAX_DEPTH}`)
        depth = parent.depth + 1
      } else {
        depth = 0
      }
    }

    // DAG：改依赖时做环检测（从本节点沿依赖反向 DFS，若遇到自己则成环）
    let dependsOn = current.dependsOn
    if (patch.dependsOn !== undefined) {
      dependsOn = (patch.dependsOn as string[]).map(String).filter((d) => d && d !== id)
      this.assertNoCycle(id, dependsOn)
    }

    // trigger 合并更新：partial trigger 与现有 trigger 合并后整体落库
    const triggerObj = current.trigger ?? defaultTrigger()
    const trigger = normalizeTrigger({ ...triggerObj, ...(patch.trigger ?? {}) })

    // 进度汇报提醒间隔（秒）：默认 60。lastReportPromptAt 为内部监测字段，仅显式 patch 时才覆盖。
    const reportIntervalSec =
      patch.reportIntervalSec === undefined
        ? current.reportIntervalSec
        : patch.reportIntervalSec == null || Number.isNaN(Number(patch.reportIntervalSec)) || Number(patch.reportIntervalSec) <= 0
          ? 60
          : Math.round(Number(patch.reportIntervalSec))
    const lastReportPromptAt =
      patch.lastReportPromptAt === undefined
        ? current.lastReportPromptAt
        : patch.lastReportPromptAt == null
          ? null
          : Number(patch.lastReportPromptAt)
    const reportPromptCount =
      patch.reportPromptCount === undefined
        ? current.reportPromptCount
        : Math.max(0, Math.round(Number(patch.reportPromptCount) || 0))
    const emoji = patch.emoji !== undefined ? String(patch.emoji ?? '') : current.emoji
    const facet = patch.facet !== undefined ? normalizeSchemaValue(patch.facet) : current.facet

    const ts = now()
    this.db
      .prepare(
        `UPDATE tasks SET
          title = ?, status = ?, priority = ?, difficulty = ?, assignee = ?, due_at = ?, description = ?, notes = ?, sort = ?,
          updated_at = ?, creator_json = ?, assignee_json = ?, assigned_at = ?, project = ?, tags_json = ?,
          parent_id = ?, depends_on = ?, depth = ?, trigger_json = ?,
          report_interval_sec = ?, last_report_prompt_at = ?, report_prompt_count = ?, facet_json = ?, emoji = ?
         WHERE id = ?`,
      )
      .run(
        title,
        status,
        priority,
        difficulty,
        assignee?.name ?? '',
        dueAt,
        description,
        notes,
        sort,
        ts,
        JSON.stringify(creator),
        assignee ? JSON.stringify(assignee) : null,
        assignedAt,
        project,
        JSON.stringify(tags),
        parentId,
        JSON.stringify(dependsOn),
        depth,
        JSON.stringify(trigger),
        reportIntervalSec,
        lastReportPromptAt,
        reportPromptCount,
        JSON.stringify(facet),
        emoji,
        id,
      )
    writeEditorContent(this.db, '/tasks', id, description)
    this.emitChange()
    return this.get(id)!
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id) as { changes: number }
    if (result.changes > 0) this.emitChange()
    return result.changes > 0
  }

  /** DAG 环检测：从每个依赖任务沿其依赖链 DFS，若回溯到本任务则成环 */
  private assertNoCycle(id: string, dependsOn: string[]): void {
    const visited = new Set<string>()
    const dfs = (nodeId: string) => {
      if (nodeId === id) throw new Error('dependency cycle detected')
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      const node = this.get(nodeId)
      if (!node) return
      for (const d of node.dependsOn) dfs(d)
    }
    for (const d of dependsOn) dfs(d)
  }

  /** 追加一条 agent 通过 task_report 提交的执行报告（不可篡改式累积）。
   *  同名 (sessionId, turn) 的 usage 取后一次上报（覆盖，避免 peer report 叠加重复计费）。 */
  report(id: string, report: TaskReport): TaskRow {
    const current = this.get(id)
    if (!current) throw new Error('unknown task')
    const reports = [...(current.reports ?? []), report]
    const ts = now()
    // 新 report 到来即「已回应」：重置追问时间与次数
    this.db
      .prepare('UPDATE tasks SET reports_json = ?, updated_at = ?, last_report_prompt_at = NULL, report_prompt_count = 0 WHERE id = ?')
      .run(JSON.stringify(reports), ts, id)
    this.emitChange()
    return this.get(id)!
  }
}

export const name = 'core-task-system'
export const inject = ['http', 'hub', 'tools', 'sessions']
export { tasksCollection } from './collection.ts'

export function apply(ctx: Context) {
  startTaskClock(ctx)
  const host = ctx as HostCtx
  const dbPath = dataPath(dataHome(), 'biu.sqlite')
  const tasks = new TasksService(ctx, dbPath).open()

  async function present(row: TaskRow): Promise<TaskRow> {
    // 完成状态（todo/doing/done）尊重已存储的 row.status：它由 task_report 上报 或 人/AI 手动 update 维护（last-write-wins）。
    // 无任何信号时默认 todo。
    const counts = (row.reports ?? []).filter((r) => r.status === 'done').length
    const base = { ...row, status: row.status || 'todo' }
    // 持久化消耗：聚合本任务各 report 固化的 usage（同名 session+turn 去重），删 session 也不丢。
    const usage = sumReportUsage(row.reports)
    return {
      ...base,
      doneCount: counts,
      // 阻塞始终派生：待办 + 存在未完成依赖；并给出阻塞来源链
      blocked: computeBlocked({ ...row, status: base.status }, (id) => tasks.get(id)),
      blockedBy: computeBlockedBy({ ...row, status: base.status }, (id) => tasks.get(id)),
      execution: (row.reports ?? []).length
        ? deriveExecutionFromReports(row.reports)
        : { status: 'idle', turn: null, assistantText: '', updatedAt: 0 },
      // 消耗持久化字段：有 usage 才附上；无则为 undefined（前端据此 fallback 到实时 query）。
      ...(usage ? { usage, totalTokens: usage.totalTokens } : {}),
      // 自动触发：附上 trigger 配置与下次触发时间（仅 enabled 且有命中源时非空）
      trigger: row.trigger,
      nextTriggerAt: computeNextTriggerAt({ ...base, trigger: row.trigger }),
    }
  }

  async function presentMany(rows: TaskRow[]): Promise<TaskRow[]> {
    return Promise.all(rows.map((row) => present(row)))
  }

  host.hub.register({
    id: 'tasks',
    title: '任务',
    subtitle: '',
    plugin: 'core-task-system',
    kind: 'tasks',
  })


  async function runTaskReport(id: string, args: Record<string, unknown> = {}) {
    const row = tasks.get(id)
    if (!row) throw new Error('unknown task')
    const status = args.status === 'done' ? 'done' : 'doing'
    const sessionId = currentSessionId()
    let turn: number | null = null
    if (sessionId) {
      const record = host.sessions?.peek(sessionId) ?? (await host.sessions?.get?.(sessionId))
      if (record?.events?.length) {
        for (const ev of record.events) {
          if (ev.type === 'turn/start' || ev.type === 'turn/end') {
            if (typeof ev.turn === 'number') turn = ev.turn
          }
        }
      }
    }
    let usage: TaskUsage | undefined
    if (sessionId && turn != null) {
      const rec: { events?: Array<Record<string, unknown>> } | undefined =
        (host.sessions?.get ? await host.sessions.get(sessionId) : undefined) ??
        (host.sessions?.peek(sessionId) as { events?: Array<Record<string, unknown>> } | undefined)
      usage = computeTurnUsage(rec?.events, turn)
    }
    const report: TaskReport = {
      sessionId: sessionId ?? 'unknown',
      ...(sessionId ? { sessionName: sessionId.slice(0, 8) } : {}),
      turn,
      status,
      ...(typeof args.note === 'string' && args.note.trim() ? { note: String(args.note).trim() } : {}),
      ...(usage ? { usage } : {}),
      ts: now(),
    }
    tasks.report(id, report)
    tasks.update(id, { status })
    const delivered = await reportBackToCreator(host, row, report)
    return { ...(await present(tasks.get(id)!)), delivered }
  }

  async function runTaskDeliver(id: string, args: Record<string, unknown> = {}) {
    const row = tasks.get(id)
    if (!row) throw new Error('unknown task')
    const targetSessionId = row.assignee?.sessionId
    if (!targetSessionId) {
      throw new Error(`task ${id} 未分配执行会话。请先 db_update /tasks/${id} 写入 assignee（会话 id）`)
    }
    if (!host.sessions?.sendMessage) {
      throw new Error('sessions.sendMessage 不可用：sessions 服务未就绪')
    }
    const text = String(args.text ?? '').trim() || buildDeliverText(row)
    const sender = { type: 'session' as const, sessionId: currentSessionId() ?? 'unknown' }
    const wait = args.wait !== false && args.wait !== 'false'
    if (!wait) {
      void host.sessions.sendMessage(targetSessionId, text, { wait: false, sender })
      return { taskId: id, sessionId: targetSessionId, queued: true, wait: false, text }
    }
    const turn = await host.sessions.sendMessage(targetSessionId, text, { wait: true, sender })
    return {
      taskId: id,
      sessionId: targetSessionId,
      queued: false,
      wait: true,
      text: turn.text.slice(0, 1200),
      steps: turn.steps.length,
    }
  }

  // ==================== Trigger 统一调度 driver（自包含，事件驱动） ====================
  // 触发语义：cron(定时) / at(特定时间) / on(自动事件 dep:done·turn:end) 三源统一。
  // 状态机：idle → pending → delivered → done（周期任务 done 后按 enabled 重置回 idle）。
  // 防重入：state 守卫（仅 idle 可触发）；防重：无有效 trigger / 未分配 session 不派工。

  /**
   * 对任务执行一次性「触发 → 派工 → delivered」。
   * 仅在 trigger.enabled 且 state==='idle' 且 任务未完成 且 有负责 session 时才真正派工。
   * 返回是否执行了派工。
   */
  async function fireTrigger(row: TaskRow): Promise<boolean> {
    const tr = row.trigger
    if (!tr?.enabled) return false
    if (tr.state !== 'idle') return false
    if (row.status === 'done' || row.status === 'failed') return false
    const targetSessionId = row.assignee?.sessionId
    if (!targetSessionId) {
      // 未分配负责 session：不派工也不改状态（保持 idle，等分配后再触发）
      return false
    }
    if (!host.sessions?.sendMessage) return false
    // 置 pending 防重入（原子守卫：先写库再派工）
    tasks.update(row.id, {
      trigger: { state: 'pending', lastRun: now() },
    })
    const text = buildDeliverText({ ...row, ...(row.trigger ? { trigger: row.trigger } : {}) })
    try {
      await host.sessions.sendMessage(targetSessionId, text, {
        wait: false,
        sender: { type: 'session', sessionId: currentSessionId() ?? 'unknown' },
      })
      tasks.update(row.id, { trigger: { state: 'delivered' } })
      return true
    } catch {
      // 派工失败：回退 idle，允许下次重试
      tasks.update(row.id, { trigger: { state: 'idle' } })
      return false
    }
  }

  /** 检查定时触发命中：cron 到点 or at 已到。 */
  function timingHit(tr: TaskTrigger, nowTs: number): boolean {
    if (!tr.enabled) return false
    if (tr.at != null && tr.at <= nowTs) return true
    if (tr.cron) {
      const match = parseCron(tr.cron)
      if (!match) return false
      // 6 字段秒级 cron：保留秒参与判定（秒精确命中）
      if (match.hasSeconds) return match(new Date(nowTs))
      // 5 字段分钟级 cron：整分对齐（当前分钟任意秒都视为命中）
      const date = new Date(nowTs)
      date.setSeconds(0, 0)
      return match(date)
    }
    return false
  }

  /** 周期任务下轮重置：任务已完成且 trigger 仍 enabled（周期语义）→ 回到 idle 进入下轮。 */
  function resetPeriodic(row: TaskRow): void {
    const tr = row.trigger
    if (!tr?.enabled) return
    if (row.status === 'done' && tr.state === 'delivered') {
      tasks.update(row.id, {
        trigger: { state: 'idle' },
      })
      // 周期 cron：更新 lastRun，使下轮定时不重叠
      if (tr.cron) tasks.update(row.id, { trigger: { state: 'idle' } })
    }
  }

  /**
   * 进度超时判定（纯函数，便于单测）：
   * 对已派发（assignee 有 sessionId 且 assignedAt 非空）、非 done 的任务，
   * 距最近一次 task_report（无 report 时以 assignedAt 为基线）超过 reportIntervalSec 且不在追问冷却(距上次追问
   * lastReportPromptAt 不足 reportIntervalSec)内时，应触发一次进程追问。
   * 返回 null 表示不应追问；否则返回是否追问 + 已超时秒数 + 冷却/间隔毫秒。
   */
  function promptForProgress(row: TaskRow): void {
    try {
      const nowTs = now()
      const verdict = shouldPromptProgress(row, nowTs)
      if (verdict.shouldFail) {
        if (row.status === 'failed') return
        tasks.update(row.id, { status: 'failed' })
        const assigneeSessionId = row.assignee?.sessionId
        const creatorSessionId = row.creator?.kind === 'agent' ? row.creator.sessionId : undefined
        if (assigneeSessionId && host.sessions?.sendMessage) {
          const text = `【任务失败】${row.title}\n任务 id：${row.id}\n已询问进度 ${MAX_REPORT_PROMPTS} 次仍未收到汇报，任务已标记为失败。`
          const sender = creatorSessionId ? { type: 'session' as const, sessionId: creatorSessionId } : undefined
          host.sessions.sendMessage(assigneeSessionId, text, { wait: false, ...(sender ? { sender } : {}) }).catch(() => {})
        }
        return
      }
      if (!verdict.shouldPrompt) return
      const assigneeSessionId = row.assignee?.sessionId
      const creatorSessionId = row.creator?.kind === 'agent' ? row.creator.sessionId : undefined
      if (!assigneeSessionId || !creatorSessionId) return
      if (!host.sessions?.sendMessage) return
      const used = Math.max(0, Math.round(Number(row.reportPromptCount) || 0))
      const nextCount = used + 1
      const text = `【任务进度询问】${row.title}\n任务 id：${row.id}\n任务已派发 ${verdict.overdueSec} 秒仍未收到汇报（第 ${nextCount}/${MAX_REPORT_PROMPTS} 次询问）。请问当前进展？`
      const sender = { type: 'session' as const, sessionId: creatorSessionId }
      host.sessions.sendMessage(assigneeSessionId, text, { wait: false, sender }).catch(() => {
        /* 发送失败：保留 lastReportPromptAt 未更新，下轮可重试 */
      })
      tasks.update(row.id, { lastReportPromptAt: nowTs, reportPromptCount: nextCount })
    } catch {
      /* 单测/无完整 host 时容忍 */
    }
  }

  /** 统一驱动一轮：定时触发检查 + 周期重置。返回本轮派工的任务数。 */
  async function driveTimers(): Promise<number> {
    const nowTs = now()
    let fired = 0
    const rows = tasks.list()
    // 进度超时监测（周期汇报提醒）：只针对已派发且有执行 session 的未完成任务
    for (const row of rows) {
      promptForProgress(row)
    }
    for (const row of rows) {
      const tr = row.trigger
      if (!tr?.enabled) continue
      // 周期重置：已完成的任务回到下轮
      resetPeriodic(row)
      const fresh = tasks.get(row.id)!
      const freshTr = fresh.trigger
      if (!freshTr?.enabled) continue
      // 秒级周期 cron（*/N 等）已派工未 done：时间维度按周期重置回 idle 再触发，
      // 使「每 N 秒严格执行一次」而不死等 done；配 lastRun 节流避免因每秒 tick 重复累计。
      if (freshTr.state !== 'idle' && freshTr.cron) {
        const match = parseCron(freshTr.cron)
        if (match?.hasSeconds && freshTr.lastRun != null && nowTs - freshTr.lastRun >= 1000) {
          tasks.update(fresh.id, { trigger: { state: 'idle' } })
          const resetRow = tasks.get(fresh.id)!
          const resetTr = resetRow.trigger
          if (resetTr?.enabled && timingHit(resetTr, nowTs)) {
            const ok = await fireTrigger(resetRow)
            if (ok) fired++
          }
          continue
        }
      }
      if (timingHit(freshTr, nowTs)) {
        const ok = await fireTrigger(fresh)
        if (ok) fired++
      }
    }
    return fired
  }

  // 定时触发：订阅同包 clock/tick（每秒心跳）——事件驱动，不另起调度器。
  ctx.on('clock/tick', () => {
    try {
      void driveTimers()
    } catch {
      /* 单测等无完整 host 时容忍 */
    }
  })

  // on 自动触发：
  //  - turn:end：某 session 回合结束时，检查所有监听 turn:end 且已到达条件的事件触发
  //  - dep:done：依赖任务完成 → 触发依赖它的任务（通过监听 task_report done / 状态变化）
  ctx.on('session/event', (payload) => {
    try {
      const ev = payload.event
      if (ev?.type !== 'turn/end') return
      const sessionId = payload.sessionId
      const rows = tasks.list()
      for (const row of rows) {
        const tr = row.trigger
        if (!tr?.enabled || !tr.on.includes('turn:end')) continue
        if (tr.state !== 'idle') continue
        const targetSessionId = row.assignee?.sessionId
        if (targetSessionId !== sessionId) continue
        // 回合结束：该执行 session 刚结束上一回合，若任务仍待触发则派工
        void fireTrigger(row)
      }
    } catch {
      /* ignore */
    }
  })

  // dep:done：依赖某任务的"完成"作为触发源。通过 tools/post-execute 捕获 task_report done，
  // 或监听任务状态变化。这里统一：当某任务的 assignee 回合结束且该任务已 done 时，通知依赖方。
  // 简化为：监听 task_report（tools/post-execute 中 name==='task_report'），若报告 done 则触发其下游。
  ctx.on('tools/post-execute', (payload) => {
    try {
      if (payload?.name !== 'db_action') return
      const rows = tasks.list()
      // 找所有已完成的任务 id 集合（作为 dep:done 的候选依赖源）
      for (const row of rows) {
        const tr = row.trigger
        if (!tr?.enabled || !tr.on.includes('dep:done')) continue
        if (tr.state !== 'idle') continue
        // 依赖全部完成（满足 depsSatisfied）即触发
        if (depsSatisfied(row, (id) => tasks.get(id))) {
          void fireTrigger(row)
        }
      }
    } catch {
      /* ignore */
    }
  })

  ctx.inject(['database'], (inner) => {
    inner.database.register(
      tasksCollection(
        tasks,
        {
          report: (id, _record, args) => runTaskReport(id, args),
          deliver: (id, _record, args) => runTaskDeliver(id, args),
        },
        {
          resolveCreator: () => resolveCreator(host),
          resolveAssignee: async (input) => {
            const resolved = await resolveAssignee(host, input)
            return resolved.touchAssignedAt ? resolved.assignee : null
          },
        },
      ),
    )
  })
}

// 供其它 plugin（如 core-chat）通过 inject 'tasks' 注入本服务，做 Live 派工统计按 creator 取数。
declare module 'cordis' {
  interface Context {
    tasks: TasksService
  }
}
