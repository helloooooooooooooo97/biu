import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR_NAME, LEGACY_DATA_DIR_NAME, LEGACY_PAGE_ROOT, PAGE_ASSETS, PAGE_DB, PAGE_ROOT, adoptPackedUserData, dataDir, dataHome, dataPath, migrateDataDir, migrateLegacyPageDir } from './data-dir.ts'

test('migrateDataDir renames .cordis to .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-dir-'))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME))
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'sessions.sqlite'), 'old')
  const dest = migrateDataDir(root)
  assert.equal(dest, join(root, DATA_DIR_NAME))
  assert.equal(existsSync(join(root, LEGACY_DATA_DIR_NAME)), false)
  assert.equal(readFileSync(join(dest, 'sessions.sqlite'), 'utf8'), 'old')
})

test('migrateDataDir merges leftover .cordis into existing .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-merge-'))
  mkdirSync(join(root, DATA_DIR_NAME))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME, 'assets'), { recursive: true })
  writeFileSync(join(root, DATA_DIR_NAME, 'keep.txt'), 'keep')
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'assets', 'pic.png'), 'img')
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'keep.txt'), 'stale')
  migrateDataDir(root)
  assert.equal(readFileSync(join(root, DATA_DIR_NAME, 'keep.txt'), 'utf8'), 'keep')
  assert.equal(readFileSync(join(root, DATA_DIR_NAME, 'assets', 'pic.png'), 'utf8'), 'img')
  assert.equal(existsSync(join(root, LEGACY_DATA_DIR_NAME)), false)
})

test('dataPath uses .biu after migrate', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-path-'))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME))
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'chat-config.json'), '{}')
  assert.equal(dataDir(root), join(root, DATA_DIR_NAME))
  assert.equal(dataPath(root, 'chat-config.json'), join(root, DATA_DIR_NAME, 'chat-config.json'))
})

test('migrateDataDir moves leftover .page into .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-page-'))
  mkdirSync(join(root, LEGACY_PAGE_ROOT, 'assets'), { recursive: true })
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'home.md'), 'hello')
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'pages.sqlite'), 'db')
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'assets', 'board.json'), '{}')
  migrateDataDir(root)
  assert.equal(readFileSync(join(root, PAGE_ROOT, 'home.md'), 'utf8'), 'hello')
  assert.equal(readFileSync(join(root, PAGE_DB), 'utf8'), 'db')
  assert.equal(readFileSync(join(root, PAGE_ASSETS, 'board.json'), 'utf8'), '{}')
  assert.equal(existsSync(join(root, LEGACY_PAGE_ROOT)), false)
})

test('migrateLegacyPageDir can move between workspace roots', () => {
  const from = mkdtempSync(join(tmpdir(), 'page-from-'))
  const to = mkdtempSync(join(tmpdir(), 'page-to-'))
  mkdirSync(join(from, LEGACY_PAGE_ROOT), { recursive: true })
  writeFileSync(join(from, LEGACY_PAGE_ROOT, 'p001.md'), 'body')
  migrateLegacyPageDir(from, to)
  assert.equal(readFileSync(join(to, PAGE_ROOT, 'p001.md'), 'utf8'), 'body')
  assert.equal(existsSync(join(from, LEGACY_PAGE_ROOT)), false)
})

test('dataHome prefers BIU_HOME over cwd', () => {
  const prev = process.env.BIU_HOME
  const home = mkdtempSync(join(tmpdir(), 'biu-home-'))
  process.env.BIU_HOME = home
  try {
    assert.equal(dataHome(), home)
    assert.equal(dataDir(), join(home, DATA_DIR_NAME))
  } finally {
    if (prev === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prev
  }
})

test('adoptPackedUserData moves pack-host leftovers into userData and keeps dest files', () => {
  const pack = mkdtempSync(join(tmpdir(), 'biu-pack-'))
  const home = mkdtempSync(join(tmpdir(), 'biu-ud-'))
  const workspace = join(home, 'workspace')
  mkdirSync(join(pack, DATA_DIR_NAME), { recursive: true })
  mkdirSync(join(home, DATA_DIR_NAME), { recursive: true })
  mkdirSync(join(pack, '.plugin-dev', 'demo'), { recursive: true })
  writeFileSync(join(pack, DATA_DIR_NAME, 'sessions.sqlite'), 'old-sessions')
  writeFileSync(join(pack, DATA_DIR_NAME, 'keep.txt'), 'stale')
  writeFileSync(join(home, DATA_DIR_NAME, 'keep.txt'), 'keep')
  writeFileSync(join(pack, '.plugin-dev', 'demo', 'manifest.json'), '{}')
  adoptPackedUserData(pack, home, workspace)
  assert.equal(readFileSync(join(home, DATA_DIR_NAME, 'sessions.sqlite'), 'utf8'), 'old-sessions')
  assert.equal(readFileSync(join(home, DATA_DIR_NAME, 'keep.txt'), 'utf8'), 'keep')
  assert.equal(readFileSync(join(workspace, '.plugin-dev', 'demo', 'manifest.json'), 'utf8'), '{}')
  assert.equal(existsSync(join(pack, '.plugin-dev', 'demo', 'manifest.json')), true)
  assert.equal(existsSync(join(pack, DATA_DIR_NAME)), false)
})
