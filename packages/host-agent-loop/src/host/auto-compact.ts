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

/** 这一步已经自己提交了压缩点时，不再自动补一刀。 */
export function shouldAutoCompact(req: Pick<PostStepReq, 'inputTokens' | 'contextWindowTokens' | 'config' | 'toolCalls'>): boolean {
  const threshold = resolveAutoCompactThreshold(req.config?.autoCompactInputTokens, req.contextWindowTokens)
  const tokens = req.inputTokens
  if (tokens == null || !Number.isFinite(tokens) || tokens <= threshold) return false
  return !req.toolCalls.some((call) => isSessionCompactPoint({ type: 'tool/call', ...call }))
}

/** 用压缩点之后的近期对话做一段短摘要，作为新前缀。不往助手正文里插提示。 */
export function mechanicalCompactText(
  events: Array<{ type?: string; text?: string; name?: string; detail?: string; arguments?: string }>,
): string {
  const lines: string[] = []
  for (const event of events) {
    if (isSessionCompactPoint(event)) {
      lines.length = 0
      continue
    }
    if (event.type === 'user/message' && event.text?.trim()) lines.push(`用户: ${event.text.trim().slice(0, 400)}`)
    else if (event.type === 'assistant/message' && event.text?.trim() && !event.text.includes('[自动压缩]')) {
      lines.push(`助手: ${event.text.trim().slice(0, 400)}`)
    } else if (event.type === 'tool/result' && event.detail?.trim()) {
      lines.push(`工具 ${event.name || ''}: ${event.detail.trim().slice(0, 200)}`)
    }
  }
  const body = lines.slice(-12).join('\n').slice(0, 4000)
  return body || '此前上下文已超过上限。旧内容可用检索找回。'
}

/** 不再改助手正文。压缩在工具结果落盘之后单独写压缩点。 */
export function autoCompactPostStep(req: PostStepReq): PostStepReq {
  return req
}
