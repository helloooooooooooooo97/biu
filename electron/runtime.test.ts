// @vitest-environment node
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { availablePort, seedPluginSandboxes } from './runtime.ts'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test('desktop host chooses another port when the preferred port is occupied', async () => {
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
