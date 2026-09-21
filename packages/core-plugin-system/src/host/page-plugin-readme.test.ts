import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const sandbox = join(root, '.plugin-dev')

test('every page plugin README includes a pageBlock example', () => {
  const ids = readdirSync(sandbox).filter((id) => {
    if (!id.startsWith('page-')) return false
    try {
      return statSync(join(sandbox, id)).isDirectory()
    } catch {
      return false
    }
  })
  assert.ok(ids.length >= 3, `expected page-* plugins, got ${ids.join(',')}`)
  for (const id of ids) {
    const readme = readFileSync(join(sandbox, id, 'README.md'), 'utf8')
    assert.match(readme, /## 示例写法/, `${id} README needs 示例写法`)
    assert.match(readme, /:::pageBlock \{kind=\S+ plugin=/, `${id} README needs a fence with kind and plugin`)
    assert.match(readme, new RegExp(`plugin=${id}`), `${id} README must name its plugin id`)
  }
})

test('development page blocks register under the 测试 slash group', () => {
  const files = [
    'api-playground/web.tsx',
    'option-matrix/web.tsx',
    'page-regression/web.tsx',
    'plugin-doctor/web.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /blockType:\s*'test'/, `${file} should use blockType test`)
    assert.match(src, /blockTypeLabel:\s*'测试'/, `${file} should use blockTypeLabel 测试`)
    assert.doesNotMatch(src, /blockType:\s*'(basic|api|dev)'/, `${file} should not use a separate slash group`)
  }
})
