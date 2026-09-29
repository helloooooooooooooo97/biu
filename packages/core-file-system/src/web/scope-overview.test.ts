import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'

test('scope home shows collection totals and recent records', () => {
  const source = readFileSync(resolve(import.meta.dirname, './scope-overview.tsx'), 'utf8')
  assert.match(source, /filters: \{ \$scope: scope \}/)
  assert.match(source, /sortField: 'updatedAt'/)
  assert.match(source, /最近使用/)
  assert.match(source, /builtinScopeViewId\(scope, builtinAllViewId\(table\.path\)\)/)
})

test('database root keeps explicit personal and workspace overview routes', () => {
  const source = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(source, /scope === 'personal' \|\| scope === 'workspace'/)
  assert.match(source, /scopeHome=\{scopeHome\}/)
  assert.match(source, /`\$\{DATA_MODULE_PATH\}\?scope=\$\{scope\}`/)
})
