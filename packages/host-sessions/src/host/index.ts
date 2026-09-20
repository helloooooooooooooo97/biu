import { Service, type Context } from 'cordis'
import { basename, isAbsolute, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { platform } from 'node:os'
import { assistantContentForApi, type LlmMessage } from '@biu/host-llm'
import type { AgentSendOptions, AgentHandle, AgentTurn } from '@biu/host-agents'
import {
  SESSION_FORMAT_VERSION,
  type SessionEvent,
  type SessionEventBody,
  type SessionMascot,
  type SessionProject,
  type SessionRecord,
  type SessionConfig,
  type MessageSender,
  nameFromSessionMascot,
  mergeSessionConfig,
  normalizeSessionConfig,
  isSessionCompactPoint,
  sessionCompactSummaryText,
  mergeContentEditFiles,
} from '@biu/type-session'
import {
  ensureSessionMascot,
  isSessionMascot,
  mascotFromSessionId,
  pickSessionMascot,
  type SessionMascot as AssignedMascot,
} from './session-mascot.ts'
import { rebuildHealedEvents } from './session-heal.ts'
import { sessionsCollection } from './sessions-collection.ts'
import { eventsCollection } from './events-collection.ts'

export type { SessionEvent, SessionEventBody, SessionProject, SessionRecord, SessionMascot, SessionConfig }
export { SESSION_FORMAT_VERSION, normalizeSessionConfig, mergeSessionConfig }
export {
  findOpenTurnStep,
  healInterruptedTurnBodies,
  rebuildHealedEvents,
} from './session-heal.ts'

export function deriveMessages(events: SessionEvent[]): LlmMessage[] {
  let system = ''
  const messages: LlmMessage[] = []
  /** 当前 assistant.tool_calls 的声明顺序（接口要求 role:tool 必须按此顺序紧跟） */
  let pendingOrder: string[] = []
  const pendingNames = new Map<string, string>()
  const readyDetail = new Map<string, string>()
  /** 只有 partial、没有最终 result 时，用最后一片 detail 配平 */
  const partialToolDetail = new Map<string, string>()

  const emitReadyTools = () => {
    while (pendingOrder.length && readyDetail.has(pendingOrder[0]!)) {
      const id = pendingOrder.shift()!
      messages.push({ role: 'tool', tool_call_id: id, content: readyDetail.get(id)! })
      readyDetail.delete(id)
      pendingNames.delete(id)
      partialToolDetail.delete(id)
    }
  }

  const flushOrphanTools = () => {
    if (!pendingOrder.length) return
    for (const id of pendingOrder) {
      const name = pendingNames.get(id) || id
      const content =
        readyDetail.get(id) ||
        partialToolDetail.get(id) ||
        `interrupted: missing tool result for ${name}`
      messages.push({ role: 'tool', tool_call_id: id, content })
    }
    pendingOrder = []
    pendingNames.clear()
    readyDetail.clear()
    partialToolDetail.clear()
  }

  for (const event of events) {
    // 压缩点：sessions 的 compact/clear（含旧独立工具名）。从此处重起，摘要取调用参数。
    if (isSessionCompactPoint(event)) {
      messages.length = 0
      pendingOrder = []
      pendingNames.clear()
      readyDetail.clear()
      partialToolDetail.clear()
      const text = sessionCompactSummaryText(event)
      if (text) {
        messages.push({ role: 'system', content: `[已压缩的历史摘要] ${text}` })
      }
    } else if (event.type === 'system/prompt') {
      system = event.text
    } else if (event.type === 'user/message') {
      flushOrphanTools()
      const images = event.images?.filter((item) => item?.url && item.url.startsWith('data:image/')) ?? []
      if (images.length) {
        messages.push({
          role: 'user',
          content: [
            ...(event.text.trim() ? [{ type: 'text' as const, text: event.text }] : []),
            ...images.map((item) => ({ type: 'image_url' as const, image_url: { url: item.url } })),
          ],
        })
      } else {
        messages.push({ role: 'user', content: event.text })
      }
    } else if (event.type === 'assistant/message') {
      flushOrphanTools()
      const hasToolCalls = Boolean(event.tool_calls?.length)
      messages.push({
        role: 'assistant',
        content: assistantContentForApi(event.text, hasToolCalls),
        ...(hasToolCalls
          ? {
              tool_calls: event.tool_calls!.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      })
      if (hasToolCalls) {
        pendingOrder = event.tool_calls!.map((call) => call.id)
        for (const call of event.tool_calls!) pendingNames.set(call.id, call.name)
      }
    } else if (event.type === 'tool/result') {
      // 错位/重复的 tool/result 不能进 LLM（否则报 tool 必须跟在 tool_calls 后）
      if (!pendingNames.has(event.id)) continue
      if (event.partial) {
        partialToolDetail.set(event.id, event.detail)
        continue
      }
      readyDetail.set(event.id, event.detail)
      emitReadyTools()
    }
  }
  flushOrphanTools()
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

export interface InputComposition {
  totalChars: number
  histChars: number
  curChars: number
  histPct: number
}

/**
 * 统计发给 LLM 的输入中「历史 turn」与「本次 turn」的字数占比。
 * 独立纯函数，不改 deriveMessages 投影逻辑。
 * - 划分：turn/start..turn/end 为一个 turn。「本次(cur)」= 最近一次 turn
 *   （进行中优先；若无进行中即 session idle 则取最后一个已完成的 turn），
 *   system prompt 计入本次。「历史(hist)」= 本次之前更早的所有 turn。
 * - 角色归类：user/message、assistant/message(含 tool_calls 的 arguments)、
 *   assistant/chunk、tool/call、tool/result 按所在 turn 计入；system/prompt、system/compact 计入当前 turn。
 * - 压缩点语义与 deriveMessages 对齐：仅统计最后一个压缩点之后的事件。
 * - 字数用字符长度。total 为 0 时各 pct 返回 0。
 */
export function statInputComposition(events: SessionEvent[]): InputComposition {
  const len = (s: string | null | undefined) => (s ? s.length : 0)
  const isCompact = (e: SessionEvent) => isSessionCompactPoint(e)

  // —— 第一遍：定位「本次(最近一次) turn」。
  //     与 deriveMessages 一致：仅统计最后一个压缩点之后的事件（无压缩点则全量）。
  //     语义：优先取「当前进行中 turn」(有 turn/start 无 turn/end)；
  //     若无进行中 turn（session idle），则取最后一个已开始的 turn 作为本次，
  //     而非把历史全部计为历史（否则 idle 时 histPct≈99%，失真）。
  //     本次之前更早的 turn = 历史(hist)。system prompt 始终计入本次(cur)。 ——
  const lastCompactIdx = events.reduce((acc, e, i) => (isCompact(e) ? i : acc), -1)
  const started: number[] = []
  const ended = new Set<number>()
  for (let i = lastCompactIdx >= 0 ? lastCompactIdx + 1 : 0; i < events.length; i++) {
    const e = events[i]
    if (e.type === 'turn/start') started.push(e.turn)
    else if (e.type === 'turn/end') ended.add(e.turn)
  }
  // 本次 turn = 进行中的最新 turn；若无进行中，取最后一个开始的 turn。
  let curTurn: number | null = null
  for (const t of started) {
    if (!ended.has(t) && (curTurn == null || t > curTurn)) curTurn = t
  }
  if (curTurn == null && started.length > 0) {
    curTurn = started[started.length - 1]
  }

  // —— 第二遍：按归属 turn 累计输入字数 ——
  let openTurn: number | null = null
  let systemChars = 0
  const byTurn = new Map<number, number>()

  const add = (owner: number | null, n: number) => {
    const key = owner ?? -1 // -1 表示 turn 边界外的孤立内容（归历史）
    byTurn.set(key, (byTurn.get(key) ?? 0) + n)
  }

  for (const event of events) {
    if (isCompact(event)) {
      // 压缩点：从点之后重算，丢弃点前历史（与 deriveMessages 一致）
      openTurn = null
      systemChars = 0
      byTurn.clear()
      continue
    }
    if (event.type === 'turn/start') {
      openTurn = event.turn
      continue
    }
    if (event.type === 'turn/end') {
      openTurn = null
      continue
    }
    switch (event.type) {
      case 'system/prompt':
      case 'system/compact':
        systemChars += len(event.text)
        break
      case 'user/message':
        add(openTurn, len(event.text))
        break
      case 'assistant/message':
        add(openTurn, len(event.text))
        for (const call of event.tool_calls ?? []) add(openTurn, len(call.arguments))
        break
      case 'assistant/chunk':
        add(openTurn, len(event.text))
        break
      case 'tool/call':
        add(openTurn, len(event.arguments))
        break
      case 'tool/result':
        if (!event.partial) add(openTurn, len(event.detail))
        break
    }
  }

  // 历史 = 本次 turn 之前更早的 turn 内容（含 turn 边界外孤立内容的 -1 键）；
  // 本次 = 最近一次 turn（进行中或最后一个已结束）的内容 + system prompt。
  let histChars = 0
  for (const [turn, chars] of byTurn) {
    if (turn !== curTurn) histChars += chars
  }
  let curChars = systemChars
  if (curTurn != null) curChars += byTurn.get(curTurn) ?? 0

  const totalChars = histChars + curChars
  if (totalChars === 0) {
    return { totalChars: 0, histChars: 0, curChars: 0, histPct: 0 }
  }
  const histPct = histChars / totalChars
  return { totalChars, histChars, curChars, histPct }
}


/** 粗略估算一段文本的 token 数（英文 ~1/4 字符，中日韩 ~1/1.5 字符）。 */
export function estimateTokens(text: string): number {
  let ascii = 0
  let cjk = 0
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    if ((c >= 0x2e80 && c <= 0x9fff) || c >= 0x20000) cjk++
    else ascii++
  }
  return Math.ceil(ascii / 4 + cjk / 1.5)
}

function msgTokens(m: LlmMessage): number {
  if (Array.isArray(m.content)) {
    let n = 0
    for (const part of m.content) {
      if (part.type === 'text') n += estimateTokens(part.text)
      else n += 1200
    }
    return n + (typeof m.tool_calls?.length === 'number' ? m.tool_calls.length * 6 : 0)
  }
  const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
  return estimateTokens(content) + (typeof m.tool_calls?.length === 'number' ? m.tool_calls.length * 6 : 0)
}

/**
 * 滑动窗口 + 预算：消息总量超过预算时，保留"开头稳定锚点 + 最近 N 条"，丢弃中间旧消息。
 * 开头保留使 system/前缀相对稳定（利于缓存命中）；最近保留当前上下文。不影响短会话（不超预算原样返回）。
 */
export function applyContextBudget(messages: LlmMessage[], budgetTokens: number, keepRecent = 14): LlmMessage[] {
  if (budgetTokens <= 0 || messages.length === 0) return messages
  const total = messages.reduce((s, m) => s + msgTokens(m), 0)
  if (total <= budgetTokens) return messages
  const head = Math.max(1, messages[0]?.role === 'system' ? 1 : 0)
  const start = messages.slice(0, head)
  const rest = messages.slice(head)
  let from = Math.max(0, rest.length - keepRecent)
  while (from > 0 && rest[from]?.role === 'tool') from -= 1
  let tail = rest.slice(from)
  while (tail.length && tail[0]?.role === 'tool') {
    if (from === 0) break
    from -= 1
    tail = rest.slice(from)
  }
  while (tail.length) {
    const last = tail[tail.length - 1]
    if (last?.role === 'assistant' && last.tool_calls?.length) {
      const need = last.tool_calls.length
      const have = rest.length - (from + tail.length)
      if (have >= need && rest.slice(from + tail.length, from + tail.length + need).every((item) => item.role === 'tool')) {
        tail = rest.slice(from, from + tail.length + need)
        break
      }
      tail = tail.slice(0, -1)
      continue
    }
    break
  }
  return [...start, ...tail]
}

export class SessionsService extends Service {
  private cache = new Map<string, SessionRecord>()
  private defaultSessionPromise: Promise<string> | null = null

  constructor(ctx: Context) {
    super(ctx, 'sessions')
    ctx.inject(['database'], (inner) => {
      inner.database.register(
        sessionsCollection({
          listSummaries: () => this.listSummaries(),
          rename: (id, title) => this.rename(id, title),
          patchConfig: (id, patch) => this.patchConfig(id, patch),
          delete: (id) => this.delete(id),
          create: (opts) => this.create(undefined, opts),
          require: (id) => this.require(id),
          setProject: (id, project) => this.setProject(id, project),
          isBusy: (id) => {
            try {
              return Boolean(this.ctx.agents?.isBusy(id))
            } catch {
              return false
            }
          },
          inboxPending: (id) => {
            try {
              return Number(this.ctx.agents?.inboxPending(id) ?? 0)
            } catch {
              return 0
            }
          },
        }),
      )
      inner.database.register(
        eventsCollection({
          listSummaries: () => this.listSummaries(),
          require: (id) => this.require(id),
        }),
      )
    })
  }

  async create(
    id: string = crypto.randomUUID(),
    opts: { title?: string; config?: SessionConfig } = {},
  ) {
    const used = await this.collectUsedMascots()
    const mascot = pickSessionMascot(id, used)
    const title = opts.title?.trim() || nameFromSessionMascot(mascot)
    const now = Date.now()
    const seeded = normalizeSessionConfig({
      ...(opts.config ?? {}),
      title,
      createdAt: Number(opts.config?.createdAt) > 0 ? opts.config.createdAt : now,
    })
    const record: SessionRecord = {
      id,
      version: SESSION_FORMAT_VERSION,
      events: [{ type: 'session/open', version: SESSION_FORMAT_VERSION, seq: 0, ts: now }],
      mascot,
      ...(seeded ? { config: seeded } : {}),
    }
    await this.persist(record)
    return record
  }

  /** 会话列表为空时补一条；并发刷新共用同一次创建，避免首屏产生多个默认会话。 */
  async ensureDefaultSession() {
    if (!this.defaultSessionPromise) {
      this.defaultSessionPromise = (async () => {
        const existing = await this.ctx.sessionStore.list()
        if (existing[0]) return existing[0]
        return (await this.create()).id
      })()
    }
    const pending = this.defaultSessionPromise
    try {
      return await pending
    } finally {
      if (this.defaultSessionPromise === pending) this.defaultSessionPromise = null
    }
  }

  /** 同步读缓存（Agent 工具解析会话项目根时用）。 */
  peek(id: string) {
    return this.cache.get(id)
  }

  async get(id: string) {
    const hit = this.cache.get(id)
    if (hit) return hit
    const loaded = await this.ctx.sessionStore.load(id)
    if (!loaded) return loaded
    const healed = await this.healOpenTurnsOnLoad(loaded)
    this.cache.set(id, healed)
    return healed
  }

  /** 启动时把磁盘上崩溃残留的 partial / 未闭合 turn 一次修完并写回。 */
  async healPersistedLogs() {
    let ids: string[] = []
    try {
      ids = await this.list()
    } catch {
      return
    }
    for (const id of ids) {
      try {
        await this.get(id)
      } catch {
        /* 单条坏日志不挡启动 */
      }
    }
  }

  /**
   * 从磁盘拉起时：强行闭合未结束的 step/turn。
   * 重启后进程内 agent 已空，但日志若仍开着 turn，UI/Live 会一直显示 running，再发消息也会叠 turn。
   */
  private async healOpenTurnsOnLoad(record: SessionRecord): Promise<SessionRecord> {
    const rebuilt = rebuildHealedEvents(record.events)
    if (!rebuilt) return record
    record.events = rebuilt
    await this.persist(record)
    this.ctx.logger('sessions').info(
      `healed interrupted session log session=${record.id} events=${rebuilt.length}`,
    )
    return record
  }

  async require(id: string) {
    const record = await this.get(id)
    if (!record) throw new Error(`unknown session: ${id}`)
    return record
  }

  /**
   * 对外派工：向指定 session 的 agent 发送一条消息并启动回合。
   * 遵循封装原则——外部只依赖 Session，不直接操控 Agent。
   */
  async sendMessage(id: string, text: string, opts?: { wait?: boolean; sender?: MessageSender }): Promise<AgentTurn> {
    const handle = await this.agentHandle(id)
    return handle.send(text, opts as AgentSendOptions | undefined)
  }

  /** 对外注入：向指定 session 的 agent 注入一条待处理消息（不立即 start；忙时进 inbox）。 */
  async injectMessage(id: string, text: string, opts?: { sender?: MessageSender }): Promise<void> {
    const handle = await this.agentHandle(id)
    handle.inject(text, opts as AgentSendOptions | undefined)
  }

  /** 内部：拿到某 session 的 AgentHandle（封装在 session 层面，外部不可见 Agent 细节）。 */
  private async agentHandle(id: string): Promise<AgentHandle> {
    if (this.agentFactory) return this.agentFactory(id)
    throw new Error('agent factory not installed: agents 插件未就绪')
  }

  /**
   * 由 agents 插件在启动时安装"按 session 取 AgentHandle"的工厂。
   * 通过回调解耦，避免 sessions ↔ agents 的循环依赖：agents 依赖 sessions（单向），
   * 反向能力由 agents 通过此方法注入。
   */
  installAgentFactory(factory: (id: string) => Promise<AgentHandle> | AgentHandle): void {
    this.agentFactory = factory
  }

  private agentFactory: ((id: string) => Promise<AgentHandle> | AgentHandle) | null = null

  /** 合并写入会话配置；传 null/空字符串可清除 title / systemPrompt。 */
  async patchConfig(
    id: string,
    patch: SessionConfig & {
      title?: string | null
      systemPrompt?: string | null
      inspector?: SessionConfig['inspector'] | null
      goal?: SessionConfig['goal'] | null
    },
  ) {
    const record = await this.require(id)
    const next = mergeSessionConfig(record.config, patch)
    if (next) record.config = next
    else delete record.config
    await this.persist(record)
    return record
  }

  async rename(id: string, title: string) {
    return this.patchConfig(id, { title })
  }

  async append(id: string, body: SessionEventBody) {
    const record = await this.require(id)
    const event: SessionEvent = { ...body, seq: record.events.length, ts: Date.now() }
    record.events.push(event)
    this.cache.set(id, record)
    // chunk / 进行中的 tool/call：先内存追加并广播，落盘合并到下一帧，避免把事件循环卡死
    if (body.type === 'assistant/chunk') {
      this.schedulePersist(id)
    } else if (body.type === 'content/edits') {
      const existing = record.events.slice(0, -1).findLast((item) => item.type === 'content/edits' && item.turn === body.turn)
      if (existing && existing.type === 'content/edits') {
        existing.files = mergeContentEditFiles(existing.files, body.files)
        existing.ts = event.ts
        record.events.pop()
        this.schedulePersist(id)
        this.ctx.emit('session/event', { sessionId: id, event: existing })
        return existing
      }
      this.schedulePersist(id)
    } else if (body.type === 'tool/call') {
      const existing = record.events.slice(0, -1).findLast((item) => item.type === 'tool/call' && item.id === body.id)
      if (existing && existing.type === 'tool/call') {
        existing.name = body.name || existing.name
        existing.arguments = body.arguments
        existing.ts = event.ts
        record.events.pop()
        this.schedulePersist(id)
        this.ctx.emit('session/event', { sessionId: id, event: existing })
        return existing
      }
      this.schedulePersist(id)
    } else if (body.type === 'tool/result') {
      const existing = record.events.slice(0, -1).findLast((item) => item.type === 'tool/result' && item.id === body.id)
      if (existing && existing.type === 'tool/result') {
        existing.name = body.name || existing.name
        existing.ok = body.ok
        existing.detail = body.detail
        existing.ts = event.ts
        if (body.partial) existing.partial = true
        else delete existing.partial
        record.events.pop()
        if (body.partial) this.schedulePersist(id)
        else {
          this.clearPersistTimer(id)
          await this.persist(record)
        }
        this.ctx.emit('session/event', { sessionId: id, event: existing })
        return existing
      }
      if (body.partial) this.schedulePersist(id)
      else {
        this.clearPersistTimer(id)
        await this.persist(record)
      }
      this.ctx.emit('session/event', { sessionId: id, event })
      return event
    } else {
      this.clearPersistTimer(id)
      await this.persist(record)
    }
    this.ctx.emit('session/event', { sessionId: id, event })
    return event
  }

  deriveMessages(id: string) {
    const record = this.cache.get(id)
    if (!record) throw new Error(`unknown session: ${id}`)
    return deriveMessages(record.events)
  }

  /** 统计当前事件日志的输入构成（历史/本次 turn 占比），与 deriveMessages 一致从压缩点后算。 */
  statInputComposition(id: string) {
    const record = this.cache.get(id)
    if (!record) throw new Error(`unknown session: ${id}`)
    return statInputComposition(record.events)
  }

  async fork(sourceId: string, childId: string = crypto.randomUUID()) {
    const source = await this.require(sourceId)
    const used = await this.collectUsedMascots()
    const mascot = pickSessionMascot(childId, used)
    const sourceConfig = { ...(source.config ?? {}) }
    delete sourceConfig.inspector
    const record: SessionRecord = {
      id: childId,
      version: source.version,
      events: source.events.map((event) => ({ ...event })),
      ...(source.project ? { project: { ...source.project } } : {}),
      mascot,
      config: normalizeSessionConfig({
        ...sourceConfig,
        title: nameFromSessionMascot(mascot),
        createdAt: Date.now(),
      }),
    }
    await this.persist(record)
    return record
  }

  async setProject(id: string, project: { path: string } | null) {
    const record = await this.require(id)
    if (!project) {
      delete record.project
      await this.persist(record)
      return undefined
    }
    record.project = await resolveHostProject(project.path)
    await this.persist(record)
    return record.project
  }

  list() {
    return this.ctx.sessionStore.list()
  }

  async listSummaries() {
    const items = await this.ctx.sessionStore.listSummaries()
    const out = []
    for (const item of items) {
      let next = item
      if (!item.mascot || !isSessionMascot(item.mascot)) {
        // Legacy sessions: pin a stable mascot once and persist.
        const record = await this.require(item.id)
        if (!record.mascot || !isSessionMascot(record.mascot)) {
          record.mascot = mascotFromSessionId(record.id)
          await this.persist(record)
        } else {
          const ensured = ensureSessionMascot(record.id, record.mascot)
          if (ensured.eye !== record.mascot.eye) {
            record.mascot = ensured
            await this.persist(record)
          }
        }
        next = { ...next, mascot: record.mascot }
      } else {
        const ensured = ensureSessionMascot(item.id, item.mascot)
        if (ensured.eye !== item.mascot.eye) {
          const record = await this.require(item.id)
          record.mascot = ensured
          await this.persist(record)
          next = { ...next, mascot: ensured }
        }
      }
      if (next.mascot && next.title === item.id.slice(0, 8)) {
        next = { ...next, title: nameFromSessionMascot(next.mascot) }
      }
      out.push(next)
    }
    return out
  }

  private async collectUsedMascots(): Promise<AssignedMascot[]> {
    const items = await this.ctx.sessionStore.listSummaries()
    const used: AssignedMascot[] = []
    for (const item of items) {
      if (item.mascot && isSessionMascot(item.mascot)) used.push(item.mascot)
    }
    return used
  }

  async delete(id: string) {
    this.clearPersistTimer(id)
    this.cache.delete(id)
    return this.ctx.sessionStore.delete(id)
  }

  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private schedulePersist(id: string) {
    if (this.persistTimers.has(id)) return
    this.persistTimers.set(
      id,
      setTimeout(() => {
        this.persistTimers.delete(id)
        const record = this.cache.get(id)
        if (record) void this.persist(record)
      }, 80),
    )
  }

  private clearPersistTimer(id: string) {
    const timer = this.persistTimers.get(id)
    if (timer == null) return
    clearTimeout(timer)
    this.persistTimers.delete(id)
  }

  private async persist(record: SessionRecord) {
    this.cache.set(record.id, record)
    await this.ctx.sessionStore.save(record)
  }
}

/**
 * 规范化磁盘路径字符串，使其能解析到实际存在的目录。
 *
 * macOS 的 APFS/HFS+ 以 NFD（Unicode 分解）形式存储文件名，而用户输入的
 * 中文等多字节路径往往是 NFC（预组合）形式。两者字节不同，`realpath`/`stat`
 * 对 NFC 字符串去解析 NFD 存储的目录会抛 ENOENT（即使目录确实存在），导致
 * “中文等目录无法绑定”。这里在 darwin 上把输入统一转成 NFD 再解析（NFD 与
 * NFC 对无分解字符的路径无差别，因此安全）。非 macOS 直接透传。
 */
function normalizePathForFs(input: string): string {
  return platform() === 'darwin' ? input.normalize('NFD') : input
}

async function resolveHostProject(input: string): Promise<SessionProject> {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('project path is required')
  const abs = resolve(normalizePathForFs(raw))
  if (!isAbsolute(abs)) throw new Error('project path must be absolute')
  let real: string
  try {
    real = await realpath(abs)
  } catch {
    throw new Error(`project path does not exist: ${abs}`)
  }
  const info = await stat(real)
  if (!info.isDirectory()) throw new Error(`project path is not a directory: ${real}`)
  return { name: basename(real) || real, path: real, boundAt: Date.now() }
}

export { sessionsCollection } from './sessions-collection.ts'
export { eventsCollection } from './events-collection.ts'
export { lastUsageBeforeCompact, retrieveHistory } from './session-compact.ts'
export { liftToolImages, MAX_TOOL_IMAGES } from './tool-images.ts'

export const name = 'sessions'
export const inject = ['sessionStore']

export function apply(ctx: Context) {
  const sessions = new SessionsService(ctx)
  void sessions.healPersistedLogs()
}
