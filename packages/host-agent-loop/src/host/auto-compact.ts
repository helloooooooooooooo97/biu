import { isSessionCompactPoint } from '@biu/type-session'
import type { PostStepReq } from '@biu/type-agent-loop'

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000

/** 模型上下文窗口转 token。没有 1m 开关时按 200k。 */
export function contextWindowTokens(label?: string): number {
  return label === '1m' ? 1_000_000 : DEFAULT_CONTEXT_WINDOW_TOKENS
}

/**
 * 自动压缩关不掉。未配置用模型上下文；配了也夹在 1..上下文。
 */
export function resolveAutoCompactThreshold(configured: unknown, contextTokens?: number): number {
  const cap = Math.max(1, Math.floor(contextTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS))
  const n = typeof configured === 'number' ? configured : Number(configured)
  if (!Number.isFinite(n) || n <= 0) return cap
  return Math.min(Math.floor(n), cap)
}

/** 钩子只往 assistant 正文末尾追加，不另起一条消息。 */
export function appendAssistantNote(text: string, note: string): string {
  const extra = note.trim()
  if (!extra || text.includes(extra)) return text
  const body = text.trim()
  return body ? `${body}\n\n${extra}` : extra
}

function compactNote(req: PostStepReq, threshold: number): string | null {
  const tokens = req.inputTokens
  if (tokens == null || !Number.isFinite(tokens) || tokens <= threshold) return null
  if (req.toolCalls.some((call) => isSessionCompactPoint({ type: 'tool/call', ...call }))) return null
  return `[自动压缩] 这一步输入约 ${Math.round(tokens)} token，已超过本会话上限 ${Math.round(threshold)}。请调用 db_action：path=/sessions/${req.sessionId} action=compact。第一次不要传 text，按返回的指南写摘要，然后再调用并把摘要放进 args.text。`
}

/** post-step：输入 token 超过（被模型上下文夹过的）上限时，把 compact 提示追加进 assistant/message。 */
export function autoCompactPostStep(req: PostStepReq): PostStepReq {
  const threshold = resolveAutoCompactThreshold(req.config?.autoCompactInputTokens, req.contextWindowTokens)
  const note = compactNote(req, threshold)
  if (!note) return req
  const text = appendAssistantNote(req.text, note)
  return text === req.text ? req : { ...req, text }
}
