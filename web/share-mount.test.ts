import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'

test('share hrefs skip the full workstation boot', () => {
  assert.equal(Boolean(parseSharePath('/share/abc')), true)
  assert.equal(Boolean(parseSharePath('/share/abc/r/1')), true)
  assert.equal(parseSharePath('/database/pages'), null)
  assert.equal(parseSharePath('/'), null)
})

test('share mount loads page plugins without booting the workstation', () => {
  const mount = readFileSync(resolve(import.meta.dirname, './share-mount.tsx'), 'utf8')
  assert.match(mount, /PageEditor/)
  assert.match(mount, /bootShareRuntime/)
  assert.match(mount, /loadSharePagePlugins/)
  const plugins = readFileSync(resolve(import.meta.dirname, './share-plugins.ts'), 'utf8')
  assert.match(plugins, /pageEditor/)
  assert.match(plugins, /\/api\/share\/\$\{encodeURIComponent\(token\)\}\/plugin\//)
  const page = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/share-page.tsx'), 'utf8')
  assert.match(page, /loadPlugins/)
  assert.match(page, /CrumbTrail/)
  assert.match(page, /PageBanner/)
  assert.match(page, /ShareViewQueryBar/)
  assert.match(page, /loadShareQuery/)
  assert.doesNotMatch(page, /clipboard\.writeText/)
  const payload = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/host/share-payload.ts'), 'utf8')
  assert.match(payload, /pluginIds: resources\.pluginIds/)
  assert.doesNotMatch(payload, /share\.sharePlugins \? resources\.pluginIds/)
  const popover = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/share-popover.tsx'), 'utf8')
  assert.match(popover, /mintSharePin/)
  assert.match(popover, /sharePlugins/)
  const detail = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/record-detail.tsx'), 'utf8')
  assert.match(detail, /writable=\{Boolean\(spec\.writable\) && !readOnly\}/)
})
