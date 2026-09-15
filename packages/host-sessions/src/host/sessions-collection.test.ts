import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionsCollection } from './sessions-collection.ts'

test('sessionsCollection maps summaries and writes title/pinned/tags', async () => {
  const calls: unknown[] = []
  const spec = sessionsCollection({
    listSummaries: async () => [
      {
        id: 's1',
        version: 1,
        eventCount: 3,
        title: 'hello',
        updatedAt: 100,
        mascot: { shape: 'pebble', color: 'orange', eye: 1 },
        config: { pinned: false, tags: ['a'] },
      },
    ],
    rename: async (id, title) => {
      calls.push(['rename', id, title])
    },
    patchConfig: async (id, patch) => {
      calls.push(['patch', id, patch])
    },
    setProject: async (id, project) => {
      calls.push(['project', id, project])
    },
    delete: async (id) => {
      calls.push(['delete', id])
      return true
    },
    require: async (id) => ({
      id,
      events: [{ type: 'user/message', text: 'hi', seq: 0, ts: 1, kind: 'user' }],
    }),
  })
  assert.equal(spec.schema.contentField, 'events')
  assert.equal(spec.schema.fields.events?.type, 'file')
  assert.equal(spec.view?.moduleId, 'sessions-db')
  assert.deepEqual(spec.records, { update: true, create: false, delete: true })
  const rows = await spec.list()
  assert.equal(rows[0]?.id, 's1')
  assert.equal(rows[0]?.title, 'hello')
  assert.deepEqual(rows[0]?.mascot, { shape: 'pebble', color: 'orange', eye: 1 })
  assert.equal(rows[0]?.mascotShape, 'pebble')
  assert.equal(rows[0]?.mascotColor, 'orange')
  assert.equal(rows[0]?.mascotEye, 1)
  assert.equal(rows[0]?.mascotName, '橙石美')
  assert.deepEqual(rows[0]?.tags, ['a'])
  assert.equal(rows[0]?.createdAt, 100)
  assert.equal(rows[0]?.events, undefined)
  const got = await spec.get?.('s1')
  assert.equal(Array.isArray(got?.events), true)
  await spec.update?.('s1', {
    title: 'renamed',
    pinned: true,
    tags: ['b', 'c'],
    model: 'deepseek-reasoner',
    projectPath: '/tmp/app',
  })
  await spec.remove?.({ ids: ['s1'] })
  assert.deepEqual(calls, [
    ['rename', 's1', 'renamed'],
    ['patch', 's1', { pinned: true, tags: ['b', 'c'], model: 'deepseek-reasoner' }],
    ['project', 's1', { path: '/tmp/app' }],
    ['delete', 's1'],
  ])
  const actionIds = (spec.actions ?? []).map((item) => item.id)
  assert.deepEqual(actionIds, ['inspect', 'progress', 'compact', 'clear', 'retrieve', 'status'])
  assert.equal(spec.actions?.find((item) => item.id === 'progress')?.for, 'agent')
  assert.deepEqual(spec.actions?.find((item) => item.id === 'progress')?.placement, [])
  assert.equal(spec.actions?.find((item) => item.id === 'compact')?.for, 'agent')
  assert.equal(spec.actions?.find((item) => item.id === 'inspect')?.for, 'agent')
})

