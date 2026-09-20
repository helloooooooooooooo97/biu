import type { SessionGoal } from '@biu/type-session'
import { normalizeSessionGoal } from '@biu/type-session'

export const MAX_GOAL_TURNS = 32
export const GOAL_CONTINUE_PREFIX = '【goal 续跑】'

export type GoalSlash =
  | { kind: 'start'; objective: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'clear' }
  | { kind: 'status' }

export function newGoalId() {
  return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function goalFromConfig(raw: unknown): SessionGoal | undefined {
  return normalizeSessionGoal(raw)
}

export function parseGoalSlash(text: string): GoalSlash | null {
  const trimmed = text.trim()
  const match = trimmed.match(/^\/goal(?:\s+([\s\S]*))?$/i)
  if (!match) return null
  const rest = (match[1] ?? '').trim()
  if (!rest) return { kind: 'status' }
  const head = rest.split(/\s+/, 1)[0]?.toLowerCase() ?? ''
  if (head === 'pause' && rest.slice(head.length).trim() === '') return { kind: 'pause' }
  if (head === 'resume' && rest.slice(head.length).trim() === '') return { kind: 'resume' }
  if (head === 'clear' && rest.slice(head.length).trim() === '') return { kind: 'clear' }
  return { kind: 'start', objective: rest.slice(0, 4000) }
}

export function continuationPrompt(goal: SessionGoal) {
  return `${GOAL_CONTINUE_PREFIX} 目标尚未完成（goal_id=${goal.id}）。对照已有证据继续推进，完成后必须调用 goal_complete；不要只口头说做完。目标：${goal.objective}`
}

export function decideGoalContinuation(input: {
  goal: SessionGoal | undefined
  aborted: boolean
  inboxLength: number
}): 'continue' | 'stop' | 'budget' {
  if (input.aborted || input.inboxLength > 0) return 'stop'
  if (!input.goal || input.goal.status !== 'pursuing') return 'stop'
  if (input.goal.turns >= MAX_GOAL_TURNS) return 'budget'
  return 'continue'
}
