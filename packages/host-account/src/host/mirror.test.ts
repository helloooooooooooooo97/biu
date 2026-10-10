import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { Service } from 'cordis'
import type { SessionRecord } from '@biu/type-session'
import { applySnapshot, cloudCopyId, takeSnapshot } from './mirror.ts'

test('cache keeps local sessions and replaces cloud sessions', async () => {
  const ctx = new Context()
  const saved: SessionRecord[] = []
  const rows = new Map<string, { id: string; updatedAt: number; title: string }>([
    ['local', { id: 'local', updatedAt: 50, title: 'keep' }],
    ['cloud', { id: 'cloud', updatedAt: 10, title: 'old-cloud' }],
    ['gone', { id: 'gone', updatedAt: 10, title: 'deleted-on-cloud' }],
  ])
  const remote = new Set(['/sessions\tcloud', '/sessions\tgone'])
  class Places extends Service {
    constructor(ctx: Context) {
      super(ctx, 'account')
    }
    isRemote(collection: string, id: string) {
      return remote.has(`${collection}\t${id}`)
    }
    markRemote(collection: string, id: string) {
      remote.add(`${collection}\t${id}`)
    }
    clearPlace(collection: string, id: string) {
      remote.delete(`${collection}\t${id}`)
    }
    remoteIds(collection: string) {
      return [...remote].filter((key) => key.startsWith(`${collection}\t`)).map((key) => key.split('\t')[1]!)
    }
  }
  class Store extends Service {
    constructor(ctx: Context) {
      super(ctx, 'sessionStore')
    }
    listSummaries() {
      return Promise.resolve([...rows.values()])
    }
    load(id: string) {
      const row = rows.get(id)
      if (!row) return Promise.resolve(null)
      return Promise.resolve({
        id,
        version: 1,
        events: [{ type: 'session/open', version: 1, seq: 0, ts: row.updatedAt }],
        config: { title: row.title },
      } as SessionRecord)
    }
    save(record: SessionRecord & { updatedAt?: number }) {
      saved.push(record)
      rows.set(record.id, {
        id: record.id,
        updatedAt: Number(record.updatedAt) || 0,
        title: record.config?.title || record.id,
      })
      return Promise.resolve()
    }
    delete(id: string) {
      rows.delete(id)
      return Promise.resolve()
    }
  }
  await ctx.plugin(Places)
  await ctx.plugin(Store)
  await applySnapshot(ctx, {
    sessions: [
      { id: 'local', version: 1, updatedAt: 80, events: [], config: { title: 'should-not-win' } },
      { id: 'cloud', version: 1, updatedAt: 30, events: [], config: { title: 'from-cloud' } },
      { id: 'fresh', version: 1, updatedAt: 20, events: [], config: { title: 'new-cloud' } },
    ],
    collections: [],
  }, 'cache')
  assert.deepEqual(saved.map((item) => item.id), ['cloud', 'fresh'])
  assert.equal(rows.get('local')?.title, 'keep')
  assert.equal(rows.get('cloud')?.title, 'from-cloud')
  assert.equal(rows.has('gone'), false)
  const snapshot = await takeSnapshot(ctx)
  assert.equal(snapshot.sessions.find((item) => item.id === 'fresh')?.config?.title, 'new-cloud')
})

test('cloud copy ids are new and task ids keep the task prefix', () => {
  const page = cloudCopyId('/pages')
  const task = cloudCopyId('/tasks')
  assert.notEqual(page, task)
  assert.match(page, /^c[0-9a-f]+$/)
  assert.match(task, /^task_[0-9a-f]+$/)
})
