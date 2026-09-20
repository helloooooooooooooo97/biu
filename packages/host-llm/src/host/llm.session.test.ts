import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  hasImageContent,
  DEEPSEEK_VISION_MODEL,
  flattenToolImagesForChatCompletions,
  toAnthropicContent,
} from '@biu/host-llm'

test('hasImageContent detects image_url block in array content', () => {
  assert.equal(
    hasImageContent([
      { type: 'text' as const, text: 'hi' },
      { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,xxx' } },
    ]),
    true,
  )
})

test('hasImageContent returns false for plain string / null / text-only', () => {
  assert.equal(hasImageContent('hello'), false)
  assert.equal(hasImageContent(null), false)
  assert.equal(hasImageContent(undefined), false)
  assert.equal(hasImageContent([{ type: 'text' as const, text: 'only text' }]), false)
})

test('DEEPSEEK_VISION_MODEL constant matches vision-exp model', () => {
  assert.equal(DEEPSEEK_VISION_MODEL, 'deepseek-v4-flash-vision-exp')
})

test('flattenToolImagesForChatCompletions keeps tool text and appends user images', () => {
  const out = flattenToolImagesForChatCompletions([
    { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
    {
      role: 'tool',
      tool_call_id: '1',
      content: [
        { type: 'text', text: '{"ok":true}' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
  ])
  assert.equal(out[1]?.role, 'tool')
  assert.equal(out[1]?.content, '{"ok":true}')
  assert.equal(out[2]?.role, 'user')
  assert.equal(hasImageContent(out[2]?.content), true)
})

test('toAnthropicContent wraps tool images as tool_result image source', () => {
  const content = toAnthropicContent(
    [
      { type: 'text', text: 'shot' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ],
    'call-1',
  )
  assert.deepEqual(content, [
    {
      type: 'tool_result',
      tool_use_id: 'call-1',
      content: [
        { type: 'text', text: 'shot' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
      ],
    },
  ])
})
