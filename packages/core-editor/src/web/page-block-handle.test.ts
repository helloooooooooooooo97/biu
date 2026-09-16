import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import {
  HANDLE_RAIL,
  beginHandleDrag,
  deleteHandleBlock,
  duplicateHandleBlock,
  handleBlockFromDom,
  handleRailLeft,
  visibleHandleEl,
  insertParagraphAfter,
  insertParagraphBefore,
  resolveHandleBlock,
} from './page-block-handle.ts'
import { pageEditorExtensions } from './kit.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('resolveHandleBlock picks top-level paragraph', () => {
  const editor = editorOf('你好\n\n世界')
  const first = editor.state.doc.child(0)
  const $pos = editor.state.doc.resolve(2)
  const found = resolveHandleBlock($pos)
  assert.ok(found)
  assert.equal(found!.pos, 0)
  assert.equal(found!.node.type.name, 'paragraph')
  assert.equal(found!.node.textContent, first.textContent)
  editor.destroy()
})

test('resolveHandleBlock picks listItem inside a list', () => {
  const editor = editorOf('- 甲\n- 乙')
  let itemPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (itemPos < 0 && node.type.name === 'listItem') itemPos = pos
  })
  assert.ok(itemPos >= 0)
  const $pos = editor.state.doc.resolve(itemPos + 2)
  const found = resolveHandleBlock($pos)
  assert.ok(found)
  assert.equal(found!.node.type.name, 'listItem')
  editor.destroy()
})

test('insert before / after / duplicate / delete a paragraph', () => {
  const editor = editorOf('第一段\n\n第二段')
  const firstText = editor.state.doc.child(0).textContent
  insertParagraphBefore(editor, 0)
  assert.equal(editor.state.doc.child(0).textContent, '')
  assert.equal(editor.state.doc.child(1).textContent, firstText)

  const firstPos = editor.state.doc.child(0).nodeSize
  const firstNode = editor.state.doc.child(1)
  insertParagraphAfter(editor, firstPos, firstNode)
  assert.equal(editor.state.doc.child(2).textContent, '')

  duplicateHandleBlock(editor, firstPos, firstNode)
  const texts: string[] = []
  for (let i = 0; i < editor.state.doc.childCount; i++) texts.push(editor.state.doc.child(i).textContent)
  assert.equal(texts.filter((t) => t === firstText).length, 2)

  deleteHandleBlock(editor, 0, editor.state.doc.child(0))
  assert.notEqual(editor.state.doc.child(0).textContent, '')
  editor.destroy()
})

test('resolveHandleBlock picks pageBlock atom at the gap beside it', () => {
  const editor = editorOf(`:::pageBlock {kind=html plugin=page-html-blocks}
{"html":"<p>hi</p>"}
:::
`)
  let blockPos = -1
  let blockSize = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'pageBlock') {
      blockPos = pos
      blockSize = node.nodeSize
    }
  })
  assert.ok(blockPos >= 0)
  const atStart = resolveHandleBlock(editor.state.doc.resolve(blockPos))
  assert.equal(atStart?.node.type.name, 'pageBlock')
  assert.equal(atStart?.pos, blockPos)
  const after = resolveHandleBlock(editor.state.doc.resolve(blockPos + blockSize))
  assert.equal(after?.node.type.name, 'pageBlock')
  assert.equal(after?.pos, blockPos)
  editor.destroy()
})

test('handleBlockFromDom maps a nested iframe back to the pageBlock atom', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: `:::pageBlock {kind=html plugin=page-html-blocks}
{"html":"<p>hi</p>"}
:::
`,
    contentType: 'markdown',
  })
  const hole = host.querySelector('[draggable="true"]')
  assert.ok(hole instanceof HTMLElement)
  hole.classList.add('page-block')
  hole.setAttribute('data-page-block', 'html')
  const iframe = document.createElement('iframe')
  hole.append(iframe)
  const found = handleBlockFromDom(editor, iframe)
  assert.equal(found?.node.type.name, 'pageBlock')
  editor.destroy()
  host.remove()
})

test('beginHandleDrag selects a table as a node and marks move', () => {
  const editor = editorOf('| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n')
  let tablePos = -1
  editor.state.doc.descendants((node, pos) => {
    if (tablePos < 0 && node.type.name === 'table') tablePos = pos
  })
  assert.ok(tablePos >= 0)
  const transfer = { effectAllowed: 'copy', setData() {} }
  assert.equal(beginHandleDrag(editor, tablePos, transfer), true)
  assert.equal(editor.state.selection.constructor.name, 'NodeSelection')
  assert.equal(editor.view.dragging?.move, true)
  assert.equal(transfer.effectAllowed, 'move')
  editor.destroy()
})

test('handleRailLeft is the same for indented list boxes and top-level paragraphs', () => {
  const hostLeft = 40
  const contentLeft = 40
  const paragraphBoxLeft = 40
  const listItemBoxLeft = 64
  assert.equal(handleRailLeft(hostLeft, contentLeft), contentLeft - hostLeft - HANDLE_RAIL)
  assert.equal(handleRailLeft(hostLeft, contentLeft), handleRailLeft(hostLeft, contentLeft))
  assert.notEqual(paragraphBoxLeft - hostLeft - HANDLE_RAIL, listItemBoxLeft - hostLeft - HANDLE_RAIL)
  assert.equal(handleRailLeft(hostLeft, contentLeft), paragraphBoxLeft - hostLeft - HANDLE_RAIL)
  assert.notEqual(handleRailLeft(hostLeft, contentLeft), listItemBoxLeft - hostLeft - HANDLE_RAIL)
})

test('visibleHandleEl prefers the inner page-block, not the renderer shell', () => {
  const outer = document.createElement('div')
  outer.className = 'page-block react-renderer'
  const inner = document.createElement('div')
  inner.className = 'page-block'
  inner.setAttribute('data-page-block', 'html')
  outer.append(inner)
  assert.equal(visibleHandleEl(outer), inner)
  const para = document.createElement('p')
  assert.equal(visibleHandleEl(para), para)
})

test('page block handle x uses the editor rail, not the node box', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './page-block-handle.tsx'), 'utf8')
  assert.match(src, /handleRailLeft\(hostBox\.left, contentBox\.left\)/)
  assert.doesNotMatch(src, /left: box\.left - hostBox\.left - HANDLE_RAIL/)
})

test('block handle menu puts an icon before each action', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './page-block-handle.tsx'), 'utf8')
  const css = await readFile(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(src, /<ArrowUpIcon[\s\S]*向上插入/)
  assert.match(src, /<ArrowDownIcon[\s\S]*向下插入/)
  assert.match(src, /<Square2StackIcon[\s\S]*复制/)
  assert.match(src, /<TrashIcon[\s\S]*删除/)
  assert.match(css, /\.page-block-handle-menu button\{[^}]*display:\s*flex/)
  assert.match(css, /\.page-block-handle-menu button\{[^}]*gap:\s*8px/)
})
