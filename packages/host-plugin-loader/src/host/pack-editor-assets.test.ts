import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashedAssetName, hashedAssetRel } from './asset-cas.ts'
import { copyReferencedEditorAssets } from './pack-editor-assets.ts'

test('copyReferencedEditorAssets copies hash and name trees then rewrites urls', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-assets-'))
  const assets = join(root, 'assets')
  const dest = join(root, 'pack')
  mkdirSync(dest, { recursive: true })
  const hashed = hashedAssetName(Buffer.from('pic'), 'a.png')
  mkdirSync(join(assets, 'hash', hashedAssetRel(hashed), '..'), { recursive: true })
  writeFileSync(join(assets, 'hash', hashedAssetRel(hashed)), 'pic')
  mkdirSync(join(assets, 'name'), { recursive: true })
  writeFileSync(join(assets, 'name', 'board.json'), '{}')
  const body = `![x](/api/db/file/${hashed})\n<img src="/api/db/file/board.json">`
  const next = copyReferencedEditorAssets({ body, assetsDir: assets, destDir: dest })
  assert.match(next, new RegExp(`assets/${hashed}`))
  assert.match(next, /assets\/board\.json/)
  assert.doesNotMatch(next, /\/api\/db\/file/)
  assert.equal(readFileSync(join(dest, 'assets', hashed), 'utf8'), 'pic')
  assert.equal(readFileSync(join(dest, 'assets', 'board.json'), 'utf8'), '{}')
})

test('copyReferencedEditorAssets throws when a referenced file is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-miss-'))
  const dest = join(root, 'pack')
  mkdirSync(dest, { recursive: true })
  assert.throws(
    () =>
      copyReferencedEditorAssets({
        body: '![x](/api/db/file/nope.png)',
        assetsDir: join(root, 'assets'),
        destDir: dest,
      }),
    /pack missing asset/,
  )
})
