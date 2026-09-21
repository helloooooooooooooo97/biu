import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { findRepoRoot, readCordisConfig } from '@biu/host-plugin-loader'
import { kernelCatalogRows } from './kernel-rows.ts'
import { resolveCatalog } from './resolve-catalog.ts'

test('kernel rows cover host and web tables without overlapping catalog forks', async () => {
  const root = findRepoRoot()
  const raw = JSON.parse(await readFile(join(root, 'cordis.plugins.json'), 'utf8')) as {
    host: Array<{ id: string }>
    web: Array<{ id: string }>
    plugins: Array<{ id: string }>
  }
  const config = readCordisConfig(root)
  const hostRows = kernelCatalogRows(config.host ?? [], 'host')
  const webRows = kernelCatalogRows(config.web ?? [], 'web')
  const catalog = await resolveCatalog()

  assert.equal(hostRows.length, raw.host.length)
  assert.equal(webRows.length, raw.web.length)
  assert.ok(hostRows.every((row) => row.layer === 'host' && row.togglable === false && row.enabled === true))
  assert.ok(webRows.every((row) => row.layer === 'web' && row.togglable === false && row.enabled === true))
  assert.ok(hostRows.some((row) => row.id === 'mcp' && row.web === '@biu/host-mcp/web'))
  assert.ok(webRows.some((row) => row.id === 'shell'))
  assert.equal(catalog.length, raw.plugins.length)
  const cores = catalog.filter((row) => row.id.startsWith('core-'))
  const caps = catalog.filter((row) => !row.id.startsWith('core-'))
  assert.ok(cores.length > 0)
  assert.ok(cores.every((row) => row.layer === 'core' && row.togglable === false))
  assert.ok(caps.every((row) => row.layer === 'capability'))
})
