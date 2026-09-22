import type { ChatNode, ChatToolPart, TrajectoryUsage } from '@biu/web-session-view'

export type LiveHudState = {
  turn: number
  step: number
  toolIndex: number
  durationMs?: number
  usage?: TrajectoryUsage
  lastTool: ChatToolPart | undefined
  lastOutput: string
  streaming: boolean
  replyId?: string
  replyIndex: number
  replyCount: number
}

export function replyToolCount(reply: Extract<ChatNode, { kind: 'reply' }>) {
  const fromParts = reply.parts.reduce((count, part) => count + (part.kind === 'tool' ? 1 : 0), 0)
  if (fromParts > 0) return fromParts
  return (reply.steps ?? []).reduce((count, step) => count + step.toolCount, 0)
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) {
    const sec = ms / 1000
    return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`
  }
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function listReplyNodes(nodes: ChatNode[]) {
  return nodes.filter((node): node is Extract<ChatNode, { kind: 'reply' }> => node.kind === 'reply')
}

export function extractLiveHud(nodes: ChatNode[], agentStep?: number, replyId?: string | null): LiveHudState {
  let users = 0
  for (const node of nodes) {
    if (node.kind === 'user') users += 1
  }
  const replies = listReplyNodes(nodes)
  const selected =
    (replyId ? replies.find((row) => row.id === replyId) : undefined) ?? replies.at(-1)
  const tools = selected?.parts.filter((part): part is ChatToolPart => part.kind === 'tool') ?? []
  const lastAssistant = [...(selected?.parts ?? [])]
    .reverse()
    .find((part) => part.kind === 'assistant' && part.text.trim())
  const fromParts = selected ? replyToolCount(selected) : 0
  const replyIndex = selected ? replies.findIndex((row) => row.id === selected.id) : -1
  return {
    turn: selected?.turn ?? users,
    step: selected?.stepCount ?? selected?.steps?.length ?? agentStep ?? 0,
    toolIndex: fromParts || tools.length,
    durationMs: selected?.durationMs,
    usage: selected?.usage,
    lastTool: tools.at(-1),
    lastOutput: lastAssistant?.kind === 'assistant' ? lastAssistant.text.trim() : '',
    streaming: Boolean(selected?.streaming),
    replyId: selected?.id,
    replyIndex,
    replyCount: replies.length,
  }
}

let hudReplyId: string | null = null
const hudReplyListeners = new Set<() => void>()

export function getHudReplyId() {
  return hudReplyId
}

export function subscribeHudReplyId(listener: () => void) {
  hudReplyListeners.add(listener)
  return () => {
    hudReplyListeners.delete(listener)
  }
}

export function setHudReplyId(id: string | null) {
  if (hudReplyId === id) return
  hudReplyId = id
  for (const listener of hudReplyListeners) listener()
}

export function clipHudText(text: string, max = 80) {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, max)}…`
}
