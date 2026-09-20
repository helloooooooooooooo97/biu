import { test } from 'vitest'
import assert from 'node:assert/strict'
import { NoticesStore } from './notices-store.ts'

test('notices store dedupes unread source keys and marks read', () => {
  const store = new NoticesStore().open(':memory:')
  const first = store.push({ kind: 'task', title: '任务完成：A', sourceKey: 'task:a:done', href: '/database/tasks/record/a' })
  const again = store.push({ kind: 'task', title: '任务完成：A（改）', sourceKey: 'task:a:done' })
  assert.equal(first?.id, again?.id)
  assert.equal(store.list().length, 1)
  assert.equal(store.list()[0]?.title, '任务完成：A（改）')
  store.update(first!.id, { read: true })
  const next = store.push({ kind: 'task', title: '任务完成：A 再一次', sourceKey: 'task:a:done' })
  assert.notEqual(next?.id, first?.id)
  assert.equal(store.list().length, 2)
  assert.equal(store.markSourceRead('task:a:done'), 1)
  assert.equal(store.list().every((row) => row.read), true)
})

test('notices store clear drops every row', () => {
  const store = new NoticesStore().open(':memory:')
  store.push({ kind: 'task', title: 'A', sourceKey: 'task:a:done' })
  store.push({ kind: 'session', title: 'B', sourceKey: 'session:1' })
  assert.equal(store.clear(), 2)
  assert.equal(store.list().length, 0)
  assert.equal(store.clear(), 0)
})

test('notices service does not write on turn/end', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const src = readFileSync(resolve(import.meta.dirname, './notices-service.ts'), 'utf8')
  assert.doesNotMatch(src, /session\/event/)
  assert.doesNotMatch(src, /turn\/end/)
  assert.doesNotMatch(src, /回合结束/)
})
