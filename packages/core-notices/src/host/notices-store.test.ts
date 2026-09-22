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

test('notice content stays off the summary and survives a refresh of the same source', () => {
  const store = new NoticesStore().open(':memory:')
  const files = [{ name: 'cover.png', href: '/api/db/file/cover.png', image: true }]
  const row = store.push({
    kind: 'session',
    title: '有 1 个附件没人用了',
    body: '页面和记录都不再用到下面这些文件。',
    sourceKey: 'asset-gc:candidates',
    content: files,
  })
  assert.equal(row?.body, '页面和记录都不再用到下面这些文件。')
  assert.deepEqual(row?.content, files)
  const again = store.push({
    kind: 'session',
    title: '有 2 个附件没人用了',
    body: '页面和记录都不再用到下面这些文件。',
    sourceKey: 'asset-gc:candidates',
    content: [...files, { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false }],
  })
  assert.equal(again?.id, row?.id)
  assert.equal(Array.isArray(again?.content) && again.content.length, 2)
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
