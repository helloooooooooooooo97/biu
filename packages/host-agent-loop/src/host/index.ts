import { Service, type Context } from 'cordis'
import type { AssistantReply, ChatOptions, LlmClient, LlmConfig, LlmMessage, LlmUsage } from '@biu/host-llm'
import { runWithSession } from '@biu/host-sessions/scope'
import { applyContextBudget, liftToolImages } from '@biu/host-sessions'
import { autoCompactPostStep } from './auto-compact.ts'
import { runWithToolPolicy, runWithToolProgress, type AgentToolMode } from '@biu/host-tools'

/** 工具结果写入事件日志( tool/result )时统一上限字符数；超长裁剪，避免上下文被单次工具输出撑爆。 */
export const MAX_TOOL_RESULT_CHARS = 16_000
export const DEFAULT_TOOL_CONCURRENCY = 4

type ReplyToolCall = AssistantReply['toolCalls'][number]
type ToolOutcome = { name: string; ok: boolean; detail: string; cancelled: boolean }

function toolConcurrency() {
  const configured = Number(process.env.BIU_TOOL_CONCURRENCY ?? DEFAULT_TOOL_CONCURRENCY)
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 32) : DEFAULT_TOOL_CONCURRENCY
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

export type { AgentTurn, ClaimedInput, PreStepReq, PostStepReq, AgentRunner } from '@biu/type-agent-loop'
import type { AgentTurn, ClaimedInput, AgentRunner, PreStepReq, PostStepReq } from '@biu/type-agent-loop'

export type AgentLoopFactory = (config: LlmConfig, sessionId: string, signal: AbortSignal) => AgentRunner

export class AgentLoop implements AgentRunner {
  constructor(
    private ctx: Context,
    private llm: LlmClient,
    private sessionId: string,
    private signal: AbortSignal,
  ) {}

  async run(claimed: ClaimedInput[]): Promise<AgentTurn> {
    let extras = [
      ...new Set(claimed.flatMap((item) => item.extraTools ?? []).map((name) => name.trim()).filter(Boolean)),
    ]
    const chat = this.ctx.get('chat') as
      | {
          resolveEffective?: (id?: string | null) => {
            effective: {
              agentMode: AgentToolMode
              extraTools: string[]
            }
          }
        }
      | undefined
    const effective = chat?.resolveEffective?.(this.sessionId)?.effective
    const mode: AgentToolMode = effective?.agentMode ?? 'standard'
    if (mode === 'minimal' && effective?.extraTools?.length) {
      for (const name of effective.extraTools) {
        if (!extras.includes(name)) extras.push(name)
      }
    }
    // 极简是底座；Slash 增量放开。文件模式只开放 db_*。商店插件跟标准模式一起可见。
    if (mode === 'minimal') {
      extras = extras.filter((name) => this.ctx.tools.originOf(name) !== 'store')
    }
    if (mode === 'file') extras = []
    return runWithSession(this.sessionId, () =>
      runWithToolPolicy({ mode, extras }, () => this.runInSession(claimed)),
    )
  }

  private throwIfAborted() {
    if (this.signal.aborted) throw new Error('cancelled')
  }

  /** 落 assistant/message 前走 agent/post-step。钩子只能往 text 上追加。 */
  private async applyPostStep(
    turn: number,
    step: number,
    text: string,
    inputTokens: number | undefined,
    toolCalls: PostStepReq['toolCalls'],
  ): Promise<string> {
    const config = (await this.ctx.sessions.get(this.sessionId))?.config
    const req: PostStepReq = {
      sessionId: this.sessionId,
      turn,
      step,
      text,
      toolCalls,
      ...(inputTokens != null ? { inputTokens } : {}),
      ...(config ? { config } : {}),
    }
    return this.ctx.waterfall('agent/post-step', req, () => req).text
  }

  private async runInSession(claimed: ClaimedInput[]): Promise<AgentTurn> {
    const session = this.ctx.sessions
    this.throwIfAborted()
    // turn = 已有 turn/start 数 + 1，即「回合」序号（每次用户输入=一个回合）。
    // 不用 deriveMessages 的 user 数：会受上下文压缩影响而回跳；也不用 user/message 数：
    // 一个回合可能 append 多条 user/message（多段输入/派工），不等价于回合数。
    // turn/start 是唯一可靠的回合边界。
    const record = await session.get(this.sessionId)
    const turn = record ? record.events.filter((event) => event.type === 'turn/start').length + 1 : 1
    await session.append(this.sessionId, { type: 'turn/start', turn })

    let req: PreStepReq = { sessionId: this.sessionId, messages: claimed }
    req = this.ctx.waterfall('agent/pre-step', req, () => req)
    if (req.reject) {
      await session.append(this.sessionId, { type: 'turn/end', turn, reason: req.reject })
      this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle' })
      return { text: req.reject, steps: [] }
    }
    if (!req.messages.length) {
      await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'empty' })
      this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle' })
      return { text: '（空回合）', steps: [] }
    }

    for (const item of req.messages) {
      if (this.signal.aborted) {
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
        throw new Error('cancelled')
      }
      await session.append(this.sessionId, {
        type: 'user/message',
        text: item.text,
        kind: item.kind,
        ...(item.sender ? { sender: item.sender } : {}),
        ...(item.images?.length ? { images: item.images } : {}),
      })
    }

    if (this.signal.aborted) {
      await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
      throw new Error('cancelled')
    }
    // 分段 prompt 只在 turn 开头写入一次，避免每 step 污染权威日志；derive 取最后一条 system/prompt。
    const live = [...claimed].reverse().find((item) => item.liveContext)?.liveContext
    await session.append(this.sessionId, { type: 'system/prompt', text: this.ctx.systemPrompt.assemble(live) })

    const steps: AgentTurn['steps'] = []
    let final = '（空回复）'
    let chunkBuf = ''
    let chunkChannel: 'text' | 'reasoning' = 'text'
    let chunkFlush: Promise<void> = Promise.resolve()
    let chunkTimer: ReturnType<typeof setTimeout> | null = null
    let toolBuf = new Map<string, { id: string; name: string; arguments: string }>()
    let toolFlush: Promise<void> = Promise.resolve()
    let toolTimer: ReturnType<typeof setTimeout> | null = null

    const flushTools = () => {
      if (toolTimer != null) {
        clearTimeout(toolTimer)
        toolTimer = null
      }
      if (!toolBuf.size) return toolFlush
      const pending = [...toolBuf.values()]
      toolBuf = new Map()
      toolFlush = toolFlush.then(async () => {
        for (const call of pending) {
          await session.append(this.sessionId, {
            type: 'tool/call',
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          })
        }
      })
      return toolFlush
    }

    const queueTool = (call: { id: string; name: string; arguments: string }) => {
      if (!call.id || !call.name) return
      toolBuf.set(call.id, call)
      if (toolTimer != null) return
      toolTimer = setTimeout(() => {
        toolTimer = null
        void flushTools()
      }, 48)
    }

    const flushChunks = () => {
      if (chunkTimer != null) {
        clearTimeout(chunkTimer)
        chunkTimer = null
      }
      if (!chunkBuf) return chunkFlush
      const text = chunkBuf
      const channel = chunkChannel
      chunkBuf = ''
      chunkFlush = chunkFlush.then(async () => {
        await session.append(this.sessionId, {
          type: 'assistant/chunk',
          text,
          ...(channel === 'reasoning' ? { channel: 'reasoning' as const } : {}),
        })
      })
      return chunkFlush
    }

    const queueChunk = (text: string, channel: 'text' | 'reasoning' = 'text') => {
      if (!text) return
      if (chunkBuf && chunkChannel !== channel) void flushChunks()
      chunkChannel = channel
      chunkBuf += text
      if (chunkTimer != null) return
      chunkTimer = setTimeout(() => {
        chunkTimer = null
        void flushChunks()
      }, 48)
    }

    for (let step = 0; ; step++) {
      if (this.signal.aborted) {
        await flushChunks()
        await flushTools()
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
        throw new Error('cancelled')
      }
      this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'running', step })
      await session.append(this.sessionId, { type: 'step/start', turn, step })
      if (this.signal.aborted) {
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
        throw new Error('cancelled')
      }
      // 让 step/start 先从 WS 出去，再去做可能很重的 derive / 等首 token
      await new Promise<void>((resolve) => setImmediate(resolve))
      if (this.signal.aborted) {
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
        throw new Error('cancelled')
      }

      const rawMessages = await liftToolImages(session.deriveMessages(this.sessionId), this.sessionId)
      if (this.signal.aborted) {
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
        throw new Error('cancelled')
      }
      const inputComp = session.statInputComposition(this.sessionId)
      const attachUsage = (usage?: LlmUsage) =>
        usage !== undefined
          ? { ...usage, histPct: inputComp.histPct }
          : undefined
      // 预算默认 100 万 token（约 1M），仅在显式超界时才考虑截断；不主动压缩/不偷跑窗口丢弃。
      // 压缩只应发生：你显式调用 compact_submit 写入压缩点。设 CTX_BUDGET=0 可完全禁用预算保护（原样发送）。
      const budget = Number(process.env.CTX_BUDGET ?? 1000000)
      const messages = budget > 0 ? applyContextBudget(rawMessages, budget) : rawMessages
      let reply: AssistantReply
      try {
        reply = await this.llm.chat(messages, this.ctx.tools.schemas(), this.signal, {
          onDelta: async (text) => {
            queueChunk(text)
          },
          onReasoningDelta: (text) => {
            queueChunk(text, 'reasoning')
          },
          onToolDelta: (call) => {
            queueTool(call)
          },
        })
        await flushChunks()
        await flushTools()
      } catch (error) {
        await flushChunks()
        await flushTools()
        if (this.signal.aborted) {
          await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'cancelled' })
          this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle' })
          throw new Error('cancelled')
        }
        const detail = String(error)
        const text = `模型调用失败：${detail}`
        await session.append(this.sessionId, { type: 'assistant/message', text })
        await session.append(this.sessionId, { type: 'step/end', turn, step })
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'llm-error' })
        this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle' })
        return { text, steps }
      }

      if (!reply.toolCalls.length) {
        const usage = attachUsage(reply.usage)
        final = await this.applyPostStep(turn, step, reply.content?.trim() || '（空回复）', usage?.inputTokens, [])
        await session.append(this.sessionId, {
          type: 'assistant/message',
          text: final,
          ...(usage ? { usage } : {}),
        })
        await session.append(this.sessionId, { type: 'step/end', turn, step })
        await session.append(this.sessionId, { type: 'turn/end', turn, reason: 'complete' })
        this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle', step })
        return { text: final, steps }
      }

      const usage = attachUsage(reply.usage)
      const text = await this.applyPostStep(turn, step, reply.content ?? '', usage?.inputTokens, reply.toolCalls)
      await session.append(this.sessionId, {
        type: 'assistant/message',
        text,
        tool_calls: reply.toolCalls,
        ...(usage ? { usage } : {}),
      })

      const prepared = reply.toolCalls.map((call) => {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
        } catch {
          args = {}
        }
        return { call, args, mode: this.ctx.tools.executionMode(call.name, args) }
      })

      // 先把整批调用都推给前端，这样并行工具会同时显示为“运行中”。
      for (const { call } of prepared) {
        await session.append(this.sessionId, { type: 'tool/call', id: call.id, name: call.name, arguments: call.arguments })
      }

      let appendQueue = Promise.resolve()
      const enqueueAppend = (body: Parameters<typeof session.append>[1]) => {
        const next = appendQueue.then(() => session.append(this.sessionId, body))
        appendQueue = next.then(
          () => undefined,
          () => undefined,
        )
        return next
      }

      const executeCall = async (call: ReplyToolCall, args: Record<string, unknown>): Promise<ToolOutcome> => {
        let detail = ''
        let ok = true
        try {
          if (this.signal.aborted) throw new Error('cancelled')
          let lastPartialAt = 0
          detail = truncateToolResult(
            stringify(
              await runWithToolProgress((partial) => {
                const now = Date.now()
                if (now - lastPartialAt < 40) return
                lastPartialAt = now
                void enqueueAppend({
                  type: 'tool/result',
                  id: call.id,
                  name: call.name,
                  ok: true,
                  detail: truncateToolResult(partial),
                  partial: true,
                })
              }, () => this.ctx.tools.invoke(call.name, args, this.signal)),
            ),
          )
        } catch (error) {
          ok = false
          detail = String(error)
          await enqueueAppend({ type: 'tool/result', id: call.id, name: call.name, ok, detail })
          return { name: call.name, ok, detail, cancelled: this.signal.aborted || isCancelError(error) }
        }
        await enqueueAppend({ type: 'tool/result', id: call.id, name: call.name, ok, detail })
        return { name: call.name, ok, detail, cancelled: this.signal.aborted }
      }

      const recordOutcomes = async (outcomes: ToolOutcome[]) => {
        steps.push(...outcomes.map(({ name, ok, detail }) => ({ name, ok, detail })))
        if (outcomes.some((item) => item.cancelled) || this.signal.aborted) {
          await enqueueAppend({ type: 'turn/end', turn, reason: 'cancelled' })
          this.ctx.emit('agent/status', { sessionId: this.sessionId, status: 'idle' })
          throw new Error('cancelled')
        }
      }

      let parallel: typeof prepared = []
      const flushParallel = async () => {
        if (!parallel.length) return
        const batch = parallel
        parallel = []
        await recordOutcomes(
          await mapConcurrent(batch, toolConcurrency(), ({ call, args }) => executeCall(call, args)),
        )
      }

      for (const item of prepared) {
        if (item.mode === 'parallel') {
          parallel.push(item)
          continue
        }
        await flushParallel()
        await recordOutcomes([await executeCall(item.call, item.args)])
      }
      await flushParallel()
      await enqueueAppend({ type: 'step/end', turn, step })
      final = steps.at(-1)?.detail ?? final
    }
  }
}

export class AgentLoopService extends Service {
  private factory: AgentLoopFactory

  constructor(ctx: Context) {
    super(ctx, 'agentLoop')
    this.factory = (config, sessionId, signal) => this.defaultCreate(config, sessionId, signal)
  }

  /** 换策略（回声 / 真模型 / 评测）而不改 agents 句柄与 inbox。 */
  setFactory(factory: AgentLoopFactory) {
    this.factory = factory
  }

  create(config: LlmConfig, sessionId: string, signal: AbortSignal): AgentRunner {
    return this.factory(config, sessionId, signal)
  }

  private defaultCreate(config: LlmConfig, sessionId: string, signal: AbortSignal): AgentRunner {
    const llm = config.apiKey
      ? this.ctx.llm.forConfig(config)
      : {
          chat: async (messages: LlmMessage[], _tools?: unknown[], _signal?: AbortSignal, options?: ChatOptions) => {
            const last = [...messages].reverse().find((item) => item.role === 'user')?.content
            const preview = typeof last === 'string' ? last : Array.isArray(last) ? '（含图片）' : ''
            const text = `未配置 API Key，本地回声：${preview}`
            await options?.onDelta?.(text)
            return { content: text, toolCalls: [] }
          },
        }
    return new AgentLoop(this.ctx, llm, sessionId, signal)
  }
}

function isCancelError(error: unknown) {
  return /cancelled|AbortError|aborted/i.test(String(error))
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * 工具结果落库(tool/result)前统一裁剪上限，防单次工具输出（大文件/目录/big JSON）撑爆事件日志与 LLM 上下文。
 * 超长时保留「头半段 + 尾半段」各 N 字符，中间用省略号拼接，兼顾开头（文件头/报错上下文）与结尾（命令输出尾部）。
 */
export function truncateToolResult(detail: string): string {
  if (detail.length <= MAX_TOOL_RESULT_CHARS) return detail
  const half = MAX_TOOL_RESULT_CHARS >> 1 // 前后各保留一半（≈8k）
  return `${detail.slice(0, half)}…[${detail.length - MAX_TOOL_RESULT_CHARS} chars clipped]…${detail.slice(-half)}`
}

export const name = 'agent-loop'
export const inject = ['llm', 'tools', 'sessions', 'systemPrompt']

export function apply(ctx: Context) {
  new AgentLoopService(ctx)
  ctx.on('agent/post-step', (req, next) => autoCompactPostStep(next()))
}
