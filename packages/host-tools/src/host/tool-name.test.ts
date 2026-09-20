import { test } from 'vitest'
import assert from 'node:assert/strict'
import { toolNameForApi } from './tool-name.ts'

test('latin tool names stay unchanged', () => {
  assert.equal(toolNameForApi('db_list'), 'db_list')
  assert.equal(toolNameForApi('str_replace_editor'), 'str_replace_editor')
})

test('Chinese names become underscore pinyin', () => {
  assert.equal(toolNameForApi('查天气'), 'cha_tian_qi')
  assert.equal(toolNameForApi('天气 v2'), 'tian_qi_v2')
})
