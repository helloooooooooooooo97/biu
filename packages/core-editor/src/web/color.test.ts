import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { TAG_TONES } from '@biu/public-ui'
import { pageEditorExtensions } from './kit.ts'
import { EDITOR_TONES, HIGHLIGHT_COLORS, TEXT_COLORS, tagTextColor, tagWashColor } from './color-swatches.ts'

test('color palettes follow supertag tones', () => {
  assert.deepEqual([...EDITOR_TONES], [...TAG_TONES])
  assert.ok(TEXT_COLORS.some((item) => item.value === ''))
  assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === ''))
  for (const tone of TAG_TONES) {
    assert.ok(TEXT_COLORS.some((item) => item.value === tagTextColor(tone)))
    assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === tagWashColor(tone)))
  }
  assert.ok(tagTextColor('#d9730d').includes('--dsw-tag-ink'))
  assert.ok(tagWashColor('#5b9fd6').includes('22%'))
  assert.match(tagWashColor('#5b9fd6'), /transparent/)
})

test('tiptap Color and Highlight apply tag tones', () => {
  const text = tagTextColor(TAG_TONES[0]!)
  const wash = tagWashColor(TAG_TONES[0]!)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '你好世界',
    contentType: 'markdown',
  })
  const from = 1
  const to = from + '你好'.length
  editor.commands.setTextSelection({ from, to })
  editor.commands.setColor(text)
  assert.equal(editor.isActive('textStyle', { color: text }), true)
  assert.match(editor.getHTML(), /style="color:/)
  editor.commands.setHighlight({ color: wash })
  assert.equal(editor.isActive('highlight', { color: wash }), true)
  assert.match(editor.getHTML(), /<(span|mark)[^>]*(data-color|background-color)/)
  const md = editor.getMarkdown()
  editor.destroy()

  const again = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  again.commands.setTextSelection({ from, to })
  assert.equal(again.isActive('textStyle', { color: text }), true)
  assert.equal(again.isActive('highlight', { color: wash }), true)
  again.destroy()
})
