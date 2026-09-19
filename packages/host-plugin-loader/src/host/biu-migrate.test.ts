import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CREATE_CORE_SQL, LATEST_BIU_SCHEMA, tableColumnNames, tableNames } from './biu-schema.ts'
import { migrateBiu, openAndMigrateBiu } from './biu-migrate.ts'
import { getSchemaVersion, openSqlite, setSchemaVersion } from './sqlite-open.ts'
import { readEditorContent, writeEditorContent } from './editor-content.ts'
import { liveAssetNames } from './gc-assets.ts'

test('empty database fast path matches upgraded v1 fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-mig-'))
  const fast = openAndMigrateBiu(join(dir, 'fast.sqlite'))
  const staged = openSqlite(join(dir, 'staged.sqlite'))
  staged.exec(CREATE_CORE_SQL)
  staged.exec(`INSERT INTO pages (id, title, notes, parent_id, depends_on_json, emoji, created_at, updated_at)
    VALUES ('p1', 'Home', '![x](/api/db/file/keep.png)', null, '[]', '', 1, 1)`)
  staged.exec(`INSERT INTO tasks (id, title, created_at, updated_at, description)
    VALUES ('t1', 'Do', 1, 1, '![y](/api/db/file/task.png)')`)
  setSchemaVersion(staged, 1)
  migrateBiu(staged)
  assert.equal(getSchemaVersion(fast), LATEST_BIU_SCHEMA)
  assert.equal(getSchemaVersion(staged), LATEST_BIU_SCHEMA)
  const names = (db: typeof fast) => tableNames(db).filter((name) => name !== 'sqlite_sequence').sort()
  assert.deepEqual(names(fast), names(staged))
  assert.deepEqual(tableColumnNames(fast, 'pages').sort(), tableColumnNames(staged, 'pages').sort())
  assert.equal(tableColumnNames(fast, 'pages').includes('notes'), false)
  assert.equal(tableColumnNames(fast, 'tasks').includes('description'), false)
  assert.equal(tableColumnNames(fast, 'facets').includes('notes'), false)
  assert.equal(tableColumnNames(fast, 'page_block_index').includes('collection'), true)
  assert.equal(tableColumnNames(fast, 'gc_candidates').includes('name'), true)
  assert.deepEqual(tableColumnNames(fast, 'page_block_index').sort(), tableColumnNames(staged, 'page_block_index').sort())
  assert.match(readEditorContent(staged, '/pages', 'p1'), /keep\.png/)
  assert.match(readEditorContent(staged, '/tasks', 't1'), /task\.png/)
  const live = liveAssetNames(staged)
  assert.equal(live.has('keep.png'), true)
  assert.equal(live.has('task.png'), true)
  fast.close()
  staged.close()
})

test('newer schema version refuses to start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-new-'))
  const db = openSqlite(join(dir, 'biu.sqlite'))
  db.exec('CREATE TABLE x (id TEXT)')
  setSchemaVersion(db, LATEST_BIU_SCHEMA + 5)
  assert.throws(() => migrateBiu(db), /比代码/)
  db.close()
})

test('skill markdown bodies are copied into editor_content', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-skill-mig-'))
  const dataDir = join(root, '.biu')
  mkdirSync(join(dataDir, 'skill'), { recursive: true })
  writeFileSync(
    join(dataDir, 'skill', 'demo.md'),
    '---\nname: Demo\n---\n\n![s](/api/db/file/skill.png)\n',
  )
  const db = openSqlite(join(dataDir, 'biu.sqlite'))
  db.exec(CREATE_CORE_SQL)
  setSchemaVersion(db, 1)
  migrateBiu(db, { dataDir, workspace: root, sqlitePath: join(dataDir, 'biu.sqlite') })
  assert.match(readEditorContent(db, '/skills', 'demo'), /skill\.png/)
  assert.equal(liveAssetNames(db, { dataDir, workspace: root }).has('skill.png'), true)
  db.close()
})

test('content_refs keep markdown links and drop prose mentions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-refs-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  writeEditorContent(
    db,
    '/plugins',
    'page-excalidraw',
    '落在 .biu/assets/page，页面正文；assets/画板-edd9.json 只是提及。\n![ok](/api/db/file/keep.png)\n',
  )
  const names = (
    db.prepare('SELECT name FROM content_refs WHERE collection = ?').all('/plugins') as Array<{ name: string }>
  ).map((row) => row.name)
  assert.deepEqual(names.sort(), ['keep.png'])
  assert.equal(liveAssetNames(db).has('keep.png'), true)
  assert.equal(liveAssetNames(db).has('page'), false)
  db.close()
})
