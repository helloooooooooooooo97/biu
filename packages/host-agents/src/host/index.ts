import { Service, type Context } from 'cordis'
import type { LlmConfig } from '@biu/host-llm'
import type { AgentTurn, ClaimedInput } from '@biu/type-agent-loop'
import type { MessageSender, LiveUiContext, SessionGoal } from '@biu/type-session'
import { currentSessionId } from '@biu/host-sessions/scope'
import {
  continuationPrompt,
  decideGoalContinuation,
  goalFromConfig,
  newGoalId,
  parseGoalSlash,
  type GoalSlash,
} from './goal.ts'

export type { AgentTurn, LlmConfig }

export interface AgentSendOptions {
  extraTools?: string[]
  /** false：入队后立即返回，不阻塞等回合结束（Live 派工后可再 progress）。默认 true。 */
  wait?: boolean
  /** 消息来源：Live 派工时传入 { type: 'session', sessionId } */
  sender?: MessageSender
  images?: Array<{ name: string; mime: string; url: string }>
  liveContext?: LiveUiContext
}

export interface AgentHandle {
  sessionId: string
  send(text: string, opts?: AgentSendOptions): Promise<AgentTurn>
  inject(text: string, opts?: AgentSendOptions): void
  /** 空回车：abort 当前回合，立刻 kick/claim 队列（需至少一条 wake） */
  flush(opts?: { wait?: boolean }): Promise<{ flushed: boolean }>
  cancel(): void
  dispose(): void
}

export type InboxRow = {
  id: string
  kind: 'wake' | 'inject'
  text: string
}

interface LiveAgent {
  handle: AgentHandle
  inbox: ClaimedInput[]
  running?: Promise<void>
  abort: AbortController
}

let inboxSeq = 0
function nextInboxId() {
  inboxSeq += 1
  return `inq-${Date.now().toString(36)}-${inboxSeq}`
}

export class AgentsService extends Service {
  private lives = new Map<string, LiveAgent>()
  private llm: LlmConfig = { provider: 'deepseek', apiKey: '', model: 'deepseek-chat' }

  constructor(ctx: Context) {
    super(ctx, 'agents')
  }

  configure(llm: LlmConfig) {
    this.llm = llm
  }

  private resolveLlm(sessionId: string): LlmConfig {
    const chat = this.ctx.get('chat') as { resolveLlm?: (id?: string | null) => LlmConfig } | undefined
    return chat?.resolveLlm?.(sessionId) ?? this.llm
  }

  /** Live progress：该 session 的 agent 是否正在跑回合。 */
  isBusy(sessionId: string) {
    return Boolean(this.lives.get(sessionId)?.running)
  }

  inboxPending(sessionId: string) {
    return this.lives.get(sessionId)?.inbox.length ?? 0
  }

  /** 当前尚未 claim 的排队消息（wake / inject）。 */
  listInbox(sessionId: string): InboxRow[] {
    const live = this.lives.get(sessionId)
    if (!live) return []
    return live.inbox.map((item) => ({
      id: item.id ?? nextInboxId(),
      kind: item.kind,
      text: item.text,
    }))
  }

  private emitInbox(sessionId: string) {
    this.ctx.emit('agent/inbox', { sessionId, inbox: this.listInbox(sessionId) })
  }

  async create(sessionId?: string): Promise<AgentHandle> {
    const id = sessionId ?? (await this.ctx.sessions.create()).id
    if (!(await this.ctx.sessions.get(id))) await this.ctx.sessions.create(id)
    const existing = this.lives.get(id)
    if (existing) return existing.handle

    const live: LiveAgent = {
      inbox: [],
      abort: new AbortController(),
      handle: {} as AgentHandle,
    }

    const kick = async (): Promise<AgentTurn> => {
      let last: AgentTurn = { text: '', steps: [] }
      while (true) {
        const claimed = claim(live.inbox)
        this.emitInbox(id)
        if (!claimed) {
          const queued = await this.queueGoalContinuation(id, live)
          if (!queued) break
          continue
        }
        last = await this.ctx.agentLoop.create(this.resolveLlm(id), id, live.abort.signal).run(claimed)
      }
      return last
    }

    const startKick = (wait: boolean): Promise<AgentTurn> => {
      live.abort = new AbortController()
      let result: AgentTurn = { text: '', steps: [] }
      const running = kick()
        .then((turn) => {
          result = turn
        })
        .finally(() => {
          if (live.running === running) {
            live.running = undefined
            this.ctx.emit('agent/status', { sessionId: id, status: 'idle' })
          }
        })
      live.running = running
      this.ctx.emit('agent/status', { sessionId: id, status: 'running', step: 0 })
      if (!wait) {
        void running.catch(() => undefined)
        return Promise.resolve({ text: '', steps: [] })
      }
      return running.then(() => result).catch((error) => {
        if (/cancelled|AbortError|aborted/i.test(String(error))) {
          return { text: '', steps: [] }
        }
        throw error
      })
    }

    const handle: AgentHandle = {
      sessionId: id,
      send: async (text: string, opts?: AgentSendOptions) => {
        const trimmed = text.trim()
        const images = sanitizeImages(opts?.images)
        if (!trimmed && !images?.length) return { text: '请先输入内容。', steps: [] }
        const slash = parseGoalSlash(trimmed)
        if (slash) {
          const control = await this.applyGoalSlash(id, slash)
          if (control !== 'run') {
            await this.ctx.sessions.append(id, { type: 'user/message', text: trimmed, kind: 'wake' })
            await this.ctx.sessions.append(id, { type: 'assistant/message', text: control })
            return { text: control, steps: [] }
          }
        }
        const extraTools = sanitizeExtraTools(opts?.extraTools)
        const wait = opts?.wait !== false
        const entry = {
          text: trimmed || '（图片）',
          id: nextInboxId(),
          ...(extraTools.length ? { extraTools } : {}),
          ...(opts?.sender ? { sender: opts.sender } : {}),
          ...(images ? { images } : {}),
          ...(opts?.liveContext ? { liveContext: opts.liveContext } : {}),
        }

        // Cursor 同款：忙碌且已有 wake 排队时，再发送 → inject（并入该 wake 的下一回合）
        if (live.running && live.inbox.some((item) => item.kind === 'wake')) {
          live.inbox.push({ kind: 'inject', ...entry })
          this.emitInbox(id)
          return { text: '', steps: [] }
        }

        live.inbox.push({ kind: 'wake', ...entry })
        this.emitInbox(id)

        if (live.running) {
          if (!wait) return { text: '', steps: [] }
          await live.running.catch(() => undefined)
        }
        return startKick(wait)
      },
      inject: (text: string, opts?: AgentSendOptions) => {
        const trimmed = text.trim()
        const images = sanitizeImages(opts?.images)
        if (!trimmed && !images?.length) return
        const extraTools = sanitizeExtraTools(opts?.extraTools)
        live.inbox.push({
          kind: 'inject',
          text: trimmed || '（图片）',
          id: nextInboxId(),
          ...(extraTools.length ? { extraTools } : {}),
          ...(opts?.sender ? { sender: opts.sender } : {}),
          ...(images ? { images } : {}),
          ...(opts?.liveContext ? { liveContext: opts.liveContext } : {}),
        })
        this.emitInbox(id)
      },
      flush: async (opts?: { wait?: boolean }) => {
        const wait = opts?.wait !== false
        // claim 需要 wake；队列里没有 wake 时空回车无意义
        if (!live.inbox.some((item) => item.kind === 'wake')) {
          return { flushed: false }
        }
        live.abort.abort()
        if (live.running) {
          await live.running.catch(() => undefined)
        }
        await startKick(wait)
        return { flushed: true }
      },
      cancel: () => live.abort.abort(),
      dispose: () => {
        live.abort.abort()
        this.lives.delete(id)
        this.ctx.emit('agent/inbox', { sessionId: id, inbox: [] })
      },
    }
    live.handle = handle
    this.lives.set(id, live)
    return handle
  }

  get(sessionId: string) {
    return this.lives.get(sessionId)?.handle
  }

  private peekGoal(sessionId: string): SessionGoal | undefined {
    return goalFromConfig(this.ctx.sessions.peek(sessionId)?.config?.goal)
  }

  private async applyGoalSlash(sessionId: string, slash: GoalSlash): Promise<'run' | string> {
    const existing = this.peekGoal(sessionId)
    if (slash.kind === 'start') {
      await this.ctx.sessions.patchConfig(sessionId, {
        goal: { id: newGoalId(), objective: slash.objective, status: 'pursuing', turns: 0 },
      })
      return 'run'
    }
    if (slash.kind === 'resume') {
      if (!existing) return '没有可恢复的 Goal。用 /goal <目标> 开始。'
      if (existing.status === 'achieved') return '当前 Goal 已完成。用 /goal <目标> 开新的。'
      await this.ctx.sessions.patchConfig(sessionId, { goal: { ...existing, status: 'pursuing' } })
      return 'run'
    }
    if (slash.kind === 'pause') {
      if (!existing || existing.status !== 'pursuing') return '没有正在推进的 Goal。'
      await this.ctx.sessions.patchConfig(sessionId, { goal: { ...existing, status: 'paused' } })
      return `已暂停 Goal：${existing.objective}`
    }
    if (slash.kind === 'clear') {
      await this.ctx.sessions.patchConfig(sessionId, { goal: null })
      return existing ? `已清除 Goal：${existing.objective}` : '当前没有 Goal。'
    }
    if (!existing) return '当前没有 Goal。输入 /goal <目标> 开始，会一直做到完成。'
    return `Goal ${existing.status} · ${existing.objective}${existing.summary ? ` · ${existing.summary}` : ''} · goal_id=${existing.id}`
  }

  private async queueGoalContinuation(sessionId: string, live: LiveAgent) {
    const goal = this.peekGoal(sessionId)
    const decision = decideGoalContinuation({
      goal,
      aborted: live.abort.signal.aborted,
      inboxLength: live.inbox.length,
    })
    if (decision === 'budget' && goal) {
      await this.ctx.sessions.patchConfig(sessionId, {
        goal: {
          ...goal,
          status: 'blocked',
          summary: `达到 ${goal.turns} 回合上限，目标未完成`,
        },
      })
      return false
    }
    if (decision !== 'continue' || !goal) return false
    await this.ctx.sessions.patchConfig(sessionId, { goal: { ...goal, turns: goal.turns + 1 } })
    live.inbox.push({
      kind: 'wake',
      text: continuationPrompt(goal),
      id: nextInboxId(),
    })
    this.emitInbox(sessionId)
    return true
  }

  /** 兼容旧入口：把最后一条用户消息送进 session。 */
  async prompt(history: Array<{ role: string; content: string }>, llm: LlmConfig): Promise<AgentTurn> {
    this.configure(llm)
    const last = history.filter((item) => item.role === 'user').at(-1)?.content?.trim() ?? ''
    const agent = await this.create()
    return agent.send(last)
  }
}

function sanitizeImages(raw: AgentSendOptions['images']): ClaimedInput['images'] {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const out: NonNullable<ClaimedInput['images']> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const mime = String(item.mime ?? '')
    const url = String(item.url ?? '')
    const name = String(item.name ?? 'image.png').slice(0, 80)
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(mime)) continue
    if (!url.startsWith('data:image/') || url.length > 8 * 1024 * 1024) continue
    out.push({ name: name || 'image.png', mime, url })
    if (out.length >= 6) break
  }
  return out.length ? out : undefined
}

function sanitizeExtraTools(names: string[] | undefined): string[] {
  if (!Array.isArray(names) || !names.length) return []
  return [...new Set(names.map((name) => String(name).trim()).filter((name) => name && name !== 'goal'))]
}

function claim(inbox: ClaimedInput[]): ClaimedInput[] | undefined {
  const wakeAt = inbox.findIndex((item) => item.kind === 'wake')
  if (wakeAt < 0) return undefined
  const all = inbox.splice(0)
  const taken = all[wakeAt]!
  const injects = all.filter((item, index) => item.kind === 'inject' && index !== wakeAt)
  inbox.push(...all.filter((item, index) => index !== wakeAt && item.kind !== 'inject'))
  return [...injects, taken]
}

export const name = 'agents'
export const inject = ['agentLoop', 'sessions', 'tools']

export function apply(ctx: Context) {
  const agents = new AgentsService(ctx)
  // 无循环依赖地把"按 session 取 AgentHandle"的能力装进 SessionsService：
  // agents 依赖 sessions（单向）；反向派工能力通过 sessions.installAgentFactory 回调注入。
  ctx.sessions.installAgentFactory((id) => agents.create(id))
  registerGoalTools(ctx)
}

function registerGoalTools(ctx: Context) {
  ctx.tools.register({
    name: 'goal_complete',
    description:
      'Goal 模式：目标已用具体证据验证完成后调用。必须带当前 goal_id 与 summary。不要只在回复里声称完成。',
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: 'string', description: '当前会话正在推进的 goal_id' },
        summary: { type: 'string', description: '完成证据：跑过的测试、改动的文件、验收结果' },
      },
      required: ['goal_id', 'summary'],
    },
    execute: async (args) => updateGoal(ctx, 'achieved', args),
  })
  ctx.tools.register({
    name: 'goal_blocked',
    description:
      'Goal 模式：只有真正无法继续时才调用（缺密钥、缺权限、外部依赖、同一障碍反复出现）。必须带当前 goal_id。',
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: 'string' },
        reason: { type: 'string' },
        evidence: { type: 'string' },
      },
      required: ['goal_id', 'reason'],
    },
    execute: async (args) =>
      updateGoal(ctx, 'blocked', {
        goal_id: args.goal_id,
        summary: [args.reason, args.evidence].filter(Boolean).map(String).join('\n'),
      }),
  })
}

async function updateGoal(ctx: Context, status: 'achieved' | 'blocked', args: Record<string, unknown>) {
  const sessionId = currentSessionId()
  if (!sessionId) throw new Error('goal tools need an active session')
  const goal = goalFromConfig(ctx.sessions.peek(sessionId)?.config?.goal)
  if (!goal) throw new Error('no active goal')
  const goalId = String(args.goal_id ?? '').trim()
  if (goalId !== goal.id) throw new Error('stale goal_id')
  if (goal.status !== 'pursuing') throw new Error(`goal is ${goal.status}`)
  const summary = String(args.summary ?? '').trim().slice(0, 4000)
  if (status === 'achieved' && !summary) throw new Error('goal_complete needs summary evidence')
  await ctx.sessions.patchConfig(sessionId, { goal: { ...goal, status, ...(summary ? { summary } : {}) } })
  return { ok: true, status, goal_id: goal.id }
}
