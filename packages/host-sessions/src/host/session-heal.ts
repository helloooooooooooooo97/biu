import type { SessionEvent, SessionEventBody } from '@biu/type-session'

export type OpenTurnStep = {
  openTurn: number | null
  openStep: { turn: number; step: number } | null
}

const INTERRUPTED_TOOL_DETAIL =
  'interrupted: tool call was not completed (host restart or crash before tool/result)'

/** 扫描事件日志：未配对的 turn/start、step/start。 */
export function findOpenTurnStep(events: SessionEvent[]): OpenTurnStep {
  let openTurn: number | null = null
  let openStep: { turn: number; step: number } | null = null
  for (const event of events) {
    if (event.type === 'turn/start') {
      openTurn = event.turn
      openStep = null
      continue
    }
    if (event.type === 'step/start') {
      openTurn = event.turn
      openStep = { turn: event.turn, step: event.step }
      continue
    }
    if (event.type === 'step/end') {
      if (openStep && openStep.turn === event.turn && openStep.step === event.step) {
        openStep = null
      }
      continue
    }
    if (event.type === 'turn/end') {
      openTurn = null
      openStep = null
    }
  }
  return { openTurn, openStep }
}

/**
 * assistant/message.tool_calls 里尚未出现对应 tool/result 的 id。
 * 崩溃常停在「已写 tool_calls、未写 result」——下一轮 LLM 会拒收整段历史。
 */
export function findOrphanToolCalls(
  events: SessionEvent[],
): Array<{ id: string; name: string }> {
  const pending = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'assistant/message' && event.tool_calls?.length) {
      for (const call of event.tool_calls) {
        pending.set(call.id, call.name)
      }
    } else if (event.type === 'tool/result' && !event.partial) {
      pending.delete(event.id)
    }
  }
  return [...pending.entries()].map(([id, name]) => ({ id, name }))
}

export function orphanToolResultBodies(
  orphans: Array<{ id: string; name: string }>,
): SessionEventBody[] {
  return orphans.map((call) => ({
    type: 'tool/result',
    id: call.id,
    name: call.name,
    ok: false,
    detail: INTERRUPTED_TOOL_DETAIL,
  }))
}

function stripSeqTs(event: SessionEvent): SessionEventBody {
  const { seq: _seq, ts: _ts, ...body } = event
  return body as SessionEventBody
}

/**
 * 按对话顺序重建事件：
 * - 在带 tool_calls 的 assistant 之后、下一条 user/assistant 之前插入缺失的 tool/result
 * - 丢掉错位/重复的 tool/result（例如旧 heal 追加在日志末尾）
 * - 闭合未结束的 step/turn
 * - 重编 seq
 *
 * 无变更时返回 null。
 */
export function rebuildHealedEvents(
  events: SessionEvent[],
  now = Date.now(),
): SessionEvent[] | null {
  const out: SessionEvent[] = []
  const pending = new Map<string, string>()
  let changed = false

  const push = (body: SessionEventBody, ts: number) => {
    out.push({ ...body, seq: out.length, ts } as SessionEvent)
  }

  const flushPending = () => {
    if (!pending.size) return
    changed = true
    for (const body of orphanToolResultBodies(
      [...pending.entries()].map(([id, name]) => ({ id, name })),
    )) {
      push(body, now)
    }
    pending.clear()
  }

  for (const event of events) {
    if (event.type === 'tool/result') {
      if (event.partial) {
        changed = true
        continue
      }
      if (!pending.has(event.id)) {
        changed = true
        continue
      }
      pending.delete(event.id)
      push(stripSeqTs(event), event.ts)
      continue
    }

    if (event.type === 'user/message' || event.type === 'assistant/message') {
      flushPending()
      push(stripSeqTs(event), event.ts)
      if (event.type === 'assistant/message' && event.tool_calls?.length) {
        for (const call of event.tool_calls) {
          pending.set(call.id, call.name)
        }
      }
      continue
    }

    // chunk / tool/call 可夹在 tool_calls 与 tool/result 之间；其余事件前先闭合未配对 tool
    if (pending.size && event.type !== 'assistant/chunk' && event.type !== 'tool/call') {
      flushPending()
    }
    push(stripSeqTs(event), event.ts)
  }

  flushPending()

  const { openTurn, openStep } = findOpenTurnStep(out)
  if (openStep) {
    changed = true
    push({ type: 'step/end', turn: openStep.turn, step: openStep.step }, now)
  }
  if (openTurn != null) {
    changed = true
    push({ type: 'turn/end', turn: openTurn, reason: 'host-restart' }, now)
  }

  if (!changed) return null
  return out.map((event, i) => ({ ...event, seq: i }))
}

/**
 * 仅计算「追加在末尾」的补丁（旧行为）。新加载路径请用 rebuildHealedEvents。
 * 保留给单元测试与兼容导出。
 */
export function healInterruptedTurnBodies(events: SessionEvent[]): SessionEventBody[] {
  const orphans = findOrphanToolCalls(events)
  const { openTurn, openStep } = findOpenTurnStep(events)
  const out: SessionEventBody[] = [...orphanToolResultBodies(orphans)]
  if (openStep) {
    out.push({ type: 'step/end', turn: openStep.turn, step: openStep.step })
  }
  if (openTurn != null) {
    out.push({ type: 'turn/end', turn: openTurn, reason: 'host-restart' })
  }
  return out
}

export { INTERRUPTED_TOOL_DETAIL }
