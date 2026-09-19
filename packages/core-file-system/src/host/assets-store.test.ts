import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSystemAssets, AssetConflictError, assetHref, collectAssetNames, isAssetFileName } from './assets-store.ts'

test('shared assets live under a single directory and reject path escape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-assets-'))
  const store = new FileSystemAssets(dir)
  const written = await store.write('shot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.equal(written.name, 'shot.png')
  assert.equal(written.href, assetHref('shot.png'))
  const read = await store.read('shot.png')
  assert.equal(read.type, 'image/png')
  assert.equal(read.bytes[0], 0x89)
  await assert.rejects(() => store.write('../secret.png', 'nope'), /invalid asset/)
  assert.equal(isAssetFileName('ok-file_1.png'), true)
  assert.equal(isAssetFileName('../x'), false)
  await assert.rejects(() => store.write('shot.png', 'next'), (error) => {
    assert.equal(error instanceof AssetConflictError, true)
    return true
  })
  const again = await store.write('shot.png', 'next', { etag: written.etag })
  assert.equal(again.etag.length, 16)
  assert.deepEqual([...collectAssetNames({ file: 'assets/画板-ab12.json' })], ['画板-ab12.json'])
})

test('new writes land in assets/db and still read leftover files at the assets root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fs-assets-layer-'))
  const shared = join(root, '.biu/assets')
  const layered = join(shared, 'db')
  await mkdir(shared, { recursive: true })
  await writeFile(join(shared, 'old.png'), 'old')
  const store = new FileSystemAssets(layered)
  const written = await store.write('shot.png', 'new')
  assert.equal(written.name, 'shot.png')
  assert.equal(await readFile(join(layered, 'shot.png'), 'utf8'), 'new')
  const legacy = await store.read('old.png')
  assert.equal(legacy.bytes.toString(), 'old')
})
