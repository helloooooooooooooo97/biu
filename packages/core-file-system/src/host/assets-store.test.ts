import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashedAssetRel } from '@biu/host-plugin-loader/data-dir'
import { FileSystemAssets, assetHref, collectAssetNames, isAssetFileName } from './assets-store.ts'

test('shared assets are content-addressed and reject path escape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-assets-'))
  const store = new FileSystemAssets(dir)
  const written = await store.write('shot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.match(written.name, /^[a-f0-9]{64}\.png$/)
  assert.equal(written.href, assetHref(written.name))
  assert.equal(written.etag, written.name)
  assert.equal((await readFile(join(dir, hashedAssetRel(written.name))))[0], 0x89)
  const read = await store.read(written.name)
  assert.equal(read.type, 'image/png')
  assert.equal(read.bytes[0], 0x89)
  await assert.rejects(() => store.write('../secret.png', 'nope'), /invalid asset/)
  assert.equal(isAssetFileName('ok-file_1.png'), true)
  assert.equal(isAssetFileName('../x'), false)
  const again = await store.write('shot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.equal(again.name, written.name)
  const changed = await store.write('shot.png', 'next')
  assert.notEqual(changed.name, written.name)
  assert.deepEqual([...collectAssetNames({ file: 'assets/画板-ab12.json' })], ['画板-ab12.json'])
})

test('new writes land in hashed shards and still read leftover files at the assets root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fs-assets-layer-'))
  await writeFile(join(root, 'old.png'), 'old')
  const store = new FileSystemAssets(root)
  const written = await store.write('shot.png', 'new')
  assert.match(written.name, /^[a-f0-9]{64}\.png$/)
  assert.equal(await readFile(join(root, hashedAssetRel(written.name)), 'utf8'), 'new')
  const legacy = await store.read('old.png')
  assert.equal(legacy.bytes.toString(), 'old')
})
