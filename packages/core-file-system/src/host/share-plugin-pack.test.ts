import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSharePluginWebJs } from './share-plugin-pack.ts'

test('readSharePluginWebJs prefers packed web.js without requiring the plugin to be running', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'share-web-'))
  mkdirSync(join(cwd, '.plugin', 'page-html-blocks'), { recursive: true })
  writeFileSync(join(cwd, '.plugin', 'page-html-blocks', 'web.js'), 'export const name = "page-html-blocks"\n')
  assert.match(readSharePluginWebJs(cwd, 'page-html-blocks') ?? '', /page-html-blocks/)
  assert.equal(readSharePluginWebJs(cwd, 'missing-plugin'), null)
})
