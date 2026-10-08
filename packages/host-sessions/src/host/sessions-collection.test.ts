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
  assert.deepEqual(actionIds, ['inspect', 'query', 'progress', 'compact', 'clear', 'retrieve', 'status'])
  assert.equal(spec.actions?.find((item) => item.id === 'progress')?.for, 'agent')
  assert.deepEqual(spec.actions?.find((item) => item.id === 'progress')?.placement, [])
  assert.equal(spec.actions?.find((item) => item.id === 'compact')?.for, 'agent')
  assert.equal(spec.actions?.find((item) => item.id === 'inspect')?.for, 'agent')
})

test('query reads one session timeline', async () => {
  const spec = sessionsCollection({
    listSummaries: async () => [],
    rename: async () => undefined,
    patchConfig: async () => undefined,
    delete: async () => true,
    require: async (id) => ({
      id,
      events: [
        { type: 'user/message', text: '查一下页面', seq: 1, ts: 1, kind: 'user' },
        { type: 'tool/call', id: 't1', name: 'db_list', arguments: '{"path":"/pages"}', seq: 2, ts: 2 },
        { type: 'tool/result', id: 't1', name: 'db_list', ok: true, detail: 'pages ok', seq: 3, ts: 3 },
      ],
    }),
  })
  const query = spec.actions?.find((item) => item.id === 'query')
  const found = await query?.run('s1', { id: 's1' }, { query: 'db_list' })
  assert.equal(found.hits, 2)
  assert.equal(found.results[0]?.type, 'tool/call')
  const typed = await query?.run('s1', { id: 's1' }, { type: 'user/message' })
  assert.equal(typed.hits, 1)
  assert.match(String(typed.results[0]?.summary), /查一下页面/)
})

