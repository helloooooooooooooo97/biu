import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashedAssetRel } from '@biu/host-plugin-loader/data-dir'
import { FileSystemAssets, AssetConflictError, assetHref, collectAssetNames, isAssetFileName } from './assets-store.ts'

test('shared assets are content-addressed and reject path escape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-assets-'))
  const store = new FileSystemAssets(dir)
  const written = await store.write('shot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.match(written.name, /^[a-f0-9]{64}\.png$/)
  assert.equal(written.href, assetHref(written.name))
  assert.equal(written.etag, written.name)
  assert.equal((await readFile(join(dir, 'cas', hashedAssetRel(written.name))))[0], 0x89)
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
  await assert.rejects(() => store.read('old.png'), /not found/)
})

test('documents overwrite in place and require etag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-docs-'))
  const store = new FileSystemAssets(dir)
  const first = await store.writeDoc('画板-ab.json', '{"a":1}')
  assert.equal(first.name, '画板-ab.json')
  assert.equal(first.href, assetHref('画板-ab.json'))
  assert.equal(await readFile(join(dir, 'doc', '画板-ab.json'), 'utf8'), '{"a":1}')
  await assert.rejects(() => store.writeDoc('画板-ab.json', '{"a":2}'), (error) => error instanceof AssetConflictError)
  const next = await store.writeDoc('画板-ab.json', '{"a":2}', { etag: first.etag })
  assert.notEqual(next.etag, first.etag)
  assert.equal(await readFile(join(dir, 'doc', '画板-ab.json'), 'utf8'), '{"a":2}')
})
