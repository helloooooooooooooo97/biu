import { useSyncExternalStore } from 'react'
import { Service, type Context } from 'cordis'
import { mergeInspectorBind, mergeContentEditFiles, type SessionInspectorBind, type SessionGoal } from '@biu/type-session'
import { captureLiveUiContext } from './live-ui-context.ts'
import {
  compactSessionEvents,
  mergeDispatchedUsageIntoNodes,
  projectNodes,
  type ChatNode,
  type DerivedMessage,
  type SessionEvent,
  type TrajectoryRow,
  type TrajectoryUsage,
} from './session-project.ts'
import type { AppRoute } from './session-route.ts'
import { mostRecentSessionId } from './session-groups.ts'
import { markSidebarMascotFresh } from './session-mascot-fresh.ts'

export type { AppRoute, RouteView, InspectorCenterKind } from './session-route.ts'
export {
  parseAppPath,
  isKnownAppPath,
  buildAppPath,
  routeFromState,
  centerKindFromRoute,
  parseDatabaseRest,
  isLegacyDatabasePath,
  encodeCollectionSeg,
  decodeCollectionSeg,
} from './session-route.ts'
export {
  compactSessionEvents,
  mergeDispatchedUsageIntoNodes,
  projectNodes,
  formatTokens,
  formatTrajectoryUsage,
  sumTrajectoryRowUsage,
  sumUsageParts,
  type ChatNode,
  type ChatAssistantPart,
  type ChatThinkPart,
  type ChatReplyPart,
  type ChatStepStat,
  type ChatToolPart,
  type DerivedMessage,
  type SessionEvent,
  type TrajectoryRow,
  type TrajectoryUsage,
} from './session-project.ts'
export {
  UNGROUPED_PROJECT_KEY,
  UNGROUPED_TAG_KEY,
  PINNED_GROUP_KEY,
  mostRecentSessionId,
  groupSessionsByProject,
  groupSessionsByTag,
  buildSidebarGroups,
  buildSidebarSections,
  type SidebarGroupBy,
  type SidebarSection,
  type SidebarSectionKind,
} from './session-groups.ts'
export { useSidebarCollapseStore } from './sidebar-collapse-store.ts'
export {
  subscribeChatOutline,
  getChatOutlineOpen,
  setChatOutlineOpen,
  getChatOutlineFilter,
  setChatOutlineFilter,
  deriveChatOutline,
  requestChatOutlineGo,
  nodeIdFromOutlineEvent,
  type ChatOutlineFilter,
  type ChatOutlineItem,
} from './chat-outline.ts'
export {
  SIDEBAR_MASCOT_INTRO_MS,
  markSidebarMascotFresh,
  remainingSidebarMascotIntroMs,
  clearSidebarMascotFresh,
} from './session-mascot-fresh.ts'

export interface ApprovalItem {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface SessionListItem {
  id: string
  title: string
  eventCount: number
  updatedAt: number
  /** host 列表快照：该 session 的 agent 是否在跑 */
  busy?: boolean
  project?: { name: string; path?: string; boundAt: number }
  mascot?: { shape: string; color: string; eye?: number }
  tags?: string[]
  pinned?: boolean
  inspector?: SessionInspectorBind
  goal?: SessionGoal
}

export type ConversationView = 'chat' | 'debug'
export type ApprovalMode = 'auto' | 'hold'

/** Live 派工子任务（衍生查询，不入 session 日志） */
export type DispatchedTaskRow = {
  sessionId: string
  title?: string
  project?: { name: string; path?: string }
  mascot?: { shape: string; color: string; eye?: number }
  tool: 'task_deliver'
  liveTurn?: number
  wakeTs?: number
  status: 'pending' | 'running' | 'complete' | 'ended'
  reason?: string
  workerTurn?: number
  usage?: TrajectoryUsage
  preview?: string
}

/** 当前 session agent inbox 中尚未 claim 的排队消息 */
export type InboxQueueItem = {
  id: string
  kind: 'wake' | 'inject'
  text: string
}

/** 打开会话与上翻分页都只拉最近 / 更早的 100 轮，不再一次全量。 */
export const SESSION_TAIL_TURNS = 100
export const TRAJECTORY_TAIL_TURNS = 48
export const SESSION_LOAD_TURNS = SESSION_TAIL_TURNS

export interface UsageTrendPoint {
  seq: number
  turn: number
  input: number
  output: number
  cache: number
}

export interface UsageTrend {
  points: UsageTrendPoint[]
  /** 压缩点 seq：上下文在此重置的位置 */
  compactions: number[]
}

export interface SessionViewState {
  sessionId: string | null
  events: SessionEvent[]
  nodes: ChatNode[]
  trajectory: TrajectoryRow[]
  sessions: SessionListItem[]
  view: ConversationView
  focusCallId?: string
  agentStatus: 'idle' | 'running'
  agentStep?: number
  pending: boolean
  /** 忙碌时已入队、尚未开始的 wake/inject */
  inbox: InboxQueueItem[]
  /** 任意 session 的 busy（含 Live 派工的 worker）；侧栏 mascot 用 */
  busySessions: Record<string, true>
  approvalMode: ApprovalMode
  approvals: ApprovalItem[]
  project?: { name: string; path?: string; boundAt: number }
  /** Chat 是否还有更早 turn */
  hasMoreOlder: boolean
  loadingOlder: boolean
  /** Trajectory 索引是否还有更早 turn */
  trajectoryHasMore: boolean
  trajectoryLoading: boolean
  totalTurns: number
  /** Live：其它 session 被本席 wake 的 turn usage（按 Live turn 号） */
  dispatchedUsageByTurn: Record<string, TrajectoryUsage>
  /** Live：派工子任务（按 Live turn 号，衍生查询） */
  dispatchedTasksByTurn: Record<string, DispatchedTaskRow[]>
  /** Live：派工 turn usage 合计 */
  dispatchedUsage?: TrajectoryUsage
  /** 切会话且无缓存：保留上一段画面直到新数据到齐，避免先闪 EmptyHero */
  switchingSession: boolean
  /** 当前 session 的检查器绑定，只来自 GET /api/sessions/:id */
  sessionInspector?: SessionInspectorBind
  inspectorReady: boolean
  error?: string
}

const empty: SessionViewState = {
  sessionId: null,
  events: [],
  nodes: [],
  trajectory: [],
  sessions: [],
  view: 'chat',
  agentStatus: 'idle',
  pending: false,
  inbox: [],
  busySessions: {},
  approvalMode: 'auto',
  approvals: [],
  hasMoreOlder: false,
  loadingOlder: false,
  trajectoryHasMore: false,
  trajectoryLoading: false,
  totalTurns: 0,
  dispatchedUsageByTurn: {},
  dispatchedTasksByTurn: {},
  switchingSession: false,
  inspectorReady: false,
}

type SessionPayload = {
  id: string
  events: SessionEvent[]
  hasMore?: boolean
  totalTurns?: number
  totalEvents?: number
  project?: { name: string; path?: string; boundAt: number }
  config?: { inspector?: SessionInspectorBind; goal?: SessionGoal }
  inspector?: SessionInspectorBind
  dispatchedUsage?: TrajectoryUsage
  dispatchedUsageByTurn?: Record<string, TrajectoryUsage>
  dispatchedTasksByTurn?: Record<string, DispatchedTaskRow[]>
}

type TrajectoryPayload = {
  id: string
  rows?: TrajectoryRow[]
  hasMore?: boolean
  totalTurns?: number
}

type SessionCacheEntry = {
  events: SessionEvent[]
  nodes: ChatNode[]
  project?: { name: string; path?: string; boundAt: number }
  hasMoreOlder: boolean
  totalTurns: number
  dispatchedUsageByTurn: Record<string, TrajectoryUsage>
  dispatchedTasksByTurn: Record<string, DispatchedTaskRow[]>
  dispatchedUsage?: TrajectoryUsage
}

const SESSION_CACHE_MAX = 16

function sessionsEqual(a: SessionListItem[], b: SessionListItem[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      left.eventCount !== right.eventCount ||
      left.updatedAt !== right.updatedAt ||
      left.project?.path !== right.project?.path ||
      left.project?.name !== right.project?.name ||
      left.mascot?.shape !== right.mascot?.shape ||
      left.mascot?.color !== right.mascot?.color ||
      left.mascot?.eye !== right.mascot?.eye ||
      Boolean(left.busy) !== Boolean(right.busy) ||
      Boolean(left.pinned) !== Boolean(right.pinned) ||
      (left.tags ?? []).join('\0') !== (right.tags ?? []).join('\0') ||
      JSON.stringify(left.inspector ?? null) !== JSON.stringify(right.inspector ?? null) ||
      JSON.stringify(left.goal ?? null) !== JSON.stringify(right.goal ?? null)
    ) {
      return false
    }
  }
  return true
}

/** send 乐观 busy 后，列表短暂仍可能 busy:false；超过此时长以列表为准。 */
export const BUSY_HOLD_MS = 1500

export function turnInProgress(events: { type: string }[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const type = events[i]?.type
    if (type === 'turn/end') return false
    if (type === 'turn/start') return true
  }
  return false
}

export class SessionViewService extends Service {
  private value: SessionViewState = empty
  private listeners = new Set<() => void>()
  /** 切会话瞬时缓存：避免每次都等网络才卸掉旧 Chat DOM */
  private cache = new Map<string, SessionCacheEntry>()
  private cacheOrder: string[] = []
  private loadGen = 0
  /** 右侧检查器或 debug 路由要实时轨迹：与 ConversationView 解耦 */
  private trajectoryLive = false
  private trajGen = 0
  private trajFetchSessionId: string | null = null
  private dispatchedPoll: ReturnType<typeof setInterval> | null = null
  private busyHoldUntil = 0
  /** 切会话时画面还是上一段：ingest 不能往旧 events 上叠新 session */
  private holdPreviousThread = false

  constructor(ctx: Context) {
    super(ctx, 'sessionView')
    void this.refreshSessions()
    void this.refreshApprovals()
    this.ctx.effect(() => () => this.stopDispatchedPoll())
  }

  private buildNodes(events: SessionEvent[], byTurn = this.value.dispatchedUsageByTurn) {
    return mergeDispatchedUsageIntoNodes(projectNodes(events), byTurn)
  }

  private stopDispatchedPoll() {
    if (this.dispatchedPoll) {
      clearInterval(this.dispatchedPoll)
      this.dispatchedPoll = null
    }
  }

  private syncDispatchedPoll() {
    this.stopDispatchedPoll()
    const id = this.value.sessionId
    if (!id) return
    this.dispatchedPoll = setInterval(() => {
      void this.refreshDispatchedUsage()
    }, 2000)
  }

  async refreshDispatchedUsage() {
    const sessionId = this.value.sessionId
    if (!sessionId) return
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dispatched-usage`)
      if (!res.ok || this.value.sessionId !== sessionId) return
      const body = (await res.json()) as {
        dispatchedUsage?: TrajectoryUsage | null
        dispatchedUsageByTurn?: Record<string, TrajectoryUsage>
        dispatchedTasksByTurn?: Record<string, DispatchedTaskRow[]>
      }
      const byTurn = body.dispatchedUsageByTurn ?? {}
      const tasksByTurn = body.dispatchedTasksByTurn ?? {}
      const dispatchedUsage = body.dispatchedUsage ?? undefined
      if (
        JSON.stringify(byTurn) === JSON.stringify(this.value.dispatchedUsageByTurn) &&
        JSON.stringify(tasksByTurn) === JSON.stringify(this.value.dispatchedTasksByTurn) &&
        JSON.stringify(dispatchedUsage) === JSON.stringify(this.value.dispatchedUsage)
      ) {
        return
      }
      this.replace({
        dispatchedUsageByTurn: byTurn,
        dispatchedTasksByTurn: tasksByTurn,
        dispatchedUsage,
        nodes: this.buildNodes(this.value.events, byTurn),
      })
      this.stashCurrent()
    } catch {
      /* 静默 */
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.value

  setView(view: ConversationView) {
    this.replace({ view, focusCallId: view === 'chat' ? undefined : this.value.focusCallId })
    if (this.wantsTrajectory(view)) void this.ensureTrajectory()
  }

  private wantsTrajectory(view: ConversationView = this.value.view) {
    return this.trajectoryLive || view === 'debug'
  }

  inspectCall(callId: string) {
    this.replace({ focusCallId: callId })
    void this.ensureTrajectory()
  }

  clearInspectCall() {
    if (this.value.focusCallId == null) return
    this.replace({ focusCallId: undefined })
  }

  /** URL → 状态：只由路由层调用，不回写 URL。
   * 只有 `/s/:id` 才换成主 Session。搜索把页面/其它记录开到左侧、进数据模块，都不改全局会话。
   * 冷启动还没有会话时，给悬浮窗补最近一条。 */
  async applyRoute(route: AppRoute) {
    if (route.kind === 'session') {
      if (this.value.sessionId !== route.sessionId) {
        try {
          await this.load(route.sessionId, { view: route.view })
        } catch (error) {
          this.replace({
            error: String(error),
            sessionId: null,
            events: [],
            nodes: [],
            trajectory: [],
            view: 'chat',
            focusCallId: undefined,
            hasMoreOlder: false,
            loadingOlder: false,
            trajectoryHasMore: false,
            trajectoryLoading: false,
            totalTurns: 0,
            switchingSession: false,
          })
          throw error
        }
      } else if (this.value.view !== route.view) {
        this.replace({
          view: route.view,
          focusCallId: route.view === 'chat' ? undefined : this.value.focusCallId,
        })
      }
      if (this.wantsTrajectory(route.view)) void this.ensureTrajectory()
      return
    }
    if (!this.value.sessionId) await this.loadMostRecentSession()
  }

  private async loadMostRecentSession(skipId?: string) {
    if (!this.value.sessions.length) await this.refreshSessions()
    const latest = mostRecentSessionId(this.value.sessions.filter((item) => item.id !== skipId))
    if (!latest) return
    if (this.value.sessionId === latest) return
    await this.load(latest, { view: 'chat' })
  }

  /** 路由指向已删除/不存在的会话：不报 404，回首页并打开最近一条。 */
  private async leaveMissingSession(sessionId: string) {
    this.cache.delete(sessionId)
    this.replace({
      error: undefined,
      sessionId: null,
      events: [],
      nodes: [],
      trajectory: [],
      view: 'chat',
      focusCallId: undefined,
      hasMoreOlder: false,
      loadingOlder: false,
      trajectoryHasMore: false,
      trajectoryLoading: false,
      totalTurns: 0,
      switchingSession: false,
      ...this.pendingInspector(),
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('biu:session-missing', { detail: { sessionId } }))
    }
    await this.refreshSessions()
    await this.loadMostRecentSession(sessionId)
  }

  ingest(sessionId: string, event: SessionEvent) {
    if (event.type === 'turn/end' || event.type === 'turn/start') {
      this.applyTurnBusy(sessionId, event.type)
    }
    if (this.value.sessionId && this.value.sessionId !== sessionId) {
      void this.refreshSessions()
      return
    }
    // 切会话过渡期仍挂着上一段 nodes，勿把新 session 的流式事件混进去。
    // 空壳（还没套上旧画面）可以立刻吃本 session 的事件，否则发送后要等 revalidate 才出现用户气泡。
    if (this.value.switchingSession) {
      void this.refreshSessions()
      if (this.value.sessionId !== sessionId) return
      if (this.holdPreviousThread) return
    }
    if (event.type === 'assistant/chunk') {
      this.ingestChunk(sessionId, event)
      return
    }
    this.flushChunkFrame()
    const base = this.value.sessionId === sessionId ? this.value.events : []
    const withoutOptimistic =
      event.type === 'user/message'
        ? base.filter(
            (item) => !(item.type === 'user/message' && item.seq < 0 && item.text === event.text),
          )
        : base
    const events = upsertEvent(withoutOptimistic, event)
    this.replace({
      sessionId,
      events,
      nodes: this.buildNodes(events),
      error: undefined,
    })
    this.stashCurrent()
    // 检查器打开后 trajectoryLive=true：即使 URL 仍是 chat 也要刷新右侧轨迹
    if (this.wantsTrajectory()) void this.refreshTrajectoryIndex()
    void this.refreshSessions()
  }

  private ingestChunk(sessionId: string, event: Extract<SessionEvent, { type: 'assistant/chunk' }>) {
    const events = upsertEvent(this.value.sessionId === sessionId ? this.value.events : [], event)
    const chunk = events.at(-1)
    const nodes =
      chunk?.type === 'assistant/chunk'
        ? patchStreamingNodes(this.value.nodes, chunk)
        : this.buildNodes(events)
    this.value = {
      ...this.value,
      sessionId,
      events,
      nodes,
      error: undefined,
    }
    this.scheduleChunkNotify()
  }

  private chunkRaf: number | null = null

  private scheduleChunkNotify() {
    if (this.chunkRaf != null) return
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
    this.chunkRaf = schedule(() => {
      this.chunkRaf = null
      for (const fn of this.listeners) fn()
    }) as number
  }

  private flushChunkFrame() {
    if (this.chunkRaf == null) return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.chunkRaf)
    else clearTimeout(this.chunkRaf)
    this.chunkRaf = null
    for (const fn of this.listeners) fn()
  }

  setAgentStatus(status: 'idle' | 'running', step?: number, sessionId?: string) {
    const id = sessionId ?? this.value.sessionId
    const isOther = Boolean(sessionId && this.value.sessionId && sessionId !== this.value.sessionId)

    if (status === 'running') {
      const holdOpen = Date.now() < this.busyHoldUntil
      if (
        !isOther &&
        !holdOpen &&
        !turnInProgress(this.value.events) &&
        this.value.events.some((item) => item.type === 'turn/end')
      ) {
        return
      }
      if (!holdOpen) this.markBusyHold()
      const alreadyBusy = Boolean(id && this.value.busySessions[id])
      if (isOther) {
        // worker 步进会连发 running：busy 集合没变就别 notify，避免侧栏跟着抖
        if (alreadyBusy || !id) return
        this.replace({ busySessions: { ...this.value.busySessions, [id]: true } })
        return
      }
      const busySessions =
        alreadyBusy || !id
          ? this.value.busySessions
          : { ...this.value.busySessions, [id]: true as const }
      if (
        this.value.agentStatus === 'running' &&
        this.value.pending &&
        this.value.agentStep === step &&
        busySessions === this.value.busySessions
      ) {
        return
      }
      this.replace({
        ...(busySessions === this.value.busySessions ? {} : { busySessions }),
        agentStatus: 'running',
        agentStep: step,
        pending: true,
      })
      return
    }

    // idle
    const nextBusy = { ...this.value.busySessions }
    if (id && nextBusy[id]) delete nextBusy[id]
    const busyChanged = Boolean(id && this.value.busySessions[id])
    if (isOther) {
      if (!busyChanged) return
      this.replace({ busySessions: nextBusy })
      return
    }
    if (
      this.value.agentStatus === 'idle' &&
      !this.value.pending &&
      this.value.agentStep === step &&
      !busyChanged
    ) {
      return
    }
    this.replace({
      ...(busyChanged ? { busySessions: nextBusy } : {}),
      agentStatus: 'idle',
      agentStep: step,
      pending: false,
    })
  }

  /** 切会话时按 busySessions 恢复当前栏 pending/agentStatus */
  private busyFlagsFor(sessionId: string | null | undefined) {
    const running = Boolean(sessionId && this.value.busySessions[sessionId])
    return {
      pending: running,
      agentStatus: (running ? 'running' : 'idle') as 'idle' | 'running',
    }
  }

  private markBusyHold() {
    this.busyHoldUntil = Date.now() + BUSY_HOLD_MS
  }

  private applyTurnBusy(sessionId: string, type: 'turn/start' | 'turn/end') {
    const busySessions = { ...this.value.busySessions }
    if (type === 'turn/start') {
      busySessions[sessionId] = true
      this.markBusyHold()
    } else {
      delete busySessions[sessionId]
      if (sessionId === this.value.sessionId) this.busyHoldUntil = 0
    }
    const current = sessionId === this.value.sessionId
    const running = Boolean(busySessions[sessionId])
    this.replace({
      busySessions,
      ...(current ? { pending: running, agentStatus: running ? 'running' : 'idle' } : {}),
    })
  }

  private syncBusyFromSessions(sessions: SessionListItem[]) {
    const busySessions = { ...this.value.busySessions }
    let changed = false
    const currentId = this.value.sessionId
    const holdOpen = Date.now() < this.busyHoldUntil
    for (const item of sessions) {
      if (item.busy) {
        if (!busySessions[item.id]) {
          busySessions[item.id] = true
          changed = true
        }
      } else if (busySessions[item.id]) {
        if (item.id === currentId && holdOpen) continue
        delete busySessions[item.id]
        changed = true
      }
    }
    return changed ? busySessions : null
  }

  upsertApproval(item: ApprovalItem) {
    const approvals = [...this.value.approvals.filter((row) => row.id !== item.id), item]
    this.replace({ approvals })
  }

  removeApproval(id: string) {
    this.replace({ approvals: this.value.approvals.filter((row) => row.id !== id) })
  }

  async refreshSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const body = (await res.json()) as { sessions?: SessionListItem[] }
      const next = Array.isArray(body.sessions) ? body.sessions : []
      const busySessions = this.syncBusyFromSessions(next)
      const sessionsChanged = !sessionsEqual(this.value.sessions, next)
      if (!sessionsChanged && !busySessions) return
      const patch: Partial<SessionViewState> = {}
      if (sessionsChanged) patch.sessions = next
      if (busySessions) {
        patch.busySessions = busySessions
        const currentId = this.value.sessionId
        if (currentId) {
          const running = Boolean(busySessions[currentId])
          patch.agentStatus = running ? 'running' : 'idle'
          patch.pending = running
        }
      }
      this.replace(patch)
    } catch {
      /* host 未就绪时忽略 */
    }
  }

  async refreshApprovals() {
    try {
      const res = await fetch('/api/approvals')
      if (!res.ok) return
      const body = (await res.json()) as {
        mode?: ApprovalMode
        pending?: ApprovalItem[]
      }
      const approvalMode = body.mode === 'hold' ? 'hold' : 'auto'
      const approvals = Array.isArray(body.pending) ? body.pending : []
      if (
        this.value.approvalMode === approvalMode &&
        this.value.approvals.length === approvals.length &&
        this.value.approvals.every((item, index) => item.id === approvals[index]?.id)
      ) {
        return
      }
      this.replace({ approvalMode, approvals })
    } catch {
      /* host 未就绪时忽略 */
    }
  }

  async setApprovalMode(mode: ApprovalMode) {
    const res = await fetch('/api/approvals/mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    const body = (await res.json()) as { mode?: ApprovalMode }
    if (!res.ok) throw new Error('failed to set approval mode')
    this.replace({ approvalMode: body.mode === 'hold' ? 'hold' : 'auto' })
  }

  async newSession(opts: { projectPath?: string } = {}) {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = (await res.json()) as { id?: string }
    if (!body.id) throw new Error('无法创建 session')
    const projectPath = opts.projectPath?.trim()
    if (projectPath) {
      const bind = await fetch(`/api/sessions/${body.id}/project`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
      })
      if (!bind.ok) {
        const err = (await bind.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `绑定项目失败：${bind.status}`)
      }
    }
    markSidebarMascotFresh(body.id)
    await this.load(body.id, { view: 'chat' })
    await this.refreshSessions()
    return body.id
  }

  async ensureSession() {
    if (this.value.sessionId) return this.value.sessionId
    return this.newSession()
  }

  private pendingInspector(): Pick<SessionViewState, 'sessionInspector' | 'inspectorReady'> {
    return { sessionInspector: undefined, inspectorReady: false }
  }

  private inspectorFromPayload(body: SessionPayload) {
    return body.config?.inspector ?? body.inspector
  }

  private rememberSessionInspector(
    sessionId: string,
    inspector: SessionInspectorBind | undefined,
    goal?: SessionGoal,
  ) {
    const sessions = this.value.sessions.map((item) => (item.id === sessionId ? { ...item, inspector, goal } : item))
    return { sessionInspector: inspector, inspectorReady: true as const, sessions }
  }

  async load(sessionId: string, options: { view?: ConversationView; wait?: boolean } = {}) {
    const view = options.view ?? this.value.view
    const wait = options.wait === true
    const switching = Boolean(this.value.sessionId && this.value.sessionId !== sessionId)
    if (switching) this.stashCurrent()

    const cached = this.cache.get(sessionId)
    const needSwap = this.value.sessionId !== sessionId
    const listedProject = this.value.sessions.find((item) => item.id === sessionId)?.project

    // 路由切换（含空会话 / 冷启动）：立刻换壳，网络只后台校对，绝不 await
    if (!wait) {
      if (cached) {
        this.touchCache(sessionId)
        this.loadGen += 1
        if (needSwap) this.trajGen += 1
        this.applyCached(sessionId, cached, view)
        if (this.wantsTrajectory(view)) void this.ensureTrajectory()
        void this.revalidate(sessionId, view)
        return
      }
      if (needSwap) {
        this.loadGen += 1
        this.trajGen += 1
        // 有上一段内容时先保留画面，只换 sessionId；无缓存清空会闪 EmptyHero
        if (this.value.sessionId && (this.value.nodes.length > 0 || this.value.events.length > 0)) {
          this.holdPreviousThread = true
          this.replace({
            sessionId,
            trajectory: [],
            project: listedProject,
            view,
            focusCallId: view === 'chat' ? undefined : this.value.focusCallId,
            error: undefined,
            ...this.busyFlagsFor(sessionId),
            loadingOlder: false,
            trajectoryHasMore: false,
            trajectoryLoading: false,
            switchingSession: true,
            ...this.pendingInspector(),
          })
        } else {
          this.holdPreviousThread = false
          this.replace({
            sessionId,
            events: [],
            nodes: [],
            trajectory: [],
            project: listedProject,
            view,
            focusCallId: view === 'chat' ? undefined : this.value.focusCallId,
            error: undefined,
            ...this.busyFlagsFor(sessionId),
            hasMoreOlder: false,
            loadingOlder: false,
            trajectoryHasMore: false,
            trajectoryLoading: false,
            totalTurns: 0,
            switchingSession: true,
            ...this.pendingInspector(),
          })
        }
        if (this.wantsTrajectory(view)) void this.ensureTrajectory()
        void this.revalidate(sessionId, view)
        return
      }
    }

    // wait：发送后等同会话刷新，必须等网络；切会话时也先换目标再 await
    this.loadGen += 1
    if (needSwap) this.trajGen += 1
    if (needSwap) {
      if (cached) {
        this.touchCache(sessionId)
        this.applyCached(sessionId, cached, view)
      } else if (this.value.sessionId && (this.value.nodes.length > 0 || this.value.events.length > 0)) {
        this.holdPreviousThread = true
        this.replace({
          sessionId,
          trajectory: [],
          project: listedProject,
          view,
          focusCallId: view === 'chat' ? undefined : this.value.focusCallId,
          error: undefined,
          ...this.busyFlagsFor(sessionId),
          loadingOlder: false,
          trajectoryHasMore: false,
          trajectoryLoading: false,
          switchingSession: true,
          ...this.pendingInspector(),
        })
      } else {
        this.holdPreviousThread = false
        this.replace({
          sessionId,
          events: [],
          nodes: [],
          trajectory: [],
          project: listedProject,
          view,
          focusCallId: view === 'chat' ? undefined : this.value.focusCallId,
          error: undefined,
          ...this.busyFlagsFor(sessionId),
          hasMoreOlder: false,
          loadingOlder: false,
          trajectoryHasMore: false,
          trajectoryLoading: false,
          totalTurns: 0,
          switchingSession: true,
          ...this.pendingInspector(),
        })
      }
    }
    await this.revalidate(sessionId, view)
    if (this.wantsTrajectory(view)) await this.ensureTrajectory()
  }

  /** 静默拉取并套用；若用户已切走则丢弃 */
  private async revalidate(sessionId: string, view: ConversationView) {
    const gen = this.loadGen
    try {
      const res = await fetch(`/api/sessions/${sessionId}?turns=${SESSION_LOAD_TURNS}`)
      if (gen !== this.loadGen || this.value.sessionId !== sessionId) return
      if (!res.ok) {
        if (res.status === 404) await this.leaveMissingSession(sessionId)
        return
      }
      const body = (await res.json()) as SessionPayload
      if (gen !== this.loadGen || this.value.sessionId !== sessionId) return
      const events = compactSessionEvents(Array.isArray(body.events) ? body.events : [])
      const byTurn = body.dispatchedUsageByTurn ?? {}
      const tasksByTurn = body.dispatchedTasksByTurn ?? {}
      const dispatchedUsage = body.dispatchedUsage
      const nodes = this.buildNodes(events, byTurn)
      const hasMoreOlder = Boolean(body.hasMore)
      const totalTurns = typeof body.totalTurns === 'number' ? body.totalTurns : 0
      const sameLen = events.length === this.value.events.length
      const sameTail =
        sameLen &&
        events.at(-1)?.seq === this.value.events.at(-1)?.seq &&
        events.at(-1)?.ts === this.value.events.at(-1)?.ts
      this.putCache(sessionId, {
        events,
        nodes,
        project: body.project,
        hasMoreOlder,
        totalTurns,
        dispatchedUsageByTurn: byTurn,
        dispatchedTasksByTurn: tasksByTurn,
        ...(dispatchedUsage ? { dispatchedUsage } : {}),
      })
      // 切会话 hold 期间即使 tail「碰巧相同」也必须落地，否则会一直停在上一段画面
      if (
        !this.value.switchingSession &&
        sameTail &&
        body.project?.path === this.value.project?.path &&
        this.value.totalTurns === totalTurns
      ) {
        this.replace({
          dispatchedUsageByTurn: byTurn,
          dispatchedTasksByTurn: tasksByTurn,
          dispatchedUsage,
          nodes,
          ...this.rememberSessionInspector(sessionId, this.inspectorFromPayload(body), body.config?.goal),
        })
        this.syncDispatchedPoll()
        return
      }
      this.replace({
        sessionId: body.id || sessionId,
        events,
        nodes,
        project: body.project,
        hasMoreOlder,
        totalTurns,
        dispatchedUsageByTurn: byTurn,
        dispatchedTasksByTurn: tasksByTurn,
        dispatchedUsage,
        trajectory: this.wantsTrajectory(view) ? this.value.trajectory : [],
        switchingSession: false,
        error: undefined,
        ...this.rememberSessionInspector(sessionId, this.inspectorFromPayload(body), body.config?.goal),
      })
      this.holdPreviousThread = false
      this.syncDispatchedPoll()
      if (this.wantsTrajectory(view)) void this.ensureTrajectory()
      void this.refreshInbox(sessionId)
    } catch {
      /* 静默 */
    }
  }

  private applyCached(sessionId: string, cached: SessionCacheEntry, view: ConversationView) {
    this.holdPreviousThread = false
    this.replace({
      sessionId,
      events: cached.events,
      nodes: cached.nodes,
      trajectory: [],
      project: cached.project,
      view,
      focusCallId: view === 'chat' ? undefined : this.value.focusCallId,
      error: undefined,
      inbox: sessionId === this.value.sessionId ? this.value.inbox : [],
      ...this.busyFlagsFor(sessionId),
      hasMoreOlder: cached.hasMoreOlder,
      loadingOlder: false,
      trajectoryHasMore: false,
      trajectoryLoading: false,
      totalTurns: cached.totalTurns,
      dispatchedUsageByTurn: cached.dispatchedUsageByTurn,
      dispatchedTasksByTurn: cached.dispatchedTasksByTurn,
      dispatchedUsage: cached.dispatchedUsage,
      switchingSession: false,
      ...this.pendingInspector(),
    })
    this.syncDispatchedPoll()
    void this.refreshInbox(sessionId)
  }

  private stashCurrent() {
    const id = this.value.sessionId
    if (!id) return
    this.putCache(id, {
      events: this.value.events,
      nodes: this.value.nodes,
      project: this.value.project,
      hasMoreOlder: this.value.hasMoreOlder,
      totalTurns: this.value.totalTurns,
      dispatchedUsageByTurn: this.value.dispatchedUsageByTurn,
      dispatchedTasksByTurn: this.value.dispatchedTasksByTurn,
      ...(this.value.dispatchedUsage ? { dispatchedUsage: this.value.dispatchedUsage } : {}),
    })
  }

  private putCache(id: string, entry: SessionCacheEntry) {
    if (this.cache.has(id)) this.cacheOrder = this.cacheOrder.filter((item) => item !== id)
    this.cache.set(id, entry)
    this.cacheOrder.push(id)
    while (this.cacheOrder.length > SESSION_CACHE_MAX) {
      const evict = this.cacheOrder.shift()
      if (evict) this.cache.delete(evict)
    }
  }

  private touchCache(id: string) {
    if (!this.cache.has(id)) return
    this.cacheOrder = this.cacheOrder.filter((item) => item !== id)
    this.cacheOrder.push(id)
  }

  private dropCache(id: string) {
    this.cache.delete(id)
    this.cacheOrder = this.cacheOrder.filter((item) => item !== id)
  }

  /** 上滑加载更早 chat turn；返回是否真正拉到了数据 */
  async loadOlder(): Promise<boolean> {
    const { sessionId, hasMoreOlder, loadingOlder, events } = this.value
    if (!sessionId || !hasMoreOlder || loadingOlder) return false
    const beforeSeq = events[0]?.seq
    if (beforeSeq == null) return false
    this.replace({ loadingOlder: true })
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/events?beforeSeq=${beforeSeq}&turns=${SESSION_TAIL_TURNS}`,
      )
      if (!res.ok) throw new Error(`加载更早事件失败：${res.status}`)
      const body = (await res.json()) as SessionPayload
      const older = compactSessionEvents(Array.isArray(body.events) ? body.events : [])
      if (!older.length) {
        this.replace({ hasMoreOlder: false, loadingOlder: false })
        return false
      }
      const seen = new Set(events.map((event) => event.seq))
      const merged = [...older.filter((event) => !seen.has(event.seq)), ...events].sort(
        (a, b) => a.seq - b.seq,
      )
      this.replace({
        events: merged,
        nodes: this.buildNodes(merged),
        hasMoreOlder: Boolean(body.hasMore),
        loadingOlder: false,
        totalTurns: typeof body.totalTurns === 'number' ? body.totalTurns : this.value.totalTurns,
      })
      return true
    } catch (error) {
      this.replace({ loadingOlder: false, error: String(error) })
      return false
    }
  }

  /** 进入 Trajectory：只拉轻量 rows 索引，不拉全文 events。不改 ConversationView，避免 /s/:id 把 debug 打回 chat。 */
  async ensureTrajectory() {
    const sessionId = this.value.sessionId
    if (!sessionId) return
    this.trajectoryLive = true
    if (this.value.trajectoryLoading && this.trajFetchSessionId === sessionId) return
    const gen = ++this.trajGen
    this.trajFetchSessionId = sessionId
    this.replace({ trajectoryLoading: true })
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/trajectory?turns=${TRAJECTORY_TAIL_TURNS}`,
      )
      if (gen !== this.trajGen || this.value.sessionId !== sessionId) return
      if (!res.ok) throw new Error(`加载 trajectory 失败：${res.status}`)
      const body = (await res.json()) as TrajectoryPayload
      this.replace({
        trajectory: Array.isArray(body.rows) ? body.rows : [],
        trajectoryHasMore: Boolean(body.hasMore),
        trajectoryLoading: false,
        totalTurns: typeof body.totalTurns === 'number' ? body.totalTurns : this.value.totalTurns,
      })
    } catch (error) {
      if (gen !== this.trajGen || this.value.sessionId !== sessionId) return
      this.replace({ trajectoryLoading: false, error: String(error) })
    }
  }

  async refreshTrajectoryIndex() {
    const sessionId = this.value.sessionId
    if (!sessionId || !this.wantsTrajectory()) return
    const gen = this.trajGen
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/trajectory?turns=${TRAJECTORY_TAIL_TURNS}`,
      )
      if (gen !== this.trajGen || this.value.sessionId !== sessionId) return
      if (!res.ok) return
      const body = (await res.json()) as TrajectoryPayload
      this.replace({
        trajectory: Array.isArray(body.rows) ? body.rows : [],
        trajectoryHasMore: Boolean(body.hasMore),
        totalTurns: typeof body.totalTurns === 'number' ? body.totalTurns : this.value.totalTurns,
      })
    } catch {
      /* ignore */
    }
  }

  async loadOlderTrajectory(): Promise<boolean> {
    const { sessionId, trajectoryHasMore, trajectoryLoading, trajectory } = this.value
    if (!sessionId || !trajectoryHasMore || trajectoryLoading) return false
    const beforeSeq = trajectory[0]?.seq
    if (beforeSeq == null) return false
    this.replace({ trajectoryLoading: true })
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/trajectory?beforeSeq=${beforeSeq}&turns=${TRAJECTORY_TAIL_TURNS}`,
      )
      if (!res.ok) throw new Error(`加载更早 trajectory 失败：${res.status}`)
      const body = (await res.json()) as TrajectoryPayload
      const older = Array.isArray(body.rows) ? body.rows : []
      if (!older.length) {
        this.replace({ trajectoryHasMore: false, trajectoryLoading: false })
        return false
      }
      const seen = new Set(trajectory.map((row) => row.seq))
      const merged = [...older.filter((row) => !seen.has(row.seq)), ...trajectory].sort(
        (a, b) => a.seq - b.seq,
      )
      this.replace({
        trajectory: merged,
        trajectoryHasMore: Boolean(body.hasMore),
        trajectoryLoading: false,
        totalTurns: typeof body.totalTurns === 'number' ? body.totalTurns : this.value.totalTurns,
      })
      return true
    } catch (error) {
      this.replace({ trajectoryLoading: false, error: String(error) })
      return false
    }
  }

  /** 详情懒加载：单条事件全文 */
  async fetchEventDetail(seq: number): Promise<SessionEvent | null> {
    const sessionId = this.value.sessionId
    if (!sessionId) return null
    const res = await fetch(`/api/sessions/${sessionId}/events/${seq}`)
    if (!res.ok) throw new Error(`加载事件失败：${res.status}`)
    const body = (await res.json()) as { event?: SessionEvent }
    return body.event ?? null
  }

  /** 详情懒加载：assistant/message 的 derived request（含工具 schema 估算 token，供 4 类占比展示） */
  /** 拉取全量 usage 趋势（所有 step 的 input/output/cacheRead + 压缩点 seq），供用量面板折线图使用。 */
  async fetchUsageTrend(): Promise<UsageTrend> {
    const sessionId = this.value.sessionId
    if (!sessionId) return { points: [], compactions: [] }
    const res = await fetch(`/api/sessions/${sessionId}/usage-trend`)
    if (!res.ok) throw new Error(`加载 usage 趋势失败：${res.status}`)
    const body = (await res.json()) as { points?: UsageTrendPoint[]; compactions?: number[] }
    return {
      points: Array.isArray(body.points) ? body.points : [],
      compactions: Array.isArray(body.compactions) ? body.compactions : [],
    }
  }

  async fetchEventRequest(seq: number): Promise<{ messages: DerivedMessage[]; toolsTokens: number }> {
    const sessionId = this.value.sessionId
    if (!sessionId) return { messages: [], toolsTokens: 0 }
    const res = await fetch(`/api/sessions/${sessionId}/events/${seq}/request`)
    if (!res.ok) throw new Error(`加载 request 失败：${res.status}`)
    const body = (await res.json()) as { messages?: DerivedMessage[]; toolsTokens?: number }
    return {
      messages: Array.isArray(body.messages) ? body.messages : [],
      toolsTokens: typeof body.toolsTokens === 'number' ? body.toolsTokens : 0,
    }
  }

  setProjectMeta(project?: { name: string; path?: string; boundAt: number }) {
    const current = this.value.project
    const sameProject =
      current === project ||
      (Boolean(current) === Boolean(project) &&
        current?.name === project?.name &&
        current?.path === project?.path &&
        current?.boundAt === project?.boundAt)
    const sessionId = this.value.sessionId
    const sessionsUnchanged =
      !sessionId ||
      this.value.sessions.every((item) => {
        if (item.id !== sessionId) return true
        const p = item.project
        return (
          p === project ||
          (Boolean(p) === Boolean(project) &&
            p?.name === project?.name &&
            p?.path === project?.path &&
            p?.boundAt === project?.boundAt)
        )
      })
    if (sameProject && sessionsUnchanged) return

    const sessions = sessionId
      ? this.value.sessions.map((item) =>
          item.id === sessionId ? { ...item, project } : item,
        )
      : this.value.sessions
    this.replace({ project, sessions })
  }

  async forkCurrent() {
    const sessionId = this.value.sessionId
    if (!sessionId) throw new Error('no session')
    const res = await fetch(`/api/sessions/${sessionId}/fork`, { method: 'POST' })
    const body = (await res.json()) as {
      id?: string
      error?: string
      mascot?: SessionListItem['mascot']
    }
    if (!res.ok || !body.id) throw new Error(body.error || 'fork failed')
    markSidebarMascotFresh(body.id)
    const parent = this.value.sessions.find((item) => item.id === sessionId)
    if (parent && !this.value.sessions.some((item) => item.id === body.id)) {
      this.replace({
        sessions: [
          {
            ...parent,
            id: body.id,
            pinned: false,
            tags: [],
            ...(body.mascot ? { mascot: body.mascot } : {}),
            updatedAt: Date.now(),
          },
          ...this.value.sessions,
        ],
      })
    }
    await this.load(body.id, { view: 'chat' })
    await this.refreshSessions()
    return body.id
  }

  async setSessionPinned(id: string, pinned: boolean) {
    const prev = this.value.sessions
    this.replace({
      sessions: prev.map((item) => (item.id === id ? { ...item, pinned } : item)),
    })
    try {
      const res = await fetch(`/api/sessions/${id}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      if (!res.ok) throw new Error(`pin failed HTTP ${res.status}`)
    } catch (error) {
      this.replace({ sessions: prev, error: String(error) })
      throw error
    }
    void this.refreshSessions()
  }

  async setSessionTitle(id: string, title: string) {
    const next = title.trim()
    const prev = this.value.sessions
    if (next) {
      this.replace({
        sessions: prev.map((item) => (item.id === id ? { ...item, title: next } : item)),
      })
    }
    try {
      const res = await fetch(`/api/sessions/${id}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: next || null }),
      })
      if (!res.ok) throw new Error(`rename failed HTTP ${res.status}`)
    } catch (error) {
      this.replace({ sessions: prev, error: String(error) })
      throw error
    }
    void this.refreshSessions()
  }

  async patchInspector(id: string, inspector: SessionInspectorBind) {
    const prev = this.value.sessions
    const current = prev.find((item) => item.id === id)?.inspector
    const nextBind = mergeInspectorBind(current, inspector)
    this.replace({
      sessions: prev.map((item) => (item.id === id ? { ...item, inspector: nextBind } : item)),
    })
    try {
      const res = await fetch(`/api/sessions/${id}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inspector: nextBind ?? null }),
      })
      if (!res.ok) throw new Error(`inspector bind failed HTTP ${res.status}`)
    } catch (error) {
      this.replace({ sessions: prev, error: String(error) })
      throw error
    }
  }

  async deleteSession(id: string) {
    const prevSessions = this.value.sessions
    const wasActive = this.value.sessionId === id
    // 乐观更新：先从侧栏拿掉，避免等网络才「卡一下消失」
    this.dropCache(id)
    const busySessions = { ...this.value.busySessions }
    delete busySessions[id]
    this.replace({
      sessions: prevSessions.filter((item) => item.id !== id),
      busySessions,
      ...(wasActive
        ? {
            sessionId: null,
            events: [],
            nodes: [],
            trajectory: [],
            pending: false,
            agentStatus: 'idle' as const,
            project: undefined,
            hasMoreOlder: false,
            loadingOlder: false,
            trajectoryHasMore: false,
            trajectoryLoading: false,
            totalTurns: 0,
            switchingSession: false,
            error: undefined,
          }
        : {}),
    })

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      const body = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(body.error || `删除失败：${res.status}`)
    } catch (error) {
      this.replace({ sessions: prevSessions, error: String(error) })
      throw error
    }

    await this.refreshSessions()
    if (!wasActive) return
    const next = this.value.sessions[0]?.id
    if (next) {
      await this.load(next, { view: 'chat' })
      return
    }
    this.loadGen += 1
    this.replace({
      sessionId: null,
      events: [],
      nodes: [],
      trajectory: [],
      approvals: [],
      pending: false,
      agentStatus: 'idle',
      inbox: [],
      view: 'chat',
      focusCallId: undefined,
      project: undefined,
      hasMoreOlder: false,
      loadingOlder: false,
      trajectoryHasMore: false,
      trajectoryLoading: false,
      totalTurns: 0,
      switchingSession: false,
      error: undefined,
    })
  }

  async send(
    text: string,
    kind: 'wake' | 'inject' = 'wake',
    extraTools: string[] = [],
    images: Array<{ name: string; mime: string; url: string }> = [],
  ) {
    const content = text.trim()
    const pics = images.filter((item) => item?.url?.startsWith('data:image/')).slice(0, 6)
    if (!content && !pics.length) return
    const sessionId = await this.ensureSession()
    const tools = [...new Set(extraTools.map((name) => name.trim()).filter(Boolean))]
    const liveContext = captureLiveUiContext(this)
    const busy = this.value.pending || this.value.agentStatus === 'running'
    const hasWake = this.value.inbox.some((item) => item.kind === 'wake')
    // 忙碌且已有 wake：再发 → inject；否则 wake。
    // 空闲 wake 也必须 wait:false：否则 POST 会卡到整段生成完（背长文会空等七八秒，
    // 轨迹里也没有 assistant/chunk），HTTP/1 还可能堵住同域 WS。
    const effectiveKind: 'wake' | 'inject' =
      kind === 'inject' || (kind === 'wake' && busy && hasWake) ? 'inject' : 'wake'
    const imagePayload = pics.length ? { images: pics } : {}
    const body: Record<string, unknown> =
      effectiveKind === 'inject'
        ? { text: content || '（图片）', kind: 'inject', ...(tools.length ? { extraTools: tools } : {}), ...(liveContext ? { liveContext } : {}), ...imagePayload }
        : {
            text: content || '（图片）',
            wait: false,
            ...(tools.length ? { extraTools: tools } : {}),
            ...(liveContext ? { liveContext } : {}),
            ...imagePayload,
          }

    if (effectiveKind === 'inject') {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; inbox?: InboxQueueItem[] }
      if (!res.ok) {
        this.replace({ error: data.error || `注入失败：${res.status}` })
        throw new Error(data.error || `注入失败：${res.status}`)
      }
      if (Array.isArray(data.inbox)) this.setInbox(data.inbox, sessionId)
      return
    }

    this.markBusyHold()
    this.setAgentStatus('running', undefined, sessionId)
    this.replace({ error: undefined })
    this.paintOutgoingUser(sessionId, content || '（图片）', pics)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as {
        error?: string
        sessionId?: string
        text?: string
        queued?: boolean
        inbox?: InboxQueueItem[]
      }
      if (!res.ok) throw new Error(data.error || `发送失败：${res.status}`)
      if (Array.isArray(data.inbox)) this.setInbox(data.inbox, data.sessionId ?? sessionId)
      // wait:false：HTTP 立刻返回，token / 状态走 WS。不要 GET 整页，会和首包 chunk 抢，看起来像先卡再整段弹出。
      if (typeof data.text === 'string' && data.text.startsWith('模型调用失败：')) {
        this.replace({ error: data.text })
      }
    } catch (error) {
      try {
        await this.load(sessionId, { view: this.value.view, wait: true })
      } catch {
        /* 加载失败时仍展示下方 error */
      }
      this.setAgentStatus('idle', undefined, sessionId)
      this.replace({ error: String(error) })
      throw error
    }
    // 成功后不要在 finally 里强行 idle：agent 仍在跑，状态交给 WS agent/status
  }

  private paintOutgoingUser(
    sessionId: string,
    text: string,
    images: Array<{ name: string; mime: string; url: string }>,
  ) {
    if (this.value.sessionId !== sessionId) return
    if (this.holdPreviousThread) return
    const exists = this.value.events.some(
      (item) => item.type === 'user/message' && item.text === text && item.ts > Date.now() - 8000,
    )
    if (exists) return
    this.ingest(sessionId, {
      type: 'user/message',
      text,
      kind: 'wake',
      seq: -Date.now(),
      ts: Date.now(),
      ...(images.length ? { images } : {}),
    })
  }

  setInbox(inbox: InboxQueueItem[], sessionId?: string) {
    const id = sessionId ?? this.value.sessionId
    if (id && this.value.sessionId && id !== this.value.sessionId) return
    const next = Array.isArray(inbox) ? inbox : []
    if (JSON.stringify(next) === JSON.stringify(this.value.inbox)) return
    this.replace({ inbox: next })
  }

  async dropInboxItem(itemId: string) {
    const sessionId = this.value.sessionId
    if (!sessionId || !itemId) return false
    try {
      const res = await fetch(`/api/sessions/${sessionId}/inbox/drop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: itemId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; inbox?: InboxQueueItem[] }
      if (!res.ok) {
        this.replace({ error: data.error || `删除排队失败：${res.status}` })
        return false
      }
      if (Array.isArray(data.inbox)) this.setInbox(data.inbox, sessionId)
      return true
    } catch (error) {
      this.replace({ error: String(error) })
      return false
    }
  }

  async patchInboxItem(itemId: string, text: string) {
    const sessionId = this.value.sessionId
    if (!sessionId || !itemId) return false
    try {
      const res = await fetch(`/api/sessions/${sessionId}/inbox/patch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: itemId, text }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; inbox?: InboxQueueItem[] }
      if (!res.ok) {
        this.replace({ error: data.error || `修改排队失败：${res.status}` })
        return false
      }
      if (Array.isArray(data.inbox)) this.setInbox(data.inbox, sessionId)
      return true
    } catch (error) {
      this.replace({ error: String(error) })
      return false
    }
  }

  async refreshInbox(sessionId = this.value.sessionId) {
    if (!sessionId) {
      this.replace({ inbox: [] })
      return
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/inbox`)
      if (!res.ok || this.value.sessionId !== sessionId) return
      const body = (await res.json()) as { inbox?: InboxQueueItem[] }
      this.setInbox(Array.isArray(body.inbox) ? body.inbox : [], sessionId)
    } catch {
      /* 静默 */
    }
  }

  async cancel() {
    const sessionId = this.value.sessionId
    if (!sessionId) return
    const goal = this.value.sessions.find((item) => item.id === sessionId)?.goal
    const aborting = fetch(`/api/sessions/${sessionId}/cancel`, { method: 'POST' }).catch(() => undefined)
    if (goal?.status === 'pursuing') void this.controlGoal('pause')
    await aborting
    this.setAgentStatus('idle', undefined, sessionId)
  }

  async controlGoal(action: 'pause' | 'resume' | 'clear') {
    const sessionId = this.value.sessionId
    if (!sessionId) return
    const res = await fetch(`/api/sessions/${sessionId}/goal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string; goal?: SessionGoal | null }
    if (!res.ok) {
      this.replace({ error: data.error || `Goal ${action} 失败` })
      return
    }
    const goal = data.goal ?? undefined
    const sessions = this.value.sessions.map((item) => (item.id === sessionId ? { ...item, goal } : item))
    this.replace({
      sessions,
      ...(action === 'pause' || action === 'clear' ? { pending: false, agentStatus: 'idle' as const } : {}),
      error: undefined,
    })
  }

  /** 空回车：abort 当前回合并立刻 claim 队列（需队列里有 wake） */
  async flushInbox() {
    const sessionId = this.value.sessionId
    if (!sessionId) return false
    if (!this.value.inbox.some((item) => item.kind === 'wake')) return false
    this.markBusyHold()
    this.setAgentStatus('running', undefined, sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/inbox/flush`, { method: 'POST' })
      const data = (await res.json()) as {
        error?: string
        flushed?: boolean
        inbox?: InboxQueueItem[]
      }
      if (!res.ok) {
        this.replace({ error: data.error || `冲刷队列失败：${res.status}` })
        return false
      }
      if (Array.isArray(data.inbox)) this.setInbox(data.inbox, sessionId)
      return Boolean(data.flushed)
    } catch (error) {
      this.replace({ error: String(error) })
      return false
    }
  }

  async decideApproval(id: string, allow: boolean) {
    await fetch(`/api/approvals/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allow }),
    })
    this.removeApproval(id)
  }

  private replace(patch: Partial<SessionViewState>) {
    this.value = { ...this.value, ...patch }
    for (const fn of this.listeners) fn()
  }
}

function upsertEvent(events: SessionEvent[], event: SessionEvent) {
  if (event.type === 'content/edits') {
    const idx = events.findLastIndex((item) => item.type === 'content/edits' && item.turn === event.turn)
    if (idx >= 0) {
      const prev = events[idx]
      if (prev?.type === 'content/edits') {
        const next = [...events]
        next[idx] = {
          ...prev,
          files: mergeContentEditFiles(prev.files, event.files),
          ts: event.ts,
        }
        return next
      }
    }
  }
  if (event.type === 'tool/call') {
    const idx = events.findLastIndex((item) => item.type === 'tool/call' && item.id === event.id)
    if (idx >= 0) {
      const prev = events[idx]
      if (prev?.type === 'tool/call') {
        const next = [...events]
        next[idx] = { ...prev, name: event.name || prev.name, arguments: event.arguments, ts: event.ts, seq: prev.seq }
        return next
      }
    }
  }
  if (event.type === 'tool/result') {
    const idx = events.findLastIndex((item) => item.type === 'tool/result' && item.id === event.id)
    if (idx >= 0) {
      const prev = events[idx]
      if (prev?.type === 'tool/result') {
        const next = [...events]
        next[idx] = {
          ...prev,
          name: event.name || prev.name,
          ok: event.ok,
          detail: event.detail,
          ts: event.ts,
          seq: prev.seq,
          ...(event.partial ? { partial: true } : { partial: undefined }),
        }
        return next
      }
    }
  }
  if (events.some((item) => item.seq === event.seq)) {
    if (event.type === 'content/edits') {
      return events.map((item) =>
        item.seq === event.seq && item.type === 'content/edits'
          ? { ...item, files: mergeContentEditFiles(item.files, event.files), ts: event.ts }
          : item,
      )
    }
    if (event.type === 'tool/call') {
      return events.map((item) =>
        item.seq === event.seq && item.type === 'tool/call'
          ? { ...item, name: event.name || item.name, arguments: event.arguments, ts: event.ts }
          : item,
      )
    }
    if (event.type === 'tool/result') {
      return events.map((item) =>
        item.seq === event.seq && item.type === 'tool/result'
          ? {
              ...item,
              name: event.name || item.name,
              ok: event.ok,
              detail: event.detail,
              ts: event.ts,
              ...(event.partial ? { partial: true } : { partial: undefined }),
            }
          : item,
      )
    }
    return events
  }
  if (event.type === 'assistant/chunk') {
    const last = events.at(-1)
    if (last?.type === 'assistant/chunk' && (last.channel === 'reasoning') === (event.channel === 'reasoning')) {
      return [
        ...events.slice(0, -1),
        { ...last, text: last.text + event.text, ts: event.ts },
      ]
    }
  }
  if (event.type === 'assistant/message') {
    const last = events.at(-1)
    if (last?.type === 'assistant/chunk' && last.channel !== 'reasoning') {
      return [...events.slice(0, -1), event]
    }
  }
  return [...events, event].sort((a, b) => a.seq - b.seq)
}

function patchStreamingNodes(
  nodes: ChatNode[],
  chunk: Extract<SessionEvent, { type: 'assistant/chunk' }>,
): ChatNode[] {
  const last = nodes.at(-1)
  if (last?.kind === 'reply') {
    const parts = [...last.parts]
    const lastPart = parts.at(-1)
    const isThink = chunk.channel === 'reasoning'
    if (lastPart?.kind === (isThink ? 'think' : 'assistant') && lastPart.streaming) {
      if (lastPart.text === chunk.text) return nodes
      parts[parts.length - 1] = { ...lastPart, text: chunk.text, streaming: true }
    } else {
      if (isThink) {
        parts.push({ id: `think-${chunk.seq}`, kind: 'think', text: chunk.text, streaming: true })
      } else {
        if (lastPart?.kind === 'think' && lastPart.streaming) {
          parts[parts.length - 1] = { ...lastPart, streaming: false }
        }
        parts.push({ id: `a-${chunk.seq}`, kind: 'assistant', text: chunk.text, streaming: true })
      }
    }
    const copyText = parts
      .filter((part) => part.kind === 'assistant')
      .map((part) => (part.kind === 'assistant' ? part.text.trim() : ''))
      .filter(Boolean)
      .join('\n\n')
    return [...nodes.slice(0, -1), { ...last, parts, copyText, streaming: true, finished: false }]
  }
  return [
    ...nodes,
    {
      id: `r-${chunk.seq}`,
      kind: 'reply',
      parts: [{ id: `a-${chunk.seq}`, kind: chunk.channel === 'reasoning' ? 'think' : 'assistant', text: chunk.text, streaming: true }],
      copyText: chunk.channel === 'reasoning' ? '' : chunk.text,
      streaming: true,
      finished: false,
    },
  ]
}

export function bindSessionView(source: SessionViewService) {
  return function useSessionView<S>(sel: (state: SessionViewState) => S): S {
    return useSyncExternalStore(source.subscribe, () => sel(source.get()), () => sel(source.get()))
  }
}

export const name = 'session-view'
export const inject = [] as const

export function apply(ctx: Context) {
  new SessionViewService(ctx)
}
