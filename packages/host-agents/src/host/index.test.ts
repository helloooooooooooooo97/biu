import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import * as llm from '@biu/host-llm'
import * as agentLoop from '@biu/host-agent-loop'
import * as agents from './index.ts'

test('send without api key still writes a durable turn', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()
  const turn = await agent.send('hello')
  assert.match(turn.text, /本地回声：hello/)
  const events = (await ctx.sessions.require(agent.sessionId)).events.map((item) => item.type)
  assert.equal(events.includes('user/message'), true)
  assert.equal(events.includes('assistant/message'), true)
})

test('inject waits for the next wake and is logged first', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()
  agent.inject('note')
  await agent.send('go')
  const users = (await ctx.sessions.require(agent.sessionId)).events.filter((item) => item.type === 'user/message')
  assert.deepEqual(users.map((item) => ('text' in item ? item.text : '')), ['note', 'go'])
  assert.equal(users[0] && 'kind' in users[0] ? users[0].kind : '', 'inject')
})

test('send wait:false returns immediately; isBusy clears when done', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()
  const pending = agent.send('async-hi', { wait: false })
  assert.equal(ctx.agents.isBusy(agent.sessionId), true)
  const early = await pending
  assert.deepEqual(early, { text: '', steps: [] })
  // 等后台回合结束
  for (let i = 0; i < 50 && ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), false)
  assert.equal(
    (await ctx.sessions.require(agent.sessionId)).events.some(
      (event) => event.type === 'assistant/message',
    ),
    true,
  )
})

test('busy second send becomes inject alongside queued wake', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const originalCreate = ctx.agentLoop.create.bind(ctx.agentLoop)
  ctx.agentLoop.create = ((config, sessionId, signal) => {
    const runner = originalCreate(config, sessionId, signal)
    const originalRun = runner.run.bind(runner)
    runner.run = async (claimed) => {
      await gate
      return originalRun(claimed)
    }
    return runner
  }) as typeof ctx.agentLoop.create

  void agent.send('first', { wait: false })
  for (let i = 0; i < 20 && !ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), true)

  await agent.send('follow-up wake', { wait: false })
  let inbox = ctx.agents.listInbox(agent.sessionId)
  assert.equal(inbox.length, 1)
  assert.equal(inbox[0]?.kind, 'wake')
  assert.equal(inbox[0]?.text, 'follow-up wake')

  await agent.send('steer', { wait: false })
  inbox = ctx.agents.listInbox(agent.sessionId)
  assert.equal(inbox.length, 2)
  assert.deepEqual(
    inbox.map((item) => item.kind),
    ['wake', 'inject'],
  )
  assert.equal(inbox[1]?.text, 'steer')

  release()
  for (let i = 0; i < 80 && ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(ctx.agents.listInbox(agent.sessionId).length, 0)
  const users = (await ctx.sessions.require(agent.sessionId)).events
    .filter((item) => item.type === 'user/message')
    .map((item) => ('text' in item ? item.text : ''))
  assert.ok(users.includes('first'))
  assert.ok(users.includes('steer'))
  assert.ok(users.includes('follow-up wake'))
})

test('flush aborts current turn and claims queued wake+inject', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let runs = 0
  const originalCreate = ctx.agentLoop.create.bind(ctx.agentLoop)
  ctx.agentLoop.create = ((config, sessionId, signal) => {
    const runner = originalCreate(config, sessionId, signal)
    const originalRun = runner.run.bind(runner)
    runner.run = async (claimed) => {
      runs += 1
      if (runs === 1) {
        await gate
        if (signal.aborted) throw new Error('cancelled')
      }
      return originalRun(claimed)
    }
    return runner
  }) as typeof ctx.agentLoop.create

  void agent.send('running-now', { wait: false })
  for (let i = 0; i < 20 && !ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await agent.send('queued-wake', { wait: false })
  await agent.send('queued-inject', { wait: false })
  assert.equal(ctx.agents.listInbox(agent.sessionId).length, 2)

  const flushPromise = agent.flush({ wait: false })
  // 让 abort 生效后再放行第一回合
  await new Promise((resolve) => setTimeout(resolve, 20))
  release()
  const flushed = await flushPromise
  assert.equal(flushed.flushed, true)

  for (let i = 0; i < 80 && ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(ctx.agents.listInbox(agent.sessionId).length, 0)
  const users = (await ctx.sessions.require(agent.sessionId)).events
    .filter((item) => item.type === 'user/message')
    .map((item) => ('text' in item ? item.text : ''))
  assert.ok(users.includes('queued-inject'))
  assert.ok(users.includes('queued-wake'))
})

test('cancel unblocks a hung tool and clears busy', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  ctx.tools.register({
    name: 'hang',
    description: 'hang',
    parameters: { type: 'object', properties: {} },
    execute: () => new Promise(() => undefined),
  })
  const originalCreate = ctx.agentLoop.create.bind(ctx.agentLoop)
  ctx.agentLoop.create = ((config, sessionId, signal) => {
    const runner = originalCreate(config, sessionId, signal)
    runner.run = async () => {
      await ctx.tools.invoke('hang', {}, signal)
      return { text: 'nope', steps: [] }
    }
    return runner
  }) as typeof ctx.agentLoop.create

  const agent = await ctx.agents.create()
  void agent.send('go', { wait: false })
  for (let i = 0; i < 20 && !ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), true)
  agent.cancel()
  for (let i = 0; i < 50 && ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), false)
})

test('/goal wakes continuation until the goal is marked complete', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()
  let runs = 0
  const originalCreate = ctx.agentLoop.create.bind(ctx.agentLoop)
  ctx.agentLoop.create = ((config, sessionId, signal) => {
    const runner = originalCreate(config, sessionId, signal)
    runner.run = async () => {
      runs += 1
      if (runs >= 2) {
        const current = ctx.sessions.peek(agent.sessionId)?.config?.goal
        if (current) {
          await ctx.sessions.patchConfig(agent.sessionId, {
            goal: { ...current, status: 'achieved', summary: 'verified' },
          })
        }
        return { text: 'done', steps: [] }
      }
      return { text: 'working', steps: [] }
    }
    return runner
  }) as typeof ctx.agentLoop.create

  const turn = await agent.send('/goal 修好测试')
  assert.equal(turn.text, 'done')
  assert.equal(runs, 2)
  assert.equal(ctx.sessions.peek(agent.sessionId)?.config?.goal?.status, 'achieved')
  assert.equal(ctx.sessions.peek(agent.sessionId)?.config?.goal?.objective, '修好测试')
})

test('/goal pause does not start an agent turn', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  const agent = await ctx.agents.create()
  await ctx.sessions.patchConfig(agent.sessionId, {
    goal: { id: 'goal-x', objective: '修好测试', status: 'pursuing', turns: 0 },
  })
  const turn = await agent.send('/goal pause')
  assert.match(turn.text, /已暂停/)
  assert.equal(ctx.sessions.peek(agent.sessionId)?.config?.goal?.status, 'paused')
  assert.equal(
    (await ctx.sessions.require(agent.sessionId)).events.some((item) => item.type === 'turn/start'),
    false,
  )
})

test('controlGoal pause cancels the live turn so Goal cannot keep going', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  ctx.agents.configure({ provider: 'deepseek', apiKey: '', model: 'x' })
  ctx.tools.register({
    name: 'hang',
    description: 'hang',
    parameters: { type: 'object', properties: {} },
    execute: () => new Promise(() => undefined),
  })
  const originalCreate = ctx.agentLoop.create.bind(ctx.agentLoop)
  ctx.agentLoop.create = ((config, sessionId, signal) => {
    const runner = originalCreate(config, sessionId, signal)
    runner.run = async () => {
      await ctx.tools.invoke('hang', {}, signal)
      return { text: 'nope', steps: [] }
    }
    return runner
  }) as typeof ctx.agentLoop.create
  const agent = await ctx.agents.create()
  await ctx.sessions.patchConfig(agent.sessionId, {
    goal: { id: 'goal-x', objective: '修好测试', status: 'pursuing', turns: 0 },
  })
  void agent.send('go', { wait: false })
  for (let i = 0; i < 20 && !ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), true)
  const result = await ctx.agents.controlGoal(agent.sessionId, 'pause')
  assert.equal(result.goal?.status, 'paused')
  for (let i = 0; i < 50 && ctx.agents.isBusy(agent.sessionId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(ctx.agents.isBusy(agent.sessionId), false)
})
