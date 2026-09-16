import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')

test('skills does not register its own collection view', () => {
  assert.doesNotMatch(source, /registerView/)
  assert.doesNotMatch(source, /SkillsLibraryView/)
})

test('skills only keeps the shared content renderer', () => {
  assert.match(source, /export function SkillsContent/)
})

test('fileList is rendered by a skill-owned cell, not the attachment preview', () => {
  assert.match(source, /fileList: SkillFilesCell/)
  assert.match(source, /ui\.decorate\('\/skills', skillsChrome\)/)
  // 技能文件没有对外 URL，不能走附件预览组件（href 非法会整条丢掉）。
  assert.doesNotMatch(source, /<FilePreview/)
})
