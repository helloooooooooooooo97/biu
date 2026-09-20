// @vitest-environment node
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { availablePort, adoptPackedUserData, seedPluginSandboxes } from './runtime.ts'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test('desktop share service chooses another port when the preferred port is occupied', async () => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const selected = await availablePort(address.port)
    assert.notEqual(selected, address.port)
    assert.ok(selected > 0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

test('built-in plugin sources seed once without dependencies or overwriting user edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-plugin-seed-'))
  cleanup.push(dir)
  const source = join(dir, 'source')
  const target = join(dir, 'workspace', '.plugin-dev')
  await mkdir(join(source, 'demo', 'node_modules', 'dep'), { recursive: true })
  await writeFile(join(source, 'demo', 'manifest.json'), '{"id":"demo","name":"Demo"}')
  await writeFile(join(source, 'demo', 'web.tsx'), 'export const version = 1')
  await writeFile(join(source, 'demo', 'node_modules', 'dep', 'index.js'), 'large dependency')

  assert.deepEqual(seedPluginSandboxes(source, target), ['demo'])
  assert.equal(await readFile(join(target, 'demo', 'web.tsx'), 'utf8'), 'export const version = 1')
  await assert.rejects(readFile(join(target, 'demo', 'node_modules', 'dep', 'index.js')))

  await writeFile(join(target, 'demo', 'web.tsx'), 'user edit')
  assert.deepEqual(seedPluginSandboxes(source, target), [])
  assert.equal(await readFile(join(target, 'demo', 'web.tsx'), 'utf8'), 'user edit')
})

test('adoptPackedUserData inherits leftover pack-host data without overwriting userData', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-adopt-'))
  cleanup.push(dir)
  const pack = join(dir, 'pack')
  const home = join(dir, 'home')
  const workspace = join(home, 'workspace')
  await mkdir(join(pack, '.biu'), { recursive: true })
  await mkdir(join(home, '.biu'), { recursive: true })
  await mkdir(join(pack, '.plugin-dev', 'demo'), { recursive: true })
  await writeFile(join(pack, '.biu', 'sessions.sqlite'), 'old')
  await writeFile(join(pack, '.biu', 'keep.txt'), 'stale')
  await writeFile(join(home, '.biu', 'keep.txt'), 'keep')
  await writeFile(join(pack, '.plugin-dev', 'demo', 'manifest.json'), '{}')
  adoptPackedUserData(pack, home, workspace)
  assert.equal(await readFile(join(home, '.biu', 'sessions.sqlite'), 'utf8'), 'old')
  assert.equal(await readFile(join(home, '.biu', 'keep.txt'), 'utf8'), 'keep')
  assert.equal(await readFile(join(workspace, '.plugin-dev', 'demo', 'manifest.json'), 'utf8'), '{}')
  assert.equal(await readFile(join(pack, '.plugin-dev', 'demo', 'manifest.json'), 'utf8'), '{}')
})
