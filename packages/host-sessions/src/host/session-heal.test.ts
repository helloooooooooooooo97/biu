import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  findOpenTurnStep,
  findOrphanToolCalls,
  healInterruptedTurnBodies,
  INTERRUPTED_TOOL_DETAIL,
  rebuildHealedEvents,
} from './session-heal.ts'
import type { SessionEvent, SessionEventBody } from '@biu/type-session'
import { deriveMessages } from './index.ts'

function ev(partial: SessionEventBody & { seq?: number; ts?: number }): SessionEvent {
  return { seq: partial.seq ?? 0, ts: partial.ts ?? 1, ...partial } as SessionEvent
}

test('findOpenTurnStep detects unfinished turn and step', () => {
  const open = findOpenTurnStep([
    ev({ type: 'session/open', version: 1, seq: 0 }),
    ev({ type: 'turn/start', turn: 2, seq: 1 }),
    ev({ type: 'step/start', turn: 2, step: 0, seq: 2 }),
  ])
  assert.deepEqual(open, { openTurn: 2, openStep: { turn: 2, step: 0 } })

  const closed = findOpenTurnStep([
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'step/start', turn: 1, step: 0, seq: 1 }),
    ev({ type: 'step/end', turn: 1, step: 0, seq: 2 }),
    ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 3 }),
  ])
  assert.deepEqual(closed, { openTurn: null, openStep: null })
})

test('healInterruptedTurnBodies fills orphan tool results then closes step/turn', () => {
  const bodies = healInterruptedTurnBodies([
    ev({ type: 'turn/start', turn: 3, seq: 0 }),
    ev({ type: 'step/start', turn: 3, step: 1, seq: 1 }),
    ev({
      type: 'assistant/message',
      text: '',
      tool_calls: [{ id: 'c1', name: 'session_wake', arguments: '{}' }],
    }),
  ])
  assert.deepEqual(bodies, [
    {
      type: 'tool/result',
      id: 'c1',
      name: 'session_wake',
      ok: false,
      detail: INTERRUPTED_TOOL_DETAIL,
    },
    { type: 'step/end', turn: 3, step: 1 },
    { type: 'turn/end', turn: 3, reason: 'host-restart' },
  ])
})

test('partial tool/result does not close orphan tool calls', () => {
  const events = [
    ev({
      type: 'assistant/message',
      text: '',
      tool_calls: [{ id: 'c1', name: 'web_search', arguments: '{}' }],
      seq: 0,
    }),
    ev({ type: 'tool/result', id: 'c1', name: 'web_search', ok: true, detail: '{}', partial: true, seq: 1 }),
  ]
  assert.deepEqual(findOrphanToolCalls(events), [{ id: 'c1', name: 'web_search' }])
  const rebuilt = rebuildHealedEvents(events)
  assert.ok(rebuilt)
  const finals = rebuilt!.filter((event) => event.type === 'tool/result' && !event.partial)
  assert.equal(finals.length, 1)
  if (finals[0]?.type === 'tool/result') {
    assert.equal(finals[0].ok, false)
    assert.match(finals[0].detail, /interrupted/)
  }
})

test('findOrphanToolCalls ignores completed tool pairs', () => {
  assert.deepEqual(
    findOrphanToolCalls([
      ev({
        type: 'assistant/message',
        text: '',
        tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
        seq: 0,
      }),
      ev({ type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 1 }),
    ]),
    [],
  )
})

test('healInterruptedTurnBodies closes turn-only', () => {
  const turnOnly = healInterruptedTurnBodies([ev({ type: 'turn/start', turn: 4, seq: 0 })])
  assert.deepEqual(turnOnly, [{ type: 'turn/end', turn: 4, reason: 'host-restart' }])
})

test('deriveMessages synthesizes missing tool results before next user', () => {
  const messages = deriveMessages([
    ev({ type: 'user/message', text: 'first', kind: 'wake', seq: 0 }),
    ev({
      type: 'assistant/message',
      text: '',
      tool_calls: [{ id: 't1', name: 'session_list', arguments: '{}' }],
      seq: 1,
    }),
    // crash: no tool/result
    ev({ type: 'user/message', text: 'hello again', kind: 'wake', seq: 2 }),
  ])
  assert.equal(messages[0]?.role, 'user')
  assert.equal(messages[1]?.role, 'assistant')
  assert.equal(messages[1]?.tool_calls?.[0]?.id, 't1')
  assert.equal(messages[2]?.role, 'tool')
  assert.equal(messages[2]?.tool_call_id, 't1')
  assert.equal(messages[3]?.role, 'user')
  assert.equal(messages[3]?.content, 'hello again')
})

test('rebuildHealedEvents inserts tool result before error assistant and drops misplaced trailing result', () => {
  const rebuilt = rebuildHealedEvents(
    [
      ev({ type: 'user/message', text: 'hi', kind: 'wake', seq: 0, ts: 10 }),
      ev({
        type: 'assistant/message',
        text: '',
        tool_calls: [{ id: 'call_x', name: 'session_wake', arguments: '{}' }],
        seq: 1,
        ts: 11,
      }),
      // 模型调用失败写进日志，旧 heal 却把 tool/result 追加在更后面
      ev({
        type: 'assistant/message',
        text: "模型调用失败：Error: An assistant message with 'tool_calls' must be followed by tool messages",
        seq: 2,
        ts: 12,
      }),
      ev({
        type: 'tool/result',
        id: 'call_x',
        name: 'session_wake',
        ok: false,
        detail: INTERRUPTED_TOOL_DETAIL,
        seq: 3,
        ts: 13,
      }),
      ev({ type: 'user/message', text: '再测并发', kind: 'wake', seq: 4, ts: 14 }),
    ],
    99,
  )
  assert.ok(rebuilt)
  const types = rebuilt!.map((e) => e.type)
  assert.deepEqual(types, [
    'user/message',
    'assistant/message',
    'tool/result',
    'assistant/message',
    'user/message',
  ])
  assert.equal(rebuilt![2]?.type, 'tool/result')
  if (rebuilt![2]?.type === 'tool/result') {
    assert.equal(rebuilt![2].id, 'call_x')
    assert.equal(rebuilt![2].ok, false)
  }
  // 错位的那条已被丢弃，没有第二份 tool/result
  assert.equal(rebuilt!.filter((e) => e.type === 'tool/result').length, 1)

  const messages = deriveMessages(rebuilt!)
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user', 'assistant', 'tool', 'assistant', 'user'],
  )
  assert.equal(messages[2]?.tool_call_id, 'call_x')
})

test('deriveMessages skips orphan tool results after error assistant', () => {
  const messages = deriveMessages([
    ev({
      type: 'assistant/message',
      text: '',
      tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
      seq: 0,
    }),
    ev({ type: 'assistant/message', text: '模型调用失败', seq: 1 }),
    ev({ type: 'tool/result', id: 'c1', name: 'bash', ok: false, detail: 'late', seq: 2 }),
  ])
  assert.deepEqual(
    messages.map((m) => m.role),
    ['assistant', 'tool', 'assistant'],
  )
  assert.equal(messages[1]?.tool_call_id, 'c1')
  assert.match(String(messages[1]?.content), /interrupted/)
})

test('rebuildHealedEvents keeps tool/call then matching tool/result', () => {
  assert.equal(
    rebuildHealedEvents([
      ev({ type: 'turn/start', turn: 1, seq: 0 }),
      ev({
        type: 'assistant/message',
        text: '',
        tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
        seq: 1,
      }),
      ev({ type: 'tool/call', id: 'c1', name: 'bash', arguments: '{}', seq: 2 }),
      ev({ type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 3 }),
      ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 4 }),
    ]),
    null,
  )
})

test('rebuildHealedEvents returns null when log is already healthy', () => {
  assert.equal(
    rebuildHealedEvents([
      ev({ type: 'turn/start', turn: 1, seq: 0 }),
      ev({
        type: 'assistant/message',
        text: '',
        tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
        seq: 1,
      }),
      ev({ type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 2 }),
      ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 3 }),
    ]),
    null,
  )
})
