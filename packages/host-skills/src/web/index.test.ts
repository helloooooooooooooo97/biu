import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')

test('Skills repository view exposes runtime rescan beside directory import', () => {
  assert.match(source, /function SkillsLibraryView/)
  assert.match(source, /导入 Skill 目录/)
  assert.match(source, /扫描本地/)
  assert.match(source, /\/api\/skills\/import/)
  assert.match(source, /\/api\/skills\/rescan/)
  assert.doesNotMatch(source, /Toolbar: SkillsToolbar/)
})
