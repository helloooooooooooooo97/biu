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
import * as subagents from '@biu/host-subagents'
import { runWithSession } from '@biu/host-sessions/scope'

async function spine() {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  await ctx.plugin(subagents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  return ctx
}

test('in-process subagent uses its own session', async () => {
  const ctx = await spine()
  const result = (await ctx.tools.invoke('subagent_spawn', { prompt: 'child' })) as { sessionId: string; text: string }
  assert.match(result.text, /child/)
  const parent = await ctx.sessions.create()
  assert.notEqual(result.sessionId, parent.id)
})

test('spawn without inherit still belongs to the parent agent person', async () => {
  const ctx = await spine()
  ctx.identity = { currentMemberId: () => 'm_person' }
  const parent = await ctx.sessions.create()
  assert.equal(parent.config?.ownerMemberId, 'm_person')
  const result = await runWithSession(parent.id, () =>
    ctx.tools.invoke('subagent_spawn', { prompt: 'child' }),
  ) as { sessionId: string }
  const child = await ctx.sessions.require(result.sessionId)
  assert.equal(child.config?.ownerMemberId, 'm_person')
  assert.equal(child.config?.parentSessionId, parent.id)
})

test('inherit forks parent log into the child session', async () => {
  const ctx = await spine()
  const parent = await ctx.sessions.create()
  await ctx.sessions.append(parent.id, { type: 'user/message', text: 'parent-note', kind: 'wake' })
  const result = (await ctx.tools.invoke('subagent_spawn', {
    prompt: 'child',
    inherit: true,
    parentSessionId: parent.id,
  })) as { sessionId: string; inherited: boolean }
  assert.equal(result.inherited, true)
  const users = ctx.sessions
    .deriveMessages(result.sessionId)
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
  assert.equal(users.includes('parent-note'), true)
  assert.equal(users.includes('child'), true)
})
