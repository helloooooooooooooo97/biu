import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import * as llm from '@biu/host-llm'
import * as agentLoop from '@biu/host-agent-loop'
import * as agents from '@biu/host-agents'
import * as liveSessions from './index.ts'

test('live plugin no longer registers session_* tools', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  await ctx.plugin(liveSessions)
  const names = ctx.tools.names()
  assert.equal(names.some((name) => name.startsWith('session_')), false)
  assert.deepEqual([...liveSessions.LIVE_TOOL_NAMES], [
    'db_list',
    'db_read',
    'db_update',
    'db_create',
    'db_delete',
    'db_restore',
    'db_stat',
    'db_action',
    'db_content',
    'db_asset',
  ])
})

test('session turn follows tool mode and does not special-case a live type', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  await ctx.plugin(liveSessions)

  ctx.tools.register({
    name: 'bash',
    description: 'bash',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  ctx.tools.register({
    name: 'db_action',
    description: 'db action',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  ctx.tools.setMode('minimal')
  assert.deepEqual(ctx.tools.names().sort(), ['bash'])

  const session = await ctx.sessions.create()
  let seen: string[] = []
  const { AgentLoop } = await import('@biu/host-agent-loop')
  const loop = new AgentLoop(
    ctx,
    {
      async chat(_messages, toolSchemas) {
        seen = (toolSchemas as Array<{ function: { name: string } }>).map((item) => item.function.name).sort()
        return { content: 'ok', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } }
      },
    },
    session.id,
    new AbortController().signal,
  )
  await loop.run([{ kind: 'wake', text: 'list sessions' }])
  assert.equal(seen.includes('bash'), true)
  assert.equal(seen.includes('db_action'), true)
  assert.deepEqual(ctx.tools.names().sort(), ['bash'])
})

test('buildSessionProgress derives turn/step/status and afterSeq delta text', () => {
  const events = [
    { type: 'session/open' as const, version: 1, seq: 0, ts: 1 },
    { type: 'turn/start' as const, turn: 1, seq: 1, ts: 2 },
    { type: 'step/start' as const, turn: 1, step: 1, seq: 2, ts: 3 },
    { type: 'tool/call' as const, id: '1', name: 'bash', arguments: '{}', seq: 3, ts: 4 },
    { type: 'tool/result' as const, id: '1', name: 'bash', ok: true, detail: 'ok', seq: 4, ts: 5 },
    { type: 'assistant/message' as const, text: 'working on it', seq: 5, ts: 6 },
    { type: 'step/end' as const, turn: 1, step: 1, seq: 6, ts: 7 },
  ]
  const mid = liveSessions.buildSessionProgress(events, { busy: true })
  assert.equal(mid.status, 'running')
  assert.equal(mid.turn, 1)
  assert.equal(mid.step, 1)
  assert.equal(mid.lastTool?.name, 'bash')
  assert.equal(mid.lastTool?.ok, true)
  assert.equal(mid.assistantText, 'working on it')

  const more = [
    ...events,
    { type: 'assistant/message' as const, text: 'almost done', seq: 7, ts: 8 },
    { type: 'turn/end' as const, turn: 1, reason: 'complete', seq: 8, ts: 9 },
  ]
  const done = liveSessions.buildSessionProgress(more, { afterSeq: 6, busy: false })
  assert.equal(done.status, 'idle')
  assert.equal(done.reason, 'complete')
  assert.equal(done.assistantText, 'almost done')
  assert.equal(done.newestSeq, 8)
})
