/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { DATA_DIR_NAME, openAndMigrateBiu, readEditorContent, writeEditorContent } from '@biu/host-plugin-loader/data-dir'
import { PluginStoreService } from './index.ts'

function stubHub(ctx: Context) {
  ;(ctx as unknown as { hub: unknown }).hub = {
    adopt: async () => {},
    drop: async () => {},
    snapshot: () => ({ plugins: [] }),
  }
}

function storeFor(dir: string) {
  const ctx = new Context()
  stubHub(ctx)
  return new PluginStoreService(ctx, join(dir, '.plugin'), join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
}

function sqlitePath(dir: string) {
  return join(dir, DATA_DIR_NAME, 'biu.sqlite')
}

async function writeManifest(dir: string, id: string, readme: string) {
  mkdirSync(dir, { recursive: true })
  await writeFile(
    join(dir, 'manifest.json'),
    `${JSON.stringify({ id, name: id, blurb: 'x', tags: [], author: '', authorUrl: '' }, null, 2)}\n`,
  )
  await writeFile(join(dir, 'README.md'), readme)
}

function bodyInDb(dir: string, id: string) {
  const db = openAndMigrateBiu(sqlitePath(dir))
  try {
    return readEditorContent(db, '/plugins', id)
  } finally {
    db.close()
  }
}

test('empty table + disk README backfills editor_content on read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-fill-'))
  try {
    await writeManifest(join(dir, '.plugin-dev', 'demo'), 'demo', '# from disk\n')
    mkdirSync(join(dir, DATA_DIR_NAME), { recursive: true })
    const db = openAndMigrateBiu(sqlitePath(dir))
    db.close()
    const store = storeFor(dir)
    assert.equal(await store.readReadme('demo'), '# from disk\n')
    assert.equal(bodyInDb(dir, 'demo'), '# from disk\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('empty table prefers sandbox README over packed copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-sandbox-'))
  try {
    await writeManifest(join(dir, '.plugin-dev', 'demo'), 'demo', '# sandbox\n')
    await writeManifest(join(dir, '.plugin', 'demo'), 'demo', '# packed\n')
    mkdirSync(join(dir, DATA_DIR_NAME), { recursive: true })
    openAndMigrateBiu(sqlitePath(dir)).close()
    const store = storeFor(dir)
    assert.equal(await store.readReadme('demo'), '# sandbox\n')
    assert.equal(bodyInDb(dir, 'demo'), '# sandbox\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('empty table reads packed README when sandbox is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-packed-'))
  try {
    await writeManifest(join(dir, '.plugin', 'demo'), 'demo', '# packed only\n')
    mkdirSync(join(dir, DATA_DIR_NAME), { recursive: true })
    openAndMigrateBiu(sqlitePath(dir)).close()
    const store = storeFor(dir)
    assert.equal(await store.readReadme('demo'), '# packed only\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('non-empty table wins over different disk files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-table-'))
  try {
    await writeManifest(join(dir, '.plugin-dev', 'demo'), 'demo', '# disk\n')
    mkdirSync(join(dir, DATA_DIR_NAME), { recursive: true })
    const db = openAndMigrateBiu(sqlitePath(dir))
    writeEditorContent(db, '/plugins', 'demo', '# table\n')
    db.close()
    const store = storeFor(dir)
    assert.equal(await store.readReadme('demo'), '# table\n')
    assert.equal(await readFile(join(dir, '.plugin-dev', 'demo', 'README.md'), 'utf8'), '# disk\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeReadme updates db, sandbox, and packed copies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-write-both-'))
  try {
    await writeManifest(join(dir, '.plugin-dev', 'demo'), 'demo', '# old sandbox\n')
    await writeManifest(join(dir, '.plugin', 'demo'), 'demo', '# old packed\n')
    const store = storeFor(dir)
    await store.writeReadme('demo', '# next\n')
    assert.equal(bodyInDb(dir, 'demo'), '# next\n')
    assert.equal(await readFile(join(dir, '.plugin-dev', 'demo', 'README.md'), 'utf8'), '# next\n')
    assert.equal(await readFile(join(dir, '.plugin', 'demo', 'README.md'), 'utf8'), '# next\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeReadme without sandbox updates db and packed copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-write-packed-'))
  try {
    await writeManifest(join(dir, '.plugin', 'demo'), 'demo', '# packed\n')
    const store = storeFor(dir)
    await store.writeReadme('demo', '# next packed\n')
    assert.equal(bodyInDb(dir, 'demo'), '# next packed\n')
    assert.equal(await readFile(join(dir, '.plugin', 'demo', 'README.md'), 'utf8'), '# next packed\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeReadme with no plugin dirs still writes the table', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-write-db-'))
  try {
    const store = storeFor(dir)
    await store.writeReadme('ghost', '# only db\n')
    assert.equal(bodyInDb(dir, 'ghost'), '# only db\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readReadme still returns disk text when sqlite path cannot be opened', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-readme-readonly-'))
  try {
    await writeManifest(join(dir, '.plugin-dev', 'demo'), 'demo', '# still readable\n')
    await mkdir(join(dir, DATA_DIR_NAME, 'biu.sqlite'), { recursive: true })
    const store = storeFor(dir)
    assert.equal(await store.readReadme('demo'), '# still readable\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
