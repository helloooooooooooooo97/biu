import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  compactSessionEvents,
  extractUsagePoints,
  formatTrajectoryUsage,
  mergeDispatchedUsageIntoNodes,
  projectNodes,
  projectRequestMessages,
  projectTrajectory,
  sumTrajectoryUsage,
  deriveMessages,
  type SessionEvent,
} from './session-project.ts'

test('projects user, streaming assistant, tool call/result from session events', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 1 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 1, ts: 2 },
    { type: 'assistant/chunk', text: 'hel', seq: 2, ts: 3 },
    { type: 'assistant/chunk', text: 'lo', seq: 3, ts: 4 },
    { type: 'assistant/message', text: 'hello', seq: 4, ts: 5 },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{"command":"echo"}', seq: 5, ts: 6 },
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 6, ts: 7 },
    { type: 'assistant/message', text: 'done', seq: 7, ts: 8 },
  ]
  const nodes = projectNodes(events)
  assert.deepEqual(
    nodes.map((node) => node.kind),
    ['user', 'reply'],
  )
  const reply = nodes[1]
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.deepEqual(
    reply.parts.map((part) => part.kind),
    ['assistant', 'tool', 'assistant'],
  )
  assert.equal(reply.copyText, 'hello\n\ndone')
  assert.equal(reply.parts[0]?.kind === 'assistant' && reply.parts[0].text, 'hello')
  assert.equal(reply.parts[1]?.kind === 'tool' && reply.parts[1].result?.detail, 'ok')
  const user = nodes[0]
  assert.equal(user?.kind, 'user')
  if (user?.kind === 'user') assert.equal(user.ts, 2)
})

test('projectNodes attaches content/edits onto the turn reply', () => {
  const files = [
    { path: '/pages/home', title: '首页', added: 3, removed: 1, jump_line: 4 },
  ]
  const nodes = projectNodes([
    { type: 'turn/start', turn: 2, seq: 1, ts: 1 },
    { type: 'user/message', text: '改文档', kind: 'wake', seq: 2, ts: 2 },
    { type: 'content/edits', turn: 2, files, seq: 3, ts: 3 },
    { type: 'assistant/message', text: '已改', seq: 4, ts: 4 },
    { type: 'turn/end', turn: 2, reason: 'complete', seq: 5, ts: 5 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.deepEqual(reply.contentEdits, files)
  assert.equal(reply.copyText, '已改')
})

test('projectNodes keeps all five 你好 content edits on the reply', () => {
  const files = [1, 2, 3, 4, 5].map((n) => ({
    path: `/pages/p${n}`,
    title: '你好',
    added: 1,
    removed: 0,
    jump_line: 1,
  }))
  const nodes = projectNodes([
    { type: 'turn/start', turn: 3, seq: 1, ts: 1 },
    { type: 'user/message', text: '五页你好', kind: 'wake', seq: 2, ts: 2 },
    { type: 'content/edits', turn: 3, files: files.slice(0, 1), seq: 3, ts: 3 },
    { type: 'content/edits', turn: 3, files, seq: 4, ts: 4 },
    { type: 'assistant/message', text: '好了', seq: 5, ts: 5 },
    { type: 'turn/end', turn: 3, reason: 'complete', seq: 6, ts: 6 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.equal(reply.contentEdits?.length, 5)
  assert.deepEqual(
    reply.contentEdits?.map((file) => file.path),
    ['/pages/p1', '/pages/p2', '/pages/p3', '/pages/p4', '/pages/p5'],
  )
})

test('projectNodes keeps streamed DeepSeek reasoning as a think part', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1 },
    { type: 'step/start', turn: 1, step: 0, seq: 2, ts: 2 },
    { type: 'assistant/chunk', text: '先想', channel: 'reasoning', seq: 3, ts: 3 },
    { type: 'assistant/chunk', text: '清楚', channel: 'reasoning', seq: 4, ts: 4 },
    { type: 'assistant/chunk', text: '短答', seq: 5, ts: 5 },
    { type: 'assistant/message', text: '短答', seq: 6, ts: 6 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.deepEqual(
    reply.parts.map((part) => part.kind),
    ['think', 'assistant'],
  )
  assert.equal(reply.parts[0]?.kind === 'think' && reply.parts[0].text, '先想清楚')
  assert.equal(reply.parts[1]?.kind === 'assistant' && reply.parts[1].text, '短答')
  assert.equal(reply.copyText, '短答')
})

test('projects live sender onto user nodes', () => {
  const nodes = projectNodes([
    { type: 'session/open', version: 1, seq: 0, ts: 1 },
    {
      type: 'user/message',
      text: 'do it',
      kind: 'wake',
      sender: { type: 'session', sessionId: 'live-1' },
      seq: 1,
      ts: 2,
    },
  ])
  const user = nodes[0]
  assert.equal(user?.kind, 'user')
  if (user?.kind !== 'user') return
  assert.deepEqual(user.sender, { type: 'session', sessionId: 'live-1' })
})

test('keeps reply streaming across tools until turn/end (Details stay open)', () => {
  const base: SessionEvent[] = [
    { type: 'turn/start', turn: 1, seq: 0, ts: 1 },
    { type: 'step/start', turn: 1, step: 0, seq: 1, ts: 2 },
    { type: 'assistant/chunk', text: 'thinking', seq: 2, ts: 3 },
    { type: 'assistant/message', text: 'thinking', tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }], seq: 3, ts: 4 },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{}', seq: 4, ts: 5 },
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 5, ts: 6 },
    { type: 'step/end', turn: 1, step: 0, seq: 6, ts: 7 },
  ]

  const mid = projectNodes(base)
  const midReply = mid.find((node) => node.kind === 'reply')
  assert.equal(midReply?.kind, 'reply')
  if (midReply?.kind === 'reply') {
    assert.equal(midReply.streaming, true)
    assert.equal(midReply.finished, false)
  }

  const done = projectNodes([
    ...base,
    { type: 'step/start', turn: 1, step: 1, seq: 7, ts: 8 },
    { type: 'assistant/message', text: 'final answer', seq: 8, ts: 9 },
    { type: 'step/end', turn: 1, step: 1, seq: 9, ts: 10 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 10, ts: 11 },
  ])
  const doneReply = done.find((node) => node.kind === 'reply')
  assert.equal(doneReply?.kind, 'reply')
  if (doneReply?.kind === 'reply') {
    assert.equal(doneReply.streaming, false)
    assert.equal(doneReply.finished, true)
    assert.equal(doneReply.copyText.includes('final answer'), true)
  }
})

test('accumulates usage and stepCount while the turn is still streaming', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 0, ts: 1 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 1, ts: 2 },
    { type: 'step/start', turn: 1, step: 0, seq: 2, ts: 3 },
    {
      type: 'assistant/message',
      text: 'thinking',
      tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
      usage: { inputTokens: 12, outputTokens: 4 },
      seq: 3,
      ts: 4,
    },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{}', seq: 4, ts: 5 },
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 5, ts: 6 },
    { type: 'step/end', turn: 1, step: 0, seq: 6, ts: 7 },
    { type: 'step/start', turn: 1, step: 1, seq: 7, ts: 8 },
    { type: 'assistant/message', text: 'more', usage: { inputTokens: 8, outputTokens: 3 }, seq: 8, ts: 9 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.equal(reply.streaming, true)
  assert.equal(reply.finished, false)
  assert.equal(reply.durationMs, undefined)
  assert.equal(reply.stepCount, 2)
  assert.deepEqual(reply.usage, {
    inputTokens: 20,
    outputTokens: 7,
    totalTokens: 27,
  })
})

test('partial tool/result marks the tool part as streaming', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 0, ts: 1 },
    { type: 'tool/call', id: 'c1', name: 'web_search', arguments: '{"query":"jay"}', seq: 1, ts: 2 },
    { type: 'tool/result', id: 'c1', name: 'web_search', ok: true, detail: '{"sources":[]}', partial: true, seq: 2, ts: 3 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  const tool = reply.parts.find((part) => part.kind === 'tool')
  assert.equal(tool?.kind === 'tool' && tool.result?.streaming, true)
  const events: SessionEvent[] = [
    { type: 'assistant/message', text: '', tool_calls: [{ id: 'c1', name: 'web_search', arguments: '{}' }], seq: 0, ts: 1 },
    { type: 'tool/result', id: 'c1', name: 'web_search', ok: true, detail: '{}', partial: true, seq: 1, ts: 2 },
  ]
  assert.equal(
    deriveMessages(events).some((item) => item.role === 'tool'),
    false,
  )
})

test('tool/call after tool/result keeps a single completed tool part', () => {
  const nodes = projectNodes([
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 1, ts: 1 },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{}', seq: 2, ts: 2 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  const tools = reply.parts.filter((part) => part.kind === 'tool')
  assert.equal(tools.length, 1)
  assert.equal(tools[0]?.kind === 'tool' && tools[0].result?.ok, true)
  assert.equal(tools[0]?.kind === 'tool' && tools[0].arguments, '{}')
})

test('turn/end non-complete becomes a status row', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 0, ts: 1 },
    { type: 'turn/end', turn: 1, reason: 'cancelled', seq: 1, ts: 2 },
  ])
  assert.equal(nodes[0]?.kind, 'turn')
  assert.match(nodes[0]?.kind === 'turn' ? nodes[0].text : '', /cancelled/)
})

test('reply aggregates turn duration and usage for footer', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1000 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 2, ts: 1100 },
    {
      type: 'assistant/message',
      text: 'hello',
      usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 4 },
      seq: 3,
      ts: 1500,
    },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 4, ts: 2800 },
  ])
  assert.deepEqual(
    nodes.map((node) => node.kind),
    ['user', 'reply'],
  )
  const reply = nodes[1]
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.equal(reply.finished, true)
  assert.equal(reply.turn, 1)
  assert.equal(reply.durationMs, 1800)
  assert.deepEqual(reply.usage, {
    inputTokens: 20,
    outputTokens: 8,
    totalTokens: 28,
    cacheReadTokens: 4,
  })
  assert.equal(reply.copyText, 'hello')
})

test('reply counts distinct steps in a turn', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 2, seq: 1, ts: 1000 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 2, ts: 1100 },
    { type: 'step/start', turn: 2, step: 0, seq: 3, ts: 1200 },
    { type: 'assistant/message', text: 'a', usage: { inputTokens: 1, outputTokens: 1 }, seq: 4, ts: 1300 },
    { type: 'step/end', turn: 2, step: 0, seq: 5, ts: 1400 },
    { type: 'step/start', turn: 2, step: 1, seq: 6, ts: 1500 },
    { type: 'assistant/message', text: 'b', usage: { inputTokens: 2, outputTokens: 2 }, seq: 7, ts: 1600 },
    { type: 'step/end', turn: 2, step: 1, seq: 8, ts: 1700 },
    { type: 'turn/end', turn: 2, reason: 'complete', seq: 9, ts: 1800 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.equal(reply.turn, 2)
  assert.equal(reply.stepCount, 2)
})

test('reply projects per-step token/tool/message stats', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1000 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 2, ts: 1100 },
    { type: 'step/start', turn: 1, step: 0, seq: 3, ts: 1200 },
    {
      type: 'assistant/message',
      text: 'hello',
      tool_calls: [{ id: 'c1', name: 'bash', arguments: '{}' }],
      usage: { inputTokens: 10, outputTokens: 4 },
      seq: 4,
      ts: 1300,
    },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{}', seq: 5, ts: 1400 },
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 6, ts: 1500 },
    { type: 'step/end', turn: 1, step: 0, seq: 7, ts: 1600 },
    { type: 'step/start', turn: 1, step: 1, seq: 8, ts: 1700 },
    { type: 'assistant/message', text: 'done!', usage: { inputTokens: 3, outputTokens: 2 }, seq: 9, ts: 1800 },
    { type: 'step/end', turn: 1, step: 1, seq: 10, ts: 1900 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 11, ts: 2000 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  assert.equal(reply.steps?.length, 2)
  assert.deepEqual(reply.steps?.[0], {
    step: 0,
    inputTokens: 10,
    outputTokens: 4,
    toolCount: 1,
    messageChars: 5,
    durationMs: 400,
  })
  assert.deepEqual(reply.steps?.[1], {
    step: 1,
    inputTokens: 3,
    outputTokens: 2,
    toolCount: 0,
    messageChars: 5,
    durationMs: 200,
  })
  assert.equal(reply.parts[0]?.step, 0)
  assert.equal(reply.parts.at(-1)?.step, 1)
})

test('projectTrajectory skips assistant/chunk (dsh-style; message is authoritative)', () => {
  const rows = projectTrajectory([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1 },
    { type: 'user/message', text: 'hi', seq: 2, ts: 2 },
    { type: 'assistant/chunk', text: 'hel', seq: 3, ts: 3 },
    { type: 'assistant/chunk', text: 'lo', seq: 4, ts: 4 },
    { type: 'assistant/message', text: 'hello', seq: 5, ts: 5 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 6, ts: 6 },
  ])
  assert.equal(rows.some((row) => row.type === 'assistant/chunk'), false)
  assert.equal(rows.filter((row) => row.type === 'assistant/message').length, 1)
  assert.equal(rows.find((row) => row.type === 'assistant/message')?.summary, 'hello')
})

test('compactSessionEvents coalesces chunks and drops ones superseded by message', () => {
  const compacted = compactSessionEvents([
    { type: 'user/message', text: 'hi', seq: 1, ts: 1 },
    { type: 'assistant/chunk', text: 'a', seq: 2, ts: 2 },
    { type: 'assistant/chunk', text: 'b', seq: 3, ts: 3 },
    { type: 'assistant/message', text: 'ab', seq: 4, ts: 4 },
    { type: 'assistant/chunk', text: 'partial', seq: 5, ts: 5 },
  ])
  assert.deepEqual(
    compacted.map((event) => event.type),
    ['user/message', 'assistant/message', 'assistant/chunk'],
  )
  assert.equal(compacted[2]?.type === 'assistant/chunk' && compacted[2].text, 'partial')
})

test('compactSessionEvents keeps reasoning chunks when the answer message arrives', () => {
  const compacted = compactSessionEvents([
    { type: 'assistant/chunk', text: '想', channel: 'reasoning', seq: 1, ts: 1 },
    { type: 'assistant/chunk', text: '一下', channel: 'reasoning', seq: 2, ts: 2 },
    { type: 'assistant/chunk', text: '答', seq: 3, ts: 3 },
    { type: 'assistant/message', text: '答', seq: 4, ts: 4 },
  ])
  assert.deepEqual(
    compacted.map((event) => event.type),
    ['assistant/chunk', 'assistant/message'],
  )
  assert.equal(compacted[0]?.type === 'assistant/chunk' && compacted[0].channel, 'reasoning')
  assert.equal(compacted[0]?.type === 'assistant/chunk' && compacted[0].text, '想一下')
})

test('projectTrajectory keeps seq ledger and tool callIds for inspect', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 1 },
    { type: 'turn/start', turn: 1, seq: 1, ts: 2 },
    { type: 'user/message', text: 'run bash', seq: 2, ts: 3 },
    { type: 'tool/call', id: 'c1', name: 'bash', arguments: '{"command":"ls"}', seq: 3, ts: 4 },
    { type: 'tool/result', id: 'c1', name: 'bash', ok: true, detail: 'ok', seq: 4, ts: 5 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 5, ts: 6 },
  ]
  const rows = projectTrajectory(events)
  assert.equal(rows.some((row) => row.type === 'session/open'), false)
  const call = rows.find((row) => row.type === 'tool/call')
  assert.equal(call?.callId, 'c1')
  assert.equal(call?.turn, 1)
  assert.match(call?.summary ?? '', /bash/)
})

test('projectTrajectory indents step boundaries and in-step events', () => {
  const rows = projectTrajectory([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1 },
    { type: 'user/message', text: 'hi', seq: 2, ts: 2 },
    { type: 'step/start', turn: 1, step: 0, seq: 3, ts: 3 },
    { type: 'assistant/message', text: 'ok', seq: 4, ts: 4 },
    { type: 'tool/call', id: 't1', name: 'bash', arguments: '{}', seq: 5, ts: 5 },
    { type: 'step/end', turn: 1, step: 0, seq: 6, ts: 6 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 7, ts: 7 },
  ])
  const byType = Object.fromEntries(rows.map((row) => [row.type, row]))
  assert.equal(byType['turn/start']?.depth, 0)
  assert.equal(byType['user/message']?.depth, 0)
  assert.equal(byType['step/start']?.depth, 1)
  assert.equal(byType['assistant/message']?.depth, 2)
  assert.equal(byType['tool/call']?.depth, 2)
  assert.equal(byType['step/end']?.depth, 1)
  assert.equal(byType['turn/end']?.depth, 0)
})

test('assistant/message with empty text still has a visible tool_calls summary and usage', () => {
  const events: SessionEvent[] = [
    {
      type: 'assistant/message',
      text: '',
      tool_calls: [{ id: '1', name: 'clock_now', arguments: '{}' }],
      usage: { inputTokens: 11, outputTokens: 3 },
      seq: 1,
      ts: 1,
    },
    {
      type: 'assistant/message',
      text: '现在是下午',
      usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 4 },
      seq: 2,
      ts: 2,
    },
  ]
  const rows = projectTrajectory(events)
  assert.match(rows[0]?.summary ?? '', /tool call/)
  assert.match(rows[0]?.summary ?? '', /clock_now/)
  assert.deepEqual(rows[0]?.usage, { inputTokens: 11, outputTokens: 3 })
  assert.equal(rows[1]?.summary, '现在是下午')
  assert.equal(formatTrajectoryUsage(rows[1]?.usage), '20→8 c4')
  assert.deepEqual(sumTrajectoryUsage(events), {
    inputTokens: 31,
    outputTokens: 11,
    totalTokens: 42,
    cacheReadTokens: 4,
  })
})

test('mergeDispatchedUsageIntoNodes adds live-dispatched worker usage onto reply turn', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 2, seq: 1, ts: 1 },
    { type: 'user/message', text: 'go', kind: 'wake', seq: 2, ts: 2 },
    {
      type: 'assistant/message',
      text: 'queued',
      usage: { inputTokens: 3, outputTokens: 1 },
      seq: 3,
      ts: 3,
    },
    { type: 'turn/end', turn: 2, reason: 'complete', seq: 4, ts: 4 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.ok(reply && reply.kind === 'reply')
  const merged = mergeDispatchedUsageIntoNodes(nodes, {
    '2': { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
  })
  const next = merged.find((node) => node.kind === 'reply')
  assert.ok(next && next.kind === 'reply')
  assert.deepEqual(next.usage, {
    inputTokens: 43,
    outputTokens: 11,
    totalTokens: 54,
  })
})

test('projectRequestMessages derives llm.chat input from event prefix', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 1 },
    { type: 'turn/start', turn: 1, seq: 1, ts: 2 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 2, ts: 3 },
    { type: 'system/prompt', text: 'you are helpful', seq: 3, ts: 4 },
    { type: 'step/start', turn: 1, step: 0, seq: 4, ts: 5 },
    { type: 'assistant/message', text: 'hello', seq: 5, ts: 6 },
  ]
  const request = projectRequestMessages(events, 5)
  assert.deepEqual(
    request.map((item) => item.role),
    ['system', 'user'],
  )
  assert.equal(request[0]?.content, 'you are helpful')
  assert.equal(request[1]?.content, 'hi')
})

test('extractUsagePoints keeps only assistant/message rows with usage, mapped to input/output', () => {
  const events: SessionEvent[] = [
    {
      type: 'assistant/message',
      text: 'a',
      usage: { inputTokens: 100, outputTokens: 20 },
      seq: 1,
      ts: 1,
    },
    { type: 'tool/call', name: 'clock_now', arguments: '{}', id: 'x', seq: 2, ts: 2 },
    { type: 'tool/result', name: 'clock_now', ok: true, detail: '', id: 'x', seq: 3, ts: 3 },
    {
      type: 'assistant/message',
      text: 'b',
      usage: { inputTokens: 250, outputTokens: 60, cacheReadTokens: 40 },
      seq: 4,
      ts: 4,
    },
    // 无 usage 的 assistant/message 应被过滤
    { type: 'assistant/message', text: 'c', seq: 5, ts: 5 },
    { type: 'step/start', turn: 1, step: 1, seq: 6, ts: 6 },
  ]
  const rows = projectTrajectory(events)
  const points = extractUsagePoints(rows)
  assert.deepEqual(points, [
    { input: 100, output: 20 },
    { input: 250, output: 60 },
  ])
})

test('extractUsagePoints returns empty when no usage-bearing rows', () => {
  const rows = projectTrajectory([
    { type: 'assistant/message', text: 'x', seq: 1, ts: 1 },
    { type: 'user/message', text: 'hi', seq: 2, ts: 2 },
  ])
  assert.deepEqual(extractUsagePoints(rows), [])
})

test('reply & step histPct is token-weighted average over all llm.chat usage', () => {
  const nodes = projectNodes([
    { type: 'turn/start', turn: 1, seq: 1, ts: 1000 },
    { type: 'user/message', text: 'hi', kind: 'wake', seq: 2, ts: 1100 },
    { type: 'step/start', turn: 1, step: 0, seq: 3, ts: 1200 },
    // step0: 100 tokens, histPct 0.2
    {
      type: 'assistant/message',
      text: 'a',
      usage: { inputTokens: 100, outputTokens: 10, histPct: 0.2 },
      seq: 4,
      ts: 1300,
    },
    { type: 'step/end', turn: 1, step: 0, seq: 5, ts: 1400 },
    { type: 'step/start', turn: 1, step: 1, seq: 6, ts: 1500 },
    // step1: 300 tokens, histPct 0.8
    {
      type: 'assistant/message',
      text: 'b',
      usage: { inputTokens: 300, outputTokens: 30, histPct: 0.8 },
      seq: 7,
      ts: 1600,
    },
    { type: 'step/end', turn: 1, step: 1, seq: 8, ts: 1700 },
    { type: 'turn/end', turn: 1, reason: 'complete', seq: 9, ts: 1800 },
  ])
  const reply = nodes.find((node) => node.kind === 'reply')
  assert.equal(reply?.kind, 'reply')
  if (reply?.kind !== 'reply') return
  // 加权平均 = (0.2×100 + 0.8×300) / 400 = 0.65
  assert.equal(reply.usage?.inputTokens, 400)
  assert.ok(reply.usage?.histPct !== undefined)
  assert.ok(Math.abs(reply.usage.histPct! - 0.65) < 1e-9)
  // 各 step 单独保留自身 histPct
  assert.equal(reply.steps?.[0]?.histPct, 0.2)
  assert.equal(reply.steps?.[1]?.histPct, 0.8)
})
