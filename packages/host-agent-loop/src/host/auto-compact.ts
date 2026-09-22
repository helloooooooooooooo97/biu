import { isSessionCompactPoint } from '@biu/type-session'
import type { PostStepReq } from '@biu/type-agent-loop'

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
  return `[自动压缩] 这一步输入约 ${Math.round(tokens)} token，已超过本会话设置的 ${Math.round(threshold)}。请调用 db_action：path=/sessions/${req.sessionId} action=compact。第一次不要传 text，按返回的指南写摘要，然后再调用并把摘要放进 args.text。`
}

/** post-step：会话配置了输入 token 阈值且本步超过时，把 compact 提示追加进 assistant/message。 */
export function autoCompactPostStep(req: PostStepReq): PostStepReq {
  const threshold = req.config?.autoCompactInputTokens
  if (threshold == null || !Number.isFinite(threshold) || threshold <= 0) return req
  const note = compactNote(req, threshold)
  if (!note) return req
  const text = appendAssistantNote(req.text, note)
  return text === req.text ? req : { ...req, text }
}
