import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, utimesSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAndMigrateBiu } from './biu-migrate.ts'
import { ASSET_GC_CANDIDATE_MS, ASSET_GC_GRACE_MS, gcCasAssets, liveAssetNames, previewGcCasAssets } from './gc-assets.ts'
import { writeEditorContent } from './editor-content.ts'

test('orphan files wait out the candidate window even after grace', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gc-g12-'))
  const assetsDir = join(root, 'assets')
  const nameDir = join(assetsDir, 'name')
  mkdirSync(nameDir, { recursive: true })
  mkdirSync(join(assetsDir, 'hash'), { recursive: true })
  writeFileSync(join(nameDir, 'orphan.json'), '{}')
  const stale = Date.now() / 1000 - 2 * 24 * 60 * 60
  utimesSync(join(nameDir, 'orphan.json'), stale, stale)
  const db = openAndMigrateBiu(join(root, 'biu.sqlite'))
  const now = Date.now()
  await gcCasAssets({ db, assetsDir, now, fuseMin: 99 })
  assert.equal(existsSync(join(nameDir, 'orphan.json')), true)
  const first = (
    db.prepare('SELECT first_seen FROM gc_candidates WHERE name = ?').get('orphan.json') as { first_seen: number }
  ).first_seen
  await gcCasAssets({ db, assetsDir, now: first + ASSET_GC_CANDIDATE_MS - 1000, fuseMin: 99 })
  assert.equal(existsSync(join(nameDir, 'orphan.json')), true)
  await gcCasAssets({ db, assetsDir, now: first + ASSET_GC_CANDIDATE_MS + 1, fuseMin: 99 })
  assert.equal(existsSync(join(nameDir, 'orphan.json')), false)
  db.close()
})

test('html fence images stay live from editor body without htmlFieldAssets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gc-g10-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  writeEditorContent(
    db,
    '/pages',
    'p1',
    `:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34}
<img src="/api/db/file/hero.png">
:::
`,
  )
  assert.equal(liveAssetNames(db).has('hero.png'), true)
  db.close()
})

test('preview does not delete orphans', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gc-preview-'))
  const assetsDir = join(root, 'assets')
  const nameDir = join(assetsDir, 'name')
  mkdirSync(nameDir, { recursive: true })
  mkdirSync(join(assetsDir, 'hash'), { recursive: true })
  writeFileSync(join(nameDir, 'orphan.json'), '{}')
  const stale = Date.now() / 1000 - 2 * 24 * 60 * 60
  utimesSync(join(nameDir, 'orphan.json'), stale, stale)
  const db = openAndMigrateBiu(join(root, 'biu.sqlite'))
  const now = Date.now()
  await gcCasAssets({ db, assetsDir, now, fuseMin: 99 })
  const preview = previewGcCasAssets({ db, assetsDir, now: now + ASSET_GC_CANDIDATE_MS + 1, fuseMin: 99 })
  assert.equal(preview.doomed.includes('orphan.json'), true)
  assert.equal(existsSync(join(nameDir, 'orphan.json')), true)
  db.close()
})
