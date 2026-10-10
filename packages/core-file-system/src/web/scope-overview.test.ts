import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'

test('user data home shows collection scope counts and recent records', () => {
  const source = readFileSync(resolve(import.meta.dirname, './scope-overview.tsx'), 'utf8')
  assert.match(source, /filters: \{ \$scope: scope \}/)
  assert.match(source, /sortField: 'updatedAt'/)
  assert.match(source, /最近使用/)
  assert.match(source, /builtinAllViewId\(table\.path\)/)
  assert.doesNotMatch(source, /builtinScopeViewId/)
  assert.match(source, /私人数据/)
  assert.match(source, /空间数据/)
  assert.match(source, /共享数据/)
  assert.doesNotMatch(source, /grid-cols-1 gap-3 sm:grid-cols-3/)
})

test('database root opens one user-data overview', () => {
  const source = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(source, /get\('home'\) === 'user'/)
  assert.match(source, /scopeHome=\{scopeHome\}/)
  assert.match(source, /\$\{DATA_MODULE_PATH\}\?home=user/)
})
