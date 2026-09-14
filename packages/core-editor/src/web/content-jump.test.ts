import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { pageEditorExtensions } from './kit.ts'
import {
  applyContentJump,
  clearContentJump,
  consumeContentJump,
  peekContentJump,
  posRangeForJump,
  rememberContentJump,
  snippetAtLine,
  stripMarkdownLine,
  tryContentJump,
} from './content-jump.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

function textAtCaret(editor: Editor, span = 24) {
  const from = editor.state.selection.from
  const size = editor.state.doc.content.size
  return editor.state.doc.textBetween(Math.max(0, from), Math.min(size, from + span), '\n')
}

test('content jump remembers then consumes for the matching record', () => {
  clearContentJump()
  rememberContentJump({ path: '/pages/home', start_line: 4, end_line: 6 })
  assert.equal(consumeContentJump('other'), null)
  const jump = consumeContentJump('home')
  assert.deepEqual(jump, { path: '/pages/home', start_line: 4, end_line: 6 })
  assert.equal(consumeContentJump('home'), null)
})

test('window content-jump event is remembered', () => {
  clearContentJump()
  window.dispatchEvent(
    new CustomEvent(CONTENT_JUMP_EVENT, { detail: { path: '/tasks/t1', start_line: 2, end_line: 2 } }),
  )
  assert.deepEqual(consumeContentJump('t1'), { path: '/tasks/t1', start_line: 2, end_line: 2 })
})

test('snippetAtLine strips markdown markers', () => {
  assert.equal(stripMarkdownLine('## Hello `x`'), 'Hello x')
  assert.equal(snippetAtLine('# Title\n\n- **item**\nmore', 3), 'item')
})

test('applyContentJump marks the replaced markdown without focusing', () => {
  const md = '# 欢迎\n\n第一段\n\nUNIQUE_JUMP_ANCHOR 改到这\n\n末段'
  const editor = editorOf(md)
  const caret = editor.state.selection.from
  applyContentJump(editor, md, { path: '/pages/home', start_line: 5, end_line: 5 })
  assert.equal(editor.isFocused, false)
  assert.equal(editor.state.selection.from, caret)
  assert.match(editor.view.dom.innerHTML, /page-agent-edit/)
  assert.match(editor.view.dom.textContent ?? '', /UNIQUE_JUMP_ANCHOR/)
  editor.destroy()
})

test('applyContentJump navigate still moves the caret when asked', () => {
  const md = '# 欢迎\n\n第一段\n\nUNIQUE_NAV_ANCHOR 改到这\n\n末段'
  const editor = editorOf(md)
  applyContentJump(editor, md, { path: '/pages/home', start_line: 5, end_line: 5 }, { navigate: true })
  assert.match(textAtCaret(editor), /UNIQUE_NAV_ANCHOR/)
  assert.match(editor.view.dom.innerHTML, /page-agent-edit/)
  editor.destroy()
})

test('applyContentJump marks the whole added span, not the first 48 characters', () => {
  const md = '# 欢迎\n\n这是第一段很长的正文需要整段高亮\n\n这是第二段同样要被标出来'
  const editor = editorOf(md)
  applyContentJump(editor, md, {
    path: '/pages/home',
    start_line: 1,
    end_line: 5,
    text: '欢迎\n这是第一段很长的正文需要整段高亮\n这是第二段同样要被标出来',
  })
  const marked = [...editor.view.dom.querySelectorAll('.page-agent-edit')].map((node) => node.textContent ?? '').join('')
  assert.match(marked, /第一段很长的正文需要整段高亮/)
  assert.match(marked, /第二段同样要被标出来/)
  const range = posRangeForJump(editor.state.doc, md, { path: '/pages/home', start_line: 1, end_line: 5, text: '欢迎\n这是第一段很长的正文需要整段高亮\n这是第二段同样要被标出来' })
  assert.ok(range)
  const span = editor.state.doc.textBetween(range!.from, range!.to, '\n')
  assert.match(span, /第一段/)
  assert.match(span, /第二段/)
  editor.destroy()
})

test('tryContentJump waits until new text is in the doc then marks it', () => {
  clearContentJump()
  const before = '# 欢迎\n\n旧段落'
  const after = '# 欢迎\n\n改动段落 XYZ'
  const editor = editorOf(before)
  rememberContentJump({ path: '/pages/home', start_line: 3, end_line: 3 })
  assert.equal(tryContentJump(editor, after, 'home', false), false)
  editor.commands.setContent(after, { contentType: 'markdown', emitUpdate: false })
  assert.equal(tryContentJump(editor, after, 'home', true), true)
  assert.equal(editor.isFocused, false)
  assert.match(editor.view.dom.innerHTML, /page-agent-edit/)
  assert.match(editor.view.dom.textContent ?? '', /改动段落 XYZ/)
  editor.destroy()
})

test('tryContentJump applies on every live editor before consuming', async () => {
  clearContentJump()
  const md = '# 欢迎\n\nUNIQUE_MULTI_JUMP'
  const a = editorOf(md)
  const b = editorOf(md)
  rememberContentJump({ path: '/pages/home', start_line: 3, end_line: 3 })
  assert.equal(tryContentJump(a, md, 'home', true), true)
  assert.equal(tryContentJump(b, md, 'home', true), true)
  assert.match(a.view.dom.innerHTML, /page-agent-edit/)
  assert.match(b.view.dom.innerHTML, /page-agent-edit/)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(peekContentJump(), null)
  a.destroy()
  b.destroy()
})
