import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TOOL_API_NAME, stripToolApiName, toolNameForApi } from './tool-name.ts'

test('latin tool names stay unchanged', () => {
  assert.equal(toolNameForApi('db_list'), 'db_list')
  assert.equal(toolNameForApi('str_replace_editor'), 'str_replace_editor')
  assert.equal(TOOL_API_NAME.test('db_list'), true)
})

test('illegal characters are stripped; empty remainder becomes tool_ plus id', () => {
  assert.equal(toolNameForApi('get.weather'), 'getweather')
  assert.equal(stripToolApiName('查天气'), '')
  const generated = toolNameForApi('查天气')
  assert.match(generated, /^tool_[a-f0-9]{8}$/)
  assert.equal(TOOL_API_NAME.test(generated), true)
})
