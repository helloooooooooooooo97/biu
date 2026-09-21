import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import { AgentLoop, MAX_TOOL_RESULT_CHARS, truncateToolResult, type AgentTurn } from '@biu/host-agent-loop'
import type { AssistantReply, LlmClient, LlmMessage } from '@biu/host-llm'

class ScriptedLlm implements LlmClient {
  constructor(private replies: AssistantReply[]) {}

  async chat(
    _messages: LlmMessage[],
    _tools?: unknown[],
    _signal?: AbortSignal,
    options?: { onDelta?: (text: string) => void | Promise<void> },
  ): Promise<AssistantReply> {
    const next = this.replies.shift()
    if (!next) throw new Error('unexpected extra llm.chat')
    if (next.content) await options?.onDelta?.(next.content)
    return next
  }
}

async function spine() {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  const session = await ctx.sessions.create()
  return { ctx, sessionId: session.id }
}

test('loop appends multiple assistant/chunk deltas from onDelta', async () => {
  const { ctx, sessionId } = await spine()
  const llm: LlmClient = {
    async chat(_messages, _tools, _signal, options) {
      await options?.onDelta?.('Hel')
      await options?.onDelta?.('lo')
      return { content: 'Hello', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } }
    },
  }
  const loop = new AgentLoop(ctx, llm, sessionId, new AbortController().signal)
  const turn = await loop.run([{ kind: 'wake', text: 'hi' }])
  assert.equal(turn.text, 'Hello')
  const chunks = (await ctx.sessions.require(sessionId)).events.filter((event) => event.type === 'assistant/chunk')
  // onDelta 在 ~48ms 窗口内合并后再 append，同一步内多次 delta 落成一条 chunk
  assert.deepEqual(
    chunks.map((event) => (event.type === 'assistant/chunk' ? event.text : '')),
    ['Hello'],
  )
  const message = (await ctx.sessions.require(sessionId)).events.find((event) => event.type === 'assistant/message')
  assert.equal(message?.type === 'assistant/message' && message.usage?.inputTokens, 1)
})

test('loop invokes multiple tools concurrently', async () => {
  const { ctx, sessionId } = await spine()
  let inflight = 0
  let peak = 0
  ctx.tools.register({
    name: 'hold',
    description: 'hold',
    parameters: { type: 'object', properties: { id: { type: 'string' } } },
    execution: 'parallel',
    execute: async (args) => {
      inflight += 1
      peak = Math.max(peak, inflight)
      await new Promise((resolve) => setTimeout(resolve, 60))
      inflight -= 1
      return String(args.id ?? '')
    },
  })
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([
      {
        content: null,
        toolCalls: [
          { id: '1', name: 'hold', arguments: '{"id":"a"}' },
          { id: '2', name: 'hold', arguments: '{"id":"b"}' },
        ],
      },
      { content: 'both done', toolCalls: [] },
    ]),
    sessionId,
    new AbortController().signal,
  )
  const turn = await loop.run([{ kind: 'wake', text: 'go' }])
  assert.equal(peak, 2)
  assert.deepEqual(
    turn.steps.map((item) => item.detail),
    ['a', 'b'],
  )
  const types = (await ctx.sessions.require(sessionId)).events.map((event) => event.type)
  const firstResult = types.indexOf('tool/result')
  const secondCall = types.lastIndexOf('tool/call')
  assert.ok(secondCall >= 0 && firstResult >= 0 && secondCall < firstResult)
})

test('loop invokes tools then asks the model again', async () => {
  const { ctx, sessionId } = await spine()
  ctx.tools.register({
    name: 'echo',
    description: 'echo',
    parameters: { type: 'object', properties: { text: { type: 'string' } } },
    execute: (args) => String(args.text ?? ''),
  })
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([
      { content: null, toolCalls: [{ id: '1', name: 'echo', arguments: '{"text":"pong"}' }] },
      { content: '收到 pong', toolCalls: [] },
    ]),
    sessionId,
    new AbortController().signal,
  )
  const turn = await loop.run([{ kind: 'wake', text: 'echo' }])
  assert.equal(turn.text, '收到 pong')
  assert.deepEqual(turn.steps, [{ name: 'echo', ok: true, detail: 'pong' }])
  const messages = ctx.sessions.deriveMessages(sessionId)
  assert.equal(messages.some((item) => item.role === 'tool' && item.content === 'pong'), true)
})

test('parallel tools overlap while exclusive tools form barriers', async () => {
  const { ctx, sessionId } = await spine()
  const timeline: string[] = []
  let active = 0
  let maxActive = 0
  const registerParallel = (name: string) =>
    ctx.tools.register({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      execution: 'parallel',
      execute: async () => {
        timeline.push(`${name}:start`)
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 30))
        active -= 1
        timeline.push(`${name}:end`)
        return name
      },
    })
  registerParallel('p1')
  registerParallel('p2')
  registerParallel('p3')
  ctx.tools.register({
    name: 'exclusive',
    description: 'exclusive',
    parameters: { type: 'object', properties: {} },
    execute: () => {
      timeline.push('exclusive:start')
      timeline.push('exclusive:end')
      return 'exclusive'
    },
  })
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([
      {
        content: null,
        toolCalls: [
          { id: '1', name: 'p1', arguments: '{}' },
          { id: '2', name: 'p2', arguments: '{}' },
          { id: '3', name: 'exclusive', arguments: '{}' },
          { id: '4', name: 'p3', arguments: '{}' },
        ],
      },
      { content: 'done', toolCalls: [] },
    ]),
    sessionId,
    new AbortController().signal,
  )

  const turn = await loop.run([{ kind: 'wake', text: 'run' }])
  assert.equal(maxActive, 2)
  assert.ok(timeline.indexOf('exclusive:start') > timeline.indexOf('p1:end'))
  assert.ok(timeline.indexOf('exclusive:start') > timeline.indexOf('p2:end'))
  assert.ok(timeline.indexOf('p3:start') > timeline.indexOf('exclusive:end'))
  assert.deepEqual(turn.steps.map((item) => item.name), ['p1', 'p2', 'exclusive', 'p3'])

  const events = (await ctx.sessions.require(sessionId)).events
  const calls = events.filter((event) => event.type === 'tool/call' && ['1', '2', '3', '4'].includes(event.id))
  const results = events.filter((event) => event.type === 'tool/result' && ['1', '2', '3', '4'].includes(event.id))
  assert.equal(calls.length, 4)
  assert.equal(results.length, 4)
  assert.ok(Math.max(...calls.map((event) => event.seq)) < Math.min(...results.map((event) => event.seq)))
})

test('one parallel tool failure does not discard sibling results', async () => {
  const { ctx, sessionId } = await spine()
  ctx.tools.register({
    name: 'bad',
    description: 'bad',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => {
      throw new Error('broken')
    },
  })
  ctx.tools.register({
    name: 'good',
    description: 'good',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return 'kept'
    },
  })
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([
      {
        content: null,
        toolCalls: [
          { id: '1', name: 'bad', arguments: '{}' },
          { id: '2', name: 'good', arguments: '{}' },
        ],
      },
      { content: 'done', toolCalls: [] },
    ]),
    sessionId,
    new AbortController().signal,
  )

  const turn = await loop.run([{ kind: 'wake', text: 'run' }])
  assert.equal(turn.steps[0]?.ok, false)
  assert.match(turn.steps[0]?.detail ?? '', /broken/)
  assert.deepEqual(turn.steps[1], { name: 'good', ok: true, detail: 'kept' })
})

test('missing tool is a step failure, not a crash', async () => {
  const { ctx, sessionId } = await spine()
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([
      { content: null, toolCalls: [{ id: '1', name: 'gone', arguments: '{}' }] },
      { content: '没有这个工具', toolCalls: [] },
    ]),
    sessionId,
    new AbortController().signal,
  )
  const turn = await loop.run([{ kind: 'wake', text: 'x' }])
  assert.equal(turn.steps[0]?.ok, false)
  assert.match(turn.steps[0]?.detail ?? '', /unknown tool: gone/)
  assert.equal(turn.text, '没有这个工具')
})

test('pre-aborted signal never calls the model', async () => {
  const { ctx, sessionId } = await spine()
  const abort = new AbortController()
  abort.abort()
  let called = 0
  const llm: LlmClient = {
    chat: async () => {
      called += 1
      return { content: 'nope', toolCalls: [] }
    },
  }
  const loop = new AgentLoop(ctx, llm, sessionId, abort.signal)
  await assert.rejects(() => loop.run([{ kind: 'wake', text: 'x' }]), /cancelled/)
  assert.equal(called, 0)
})

test('cancelled signal stops the turn', async () => {
  const { ctx, sessionId } = await spine()
  const abort = new AbortController()
  const llm: LlmClient = {
    chat: async () => {
      abort.abort()
      throw new DOMException('aborted', 'AbortError')
    },
  }
  const loop = new AgentLoop(ctx, llm, sessionId, abort.signal)
  await assert.rejects(() => loop.run([{ kind: 'wake', text: 'x' }]), /cancelled|AbortError|aborted/i)
})

test('pre-step reject writes a turn with no step', async () => {
  const { ctx, sessionId } = await spine()
  ctx.on('agent/pre-step', (req, next) => ({ ...next(), reject: 'blocked' }))
  const loop = new AgentLoop(ctx, new ScriptedLlm([{ content: 'no', toolCalls: [] }]), sessionId, new AbortController().signal)
  const turn = await loop.run([{ kind: 'wake', text: 'x' }])
  assert.equal(turn.text, 'blocked')
  const types = (await ctx.sessions.require(sessionId)).events.map((item) => item.type)
  assert.equal(types.includes('step/start'), false)
  assert.equal(types.includes('turn/end'), true)
})

test('inject is admitted in the same turn as the wake', async () => {
  const { ctx, sessionId } = await spine()
  const loop = new AgentLoop(ctx, new ScriptedLlm([{ content: 'ok', toolCalls: [] }]), sessionId, new AbortController().signal)
  await loop.run([
    { kind: 'inject', text: 'note' },
    { kind: 'wake', text: 'hi' },
  ])
  const users = ctx.sessions.deriveMessages(sessionId).filter((item) => item.role === 'user').map((item) => item.content)
  assert.deepEqual(users, ['note', 'hi'])
})

test('abort closes the turn as cancelled', async () => {
  const { ctx, sessionId } = await spine()
  const ac = new AbortController()
  const llm: LlmClient = {
    async chat() {
      ac.abort()
      throw new DOMException('aborted', 'AbortError')
    },
  }
  const loop = new AgentLoop(ctx, llm, sessionId, ac.signal)
  await assert.rejects(() => loop.run([{ kind: 'wake', text: 'x' }]), /cancelled/)
  const types = (await ctx.sessions.require(sessionId)).events.map((item) => item.type)
  assert.equal(types.includes('turn/end'), true)
})

test('cancel during hung tool ends the turn instead of swallowing cancelled', async () => {
  const { ctx, sessionId } = await spine()
  const ac = new AbortController()
  ctx.tools.register({
    name: 'hang',
    description: 'hang',
    parameters: { type: 'object', properties: {} },
    execute: () => new Promise(() => undefined),
  })
  const loop = new AgentLoop(
    ctx,
    new ScriptedLlm([{ content: null, toolCalls: [{ id: '1', name: 'hang', arguments: '{}' }] }]),
    sessionId,
    ac.signal,
  )
  const pending = loop.run([{ kind: 'wake', text: 'x' }])
  await new Promise((resolve) => setTimeout(resolve, 40))
  ac.abort()
  await assert.rejects(() => pending, /cancelled/)
  const events = (await ctx.sessions.require(sessionId)).events
  const end = events.find((event) => event.type === 'turn/end')
  assert.equal(end?.type === 'turn/end' && end.reason, 'cancelled')
})

test('truncateToolResult keeps head+tail and clips middle when over limit', () => {
  const half = MAX_TOOL_RESULT_CHARS >> 1
  // 短输出不截断
  const short = 'pong'
  assert.equal(truncateToolResult(short), short)
  // 超长输出：保留头尾半段，中间用省略标记拼接
  const big = 'A'.repeat(half) + 'MID'.repeat(5_000) + 'Z'.repeat(half)
  const out = truncateToolResult(big)
  assert.ok(out.length <= MAX_TOOL_RESULT_CHARS + 30, `clipped length ${out.length}`)
  assert.equal(out.startsWith('A'.repeat(half)), true)
  assert.equal(out.endsWith('Z'.repeat(half)), true)
  assert.ok(out.includes('chars clipped'))
  // 恰达上限不截断
  const exact = 'x'.repeat(MAX_TOOL_RESULT_CHARS)
  assert.equal(truncateToolResult(exact), exact)
})
