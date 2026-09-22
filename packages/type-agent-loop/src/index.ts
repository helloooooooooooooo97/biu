import type { InboxKind, MessageSender, LiveUiContext, SessionConfig } from '@biu/type-session'

export interface AgentTurn {
  text: string
  steps: Array<{ name: string; ok: boolean; detail: string }>
}

export interface ClaimedInput {
  kind: InboxKind
  text: string
  id?: string
  extraTools?: string[]
  sender?: MessageSender
  images?: Array<{ name: string; mime: string; url: string }>
  /** 发送时的界面快照，写入本回合 system/prompt。 */
  liveContext?: LiveUiContext
}

export interface PreStepReq {
  sessionId: string
  messages: ClaimedInput[]
  reject?: string
}

/**
 * 一步模型回复落成 assistant/message 之前。
 * 和 agent/pre-step 一样走 waterfall：钩子调用 next() 拿到当前文本，只改 text 做追加。
 * toolCalls / inputTokens / config 是这一步的事实，钩子不要改它们。
 */
export interface PostStepReq {
  sessionId: string
  turn: number
  step: number
  text: string
  inputTokens?: number
  /** 当前模型上下文窗口（token）。自动压缩上限不能超过它。 */
  contextWindowTokens?: number
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  config?: SessionConfig
}

export interface AgentRunner {
  run(claimed: ClaimedInput[]): Promise<AgentTurn>
}
