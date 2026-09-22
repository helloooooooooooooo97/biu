import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import { sessionDisplayTitle } from '@biu/type-session'

test('session config title overrides derived title', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create(undefined, { title: '指挥台-A' })
  assert.equal(sessionDisplayTitle(record), '指挥台-A')
  await ctx.sessions.append(record.id, { type: 'user/message', text: 'hello world', kind: 'wake' })
  const summaries = await ctx.sessions.listSummaries()
  const hit = summaries.find((item) => item.id === record.id)
  assert.equal(hit?.title, '指挥台-A')
  await ctx.sessions.patchConfig(record.id, { model: 'deepseek-reasoner', agentMode: 'minimal' })
  const again = await ctx.sessions.require(record.id)
  assert.equal(again.config?.model, 'deepseek-reasoner')
  assert.equal(again.config?.agentMode, 'minimal')
  await ctx.sessions.patchConfig(record.id, { agentMode: 'file' })
  const filed = await ctx.sessions.require(record.id)
  assert.equal(filed.config?.agentMode, 'file')
  assert.equal(again.config?.title, '指挥台-A')
})

test('session config stores tags and pin', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  await ctx.sessions.patchConfig(record.id, { tags: ['host-ui', 'bug'], pinned: true })
  const again = await ctx.sessions.require(record.id)
  assert.deepEqual(again.config?.tags, ['host-ui', 'bug'])
  assert.equal(again.config?.pinned, true)
  const listed = await ctx.sessions.listSummaries()
  assert.deepEqual(listed.find((item) => item.id === record.id)?.config?.tags, ['host-ui', 'bug'])
  await ctx.sessions.patchConfig(record.id, { pinned: false, tags: [] })
  const cleared = await ctx.sessions.require(record.id)
  assert.equal(cleared.config?.pinned, undefined)
  assert.equal(cleared.config?.tags, undefined)
})

test('session config stores inspector bind', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  await ctx.sessions.patchConfig(record.id, {
    inspector: {
      tab: 'database:/pages',
      opened: ['database:/pages'],
      dbPaths: { 'database:/pages': '/database/pages' },
    },
  })
  const again = await ctx.sessions.require(record.id)
  assert.equal(again.config?.inspector?.tab, 'database:/pages')
  assert.deepEqual(again.config?.inspector?.opened, ['database:/pages'])
  assert.equal(again.config?.inspector?.dbPaths?.['database:/pages'], '/database/pages')
  assert.deepEqual(Object.keys(again.config?.inspector ?? {}).sort(), ['dbPaths', 'opened', 'tab'])
  const listed = await ctx.sessions.listSummaries()
  assert.deepEqual(listed.find((item) => item.id === record.id)?.config?.inspector?.opened, ['database:/pages'])
  await ctx.sessions.patchConfig(record.id, { inspector: null })
  const cleared = await ctx.sessions.require(record.id)
  assert.equal(cleared.config?.inspector, undefined)
})

test('session config stores the auto compact token cap', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  await ctx.sessions.patchConfig(record.id, { autoCompactInputTokens: 80000.8 })
  assert.equal((await ctx.sessions.require(record.id)).config?.autoCompactInputTokens, 80000)
  await ctx.sessions.patchConfig(record.id, { autoCompactInputTokens: 0 })
  assert.equal((await ctx.sessions.require(record.id)).config?.autoCompactInputTokens, undefined)
})
