import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { Service } from 'cordis'
import type { SessionRecord } from '@biu/type-session'
import { applySnapshot, takeSnapshot } from './mirror.ts'

test('snapshot copies a newer session and skips an older one', async () => {
  const ctx = new Context()
  const saved: SessionRecord[] = []
  const rows = new Map<string, { id: string; updatedAt: number; title: string }>([
    ['old', { id: 'old', updatedAt: 50, title: 'keep' }],
  ])
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
  }
  await ctx.plugin(Store)
  await applySnapshot(ctx, {
    sessions: [
      {
        id: 'old',
        version: 1,
        updatedAt: 10,
        events: [],
        config: { title: 'stale' },
      },
      {
        id: 'new',
        version: 1,
        updatedAt: 20,
        events: [],
        config: { title: 'from-other' },
      },
    ],
    collections: [],
  })
  assert.deepEqual(saved.map((item) => item.id), ['new'])
  const snapshot = await takeSnapshot(ctx)
  assert.equal(snapshot.sessions.find((item) => item.id === 'new')?.config?.title, 'from-other')
  assert.equal(snapshot.sessions.find((item) => item.id === 'old')?.config?.title, 'keep')
})
