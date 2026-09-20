import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAndMigrateBiu } from './biu-migrate.ts'
import { readEditorContent, rebuildContentRefs, replaceContentRefs, writeEditorContent } from './editor-content.ts'
import { assetNamesFromHtml, assetNamesFromMarkdown } from '../../../type-file-system/src/asset-ref.ts'

test('writeEditorContent rewrites content refs without dropping banner refs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-g9-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  db.prepare(
    `INSERT INTO record_banners (collection, record_id, kind, html) VALUES (?, ?, ?, ?)`,
  ).run('/pages', 'p1', 'html', '<img src="/api/db/file/cover.png">')
  writeEditorContent(db, '/pages', 'p1', '![a](/api/db/file/keep.png)\n')
  writeEditorContent(db, '/pages', 'p1', '![b](/api/db/file/next.png)\n')
  const rows = db
    .prepare('SELECT name, source FROM content_refs WHERE collection = ? AND record_id = ?')
    .all('/pages', 'p1') as Array<{ name: string; source: string }>
  assert.deepEqual(
    rows.map((row) => `${row.source}:${row.name}`).sort(),
    ['banner:cover.png', 'content:next.png'],
  )
  db.close()
})

test('replaceContentRefs after writeEditorContent keeps both sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-g9b-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  writeEditorContent(db, '/pages', 'p1', '![a](/api/db/file/editor.png)\n')
  const body = readEditorContent(db, '/pages', 'p1')
  replaceContentRefs(
    db,
    '/pages',
    'p1',
    assetNamesFromMarkdown(body),
    assetNamesFromHtml('<img src="/api/db/file/cover.png">'),
  )
  const rows = db
    .prepare('SELECT name, source FROM content_refs WHERE collection = ? AND record_id = ?')
    .all('/pages', 'p1') as Array<{ name: string; source: string }>
  assert.deepEqual(
    rows.map((row) => `${row.source}:${row.name}`).sort(),
    ['banner:cover.png', 'content:editor.png'],
  )
  db.close()
})

test('rebuildContentRefs keeps markdown links and drops loose ghosts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-n2-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  writeEditorContent(
    db,
    '/pages',
    'p000',
    'see .biu/assets/page 和 assets/画板-edd9.json 提及。\n![ok](/api/db/file/keep.png)\n[board](/api/db/file/画板-edd9.json)\n',
  )
  db.prepare(
    `INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)`,
  ).run('/plugins', 'page-excalidraw', 'page', 'content')
  db.prepare(
    `INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)`,
  ).run('/plugins', 'page-excalidraw', '画板-', 'content')
  rebuildContentRefs(db)
  const rows = db.prepare('SELECT collection, record_id, name FROM content_refs').all() as Array<{
    collection: string
    record_id: string
    name: string
  }>
  assert.deepEqual(
    rows.map((row) => `${row.collection} ${row.record_id} ${row.name}`).sort(),
    ['/pages p000 keep.png', '/pages p000 画板-edd9.json'],
  )
  db.close()
})
