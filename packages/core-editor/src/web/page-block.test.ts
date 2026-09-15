import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { Context } from 'cordis'
import { pageEditorExtensions } from './kit.ts'
import { filterSlashItems, slashGroups } from './slash.ts'
import { BASIC_BLOCK_TYPE, PageEditorService } from './service.ts'
import { duplicateAssetPath } from './page-block.ts'

test('registerBlock adds a slash item and inserts pageBlock', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'algo',
    inject: ['pageEditor'],
    apply(inner) {
      inner.pageEditor.registerBlock({
        kind: 'algorithm',
        plugin: 'page-algorithm',
        label: '算法题',
        aliases: ['leetcode'],
        defaults: { title: 'Two Sum' },
        View: () => null,
      })
    },
  })
  await fiber
  const item = filterSlashItems('leetcode').find((entry) => entry.id === 'algorithm')
  assert.equal(item?.label, '算法题')
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  item!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  const json = editor.getJSON()
  const block = json.content?.find((node) => node.type === 'pageBlock')
  assert.equal(block?.attrs?.kind, 'algorithm')
  assert.equal(block?.attrs?.plugin, 'page-algorithm')
  assert.match(String(block?.attrs?.id ?? ''), /^[a-z0-9]{8}$/i)
  assert.equal((block?.attrs?.data as { title?: string })?.title, 'Two Sum')
  const md = editor.getMarkdown()
  assert.match(md, /:::pageBlock \{kind=algorithm plugin=page-algorithm id=[a-z0-9]+\}/)
  assert.match(md, /Two Sum/)
  editor.destroy()
  await fiber.dispose()
  assert.equal(filterSlashItems('leetcode').some((entry) => entry.id === 'algorithm'), false)
})

test('pageBlock markdown roundtrips kind, plugin, id and data', () => {
  const src = `:::pageBlock {kind=algorithm plugin=page-algorithm id=ab12cd34}
{"title":"Two Sum","lang":"python"}
:::
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const json = editor.getJSON()
  const block = json.content?.find((node) => node.type === 'pageBlock')
  assert.equal(block?.attrs?.kind, 'algorithm')
  assert.equal(block?.attrs?.plugin, 'page-algorithm')
  assert.equal(block?.attrs?.id, 'ab12cd34')
  assert.equal((block?.attrs?.data as { title?: string })?.title, 'Two Sum')
  const out = editor.getMarkdown()
  assert.match(out, /:::pageBlock \{kind=algorithm plugin=page-algorithm id=ab12cd34\}/)
  assert.match(out, /Two Sum/)
  editor.destroy()
})

test('html pageBlock markdown keeps raw html and deck on the fence', () => {
  const src = `:::pageBlock {kind=html plugin=page-html-blocks deck=true}
<div style="color:#fff">爱乐之城</div>
:::
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const block = editor.getJSON().content?.find((node) => node.type === 'pageBlock')
  assert.equal(block?.attrs?.kind, 'html')
  assert.equal((block?.attrs?.data as { html?: string; deck?: boolean })?.html, '<div style="color:#fff">爱乐之城</div>')
  assert.equal((block?.attrs?.data as { deck?: boolean })?.deck, true)
  const out = editor.getMarkdown()
  assert.match(out, /:::pageBlock \{kind=html plugin=page-html-blocks id=[a-z0-9]+ deck=true\}/)
  assert.match(out, /<div style="color:#fff">爱乐之城<\/div>/)
  assert.doesNotMatch(out, /"html":/)
  editor.destroy()
})

test('html pageBlock still reads the old JSON body', () => {
  const src = `:::pageBlock {kind=html plugin=page-html-blocks}
{"html":"<div>旧写法</div>","deck":true}
:::
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const data = editor.getJSON().content?.find((node) => node.type === 'pageBlock')?.attrs?.data as {
    html?: string
    deck?: boolean
  }
  assert.equal(data?.html, '<div>旧写法</div>')
  assert.equal(data?.deck, true)
  const out = editor.getMarkdown()
  assert.match(out, /deck=true/)
  assert.match(out, /<div>旧写法<\/div>/)
  assert.doesNotMatch(out, /\\"/)
  editor.destroy()
})

test('pageBlock markdown keeps old fences without plugin id', () => {
  const src = `:::pageBlock {kind=excalidraw}
{"file":"assets/excalidraw-demo.json"}
:::
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const json = editor.getJSON()
  const block = json.content?.find((node) => node.type === 'pageBlock')
  assert.equal(block?.attrs?.kind, 'excalidraw')
  assert.equal(block?.attrs?.plugin, '')
  assert.deepEqual(block?.attrs?.data, { file: 'assets/excalidraw-demo.json' })
  const out = editor.getMarkdown()
  assert.match(out, /:::pageBlock \{kind=excalidraw id=[a-z0-9]+\}/)
  assert.match(out, /"file": "assets\/excalidraw-demo.json"/)
  assert.doesNotMatch(out, /"elements"/)
  assert.doesNotMatch(out, /"height"/)
  editor.destroy()
})

test('slash insert for excalidraw only puts a file pointer in the node', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'draw',
    inject: ['pageEditor'],
    apply(inner) {
      inner.pageEditor.registerBlock({
        kind: 'excalidraw',
        plugin: 'page-excalidraw',
        label: '画板',
        defaults: () => ({ file: 'assets/excalidraw-new.json' }),
        View: () => null,
      })
    },
  })
  await fiber
  const item = filterSlashItems('画板').find((entry) => entry.id === 'excalidraw')
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  item!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  const block = editor.getJSON().content?.find((node) => node.type === 'pageBlock')
  const data = block?.attrs?.data as { file?: string; title?: string }
  assert.equal(block?.attrs?.plugin, 'page-excalidraw')
  assert.equal(data?.file, 'assets/excalidraw-new.json')
  assert.equal(data?.title, '画板')
  assert.doesNotMatch(editor.getMarkdown(), /elements/)
  editor.destroy()
  await fiber.dispose()
})

test('duplicate pageBlock file pointers get a cloneFrom copy', () => {
  assert.match(duplicateAssetPath('assets/画板.json'), /^assets\/画板-copy-[0-9a-f]{8}\.json$/)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editor.commands.setContent({
    type: 'doc',
    content: [
      { type: 'pageBlock', attrs: { kind: 'excalidraw', data: { file: 'assets/board.json' } } },
      { type: 'pageBlock', attrs: { kind: 'excalidraw', data: { file: 'assets/board.json' } } },
    ],
  })
  const blocks = editor.getJSON().content?.filter((node) => node.type === 'pageBlock') ?? []
  assert.equal(blocks.length, 2)
  const first = blocks[0]?.attrs?.data as { file?: string; cloneFrom?: string }
  const second = blocks[1]?.attrs?.data as { file?: string; cloneFrom?: string }
  assert.equal(first.file, 'assets/board.json')
  assert.ok(second.file && second.file !== first.file)
  assert.equal(second.cloneFrom, 'assets/board.json')
  editor.destroy()
})

test('editor assigns a stable id when inserting or loading a pageBlock without one', async () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: `:::pageBlock {kind=html plugin=page-html-blocks}\n<div>x</div>\n:::\n`,
    contentType: 'markdown',
  })
  await Promise.resolve()
  const block = editor.getJSON().content?.find((node) => node.type === 'pageBlock')
  assert.match(String(block?.attrs?.id ?? ''), /^[a-z0-9]{8}$/i)
  assert.match(editor.getMarkdown(), /:::pageBlock \{kind=html plugin=page-html-blocks id=[a-z0-9]+\}/)
  editor.destroy()
})

test('setContent from agent without id or with a bad id gets a valid id', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: 'hello',
    contentType: 'markdown',
  })
  editor.commands.setContent(
    `:::pageBlock {kind=html plugin=page-html-blocks}\n<div>a</div>\n:::\n\n:::pageBlock {kind=html plugin=page-html-blocks id=no}\n<div>b</div>\n:::\n`,
    { contentType: 'markdown', emitUpdate: false },
  )
  const ids = (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'pageBlock')
    .map((node) => String(node.attrs?.id ?? ''))
  assert.equal(ids.length, 2)
  assert.match(ids[0]!, /^[a-z0-9]{8}$/i)
  assert.match(ids[1]!, /^[a-z0-9]{8}$/i)
  assert.notEqual(ids[0], ids[1])
  editor.destroy()
})

test('copied pageBlocks do not share an id', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editor.commands.setContent({
    type: 'doc',
    content: [
      { type: 'pageBlock', attrs: { kind: 'html', id: 'ab12cd34', data: { html: '<div>a</div>' } } },
      { type: 'pageBlock', attrs: { kind: 'html', id: 'ab12cd34', data: { html: '<div>b</div>' } } },
    ],
  })
  const ids = (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'pageBlock')
    .map((node) => String(node.attrs?.id ?? ''))
  assert.equal(ids.length, 2)
  assert.equal(ids[0], 'ab12cd34')
  assert.notEqual(ids[1], ids[0])
  assert.match(ids[1]!, /^[a-z0-9]{8}$/i)
  editor.destroy()
})

test('pasted pageBlocks with the same id are rewritten immediately', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: {
      type: 'doc',
      content: [{ type: 'pageBlock', attrs: { kind: 'html', id: 'ab12cd34', data: { html: '<div>a</div>' } } }],
    },
  })
  editor.commands.insertContentAt(editor.state.doc.content.size, {
    type: 'pageBlock',
    attrs: { kind: 'html', id: 'ab12cd34', data: { html: '<div>b</div>' } },
  })
  const live = (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'pageBlock')
    .map((node) => String(node.attrs?.id ?? ''))
  assert.equal(live.length, 2)
  assert.equal(live[0], 'ab12cd34')
  assert.notEqual(live[1], live[0])
  assert.match(live[1]!, /^[a-z0-9]{8}$/i)
  editor.destroy()
})

test('pageBlock node view skips react update when attrs are unchanged', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './page-block.ts'), 'utf8')
  assert.match(src, /oldNode\.attrs\.id === newNode\.attrs\.id/)
  assert.match(src, /oldNode\.attrs\.kind === newNode\.attrs\.kind/)
  assert.match(src, /JSON\.stringify\(oldNode\.attrs\.data\) === JSON\.stringify\(newNode\.attrs\.data\)/)
  assert.match(src, /return true/)
})

test('pageBlock capture includes every registered block shell', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './page-block.ts'), 'utf8')
  const view = await readFile(resolve(import.meta.dirname, './page-block-view.tsx'), 'utf8')
  assert.match(src, /closest\('\.page-block/)
  assert.match(src, /data-page-block-capture/)
  assert.match(view, /data-page-block-capture=""/)
  assert.match(view, /contentEditable=\{false\}/)
  assert.doesNotMatch(view, /contentEditable="false"/)
  assert.doesNotMatch(view, /page-block-html-preview/)
  assert.doesNotMatch(view, /kind === 'html'/)
  assert.match(view, /memo\(function PageBlockView/)
  assert.match(view, /samePageBlockProps/)
  assert.match(view, /bindPageBlockPlugin/)
  assert.match(view, /data-biu-plugin=\{plugin \|\| undefined\}/)
  assert.match(view, /data-biu-kind="plugin"/)
  assert.match(view, /data-page-block-id=\{blockId \|\| undefined\}/)
  assert.match(view, /data-biu-id=\{pickId\}/)
  assert.match(view, /setNodeSelection\(pos\)/)
  assert.match(view, /classList\.contains\('pick-mode'\)/)
  assert.doesNotMatch(src, /addKeyboardShortcuts/)
  assert.doesNotMatch(src, /deleteSelection/)
  assert.doesNotMatch(view, /onKeyDownCapture/)
})

test('Enter on a selected pageBlock does not delete it', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: `hello\n\n:::pageBlock {kind=excalidraw plugin=page-excalidraw}\n{"file":"assets/x.json"}\n:::\n`,
    contentType: 'markdown',
  })
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name === 'pageBlock') pos = p
  })
  assert.ok(pos >= 0)
  editor.chain().setNodeSelection(pos).run()
  editor.commands.keyboardShortcut('Enter')
  const types = editor.getJSON().content?.map((node) => node.type) ?? []
  assert.equal(types.includes('pageBlock'), true)
  assert.match(editor.getMarkdown(), /hello/)
  assert.match(editor.getMarkdown(), /pageBlock/)
  editor.destroy()
})

test('registerBlock requires plugin id', () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  assert.throws(
    () =>
      ctx.pageEditor.registerBlock({
        kind: 'algorithm',
        plugin: '',
        label: '算法题',
        View: () => null,
      }),
    /plugin id/,
  )
})

test('saving an old fence backfills plugin from the running spec', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'draw',
    inject: ['pageEditor'],
    apply(inner) {
      inner.pageEditor.registerBlock({
        kind: 'excalidraw',
        plugin: 'page-excalidraw',
        label: '画板',
        View: () => null,
      })
    },
  })
  await fiber
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: `:::pageBlock {kind=excalidraw}\n{"file":"assets/excalidraw-demo.json"}\n:::\n`,
    contentType: 'markdown',
  })
  assert.match(editor.getMarkdown(), /plugin=page-excalidraw/)
  editor.destroy()
  await fiber.dispose()
})

test('registerBlock puts custom kinds in their own slash group', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'draw',
    inject: ['pageEditor'],
    apply(inner) {
      inner.pageEditor.registerBlock({
        kind: 'excalidraw',
        plugin: 'page-excalidraw',
        label: '画板',
        blockType: 'excalidraw',
        blockTypeLabel: '画板',
        View: () => null,
      })
      inner.pageEditor.registerBlock({
        kind: 'algorithm',
        plugin: 'page-algorithm',
        label: '算法题',
        blockType: 'algorithm',
        View: () => null,
      })
    },
  })
  await fiber
  const groups = slashGroups(filterSlashItems(''))
  assert.equal(groups[0]?.id, BASIC_BLOCK_TYPE)
  assert.equal(groups[0]?.label, '基础模块')
  assert.equal(groups.find((group) => group.id === 'excalidraw')?.label, '画板')
  assert.equal(groups.find((group) => group.id === 'algorithm')?.label, '算法题')
  assert.equal(groups[0]?.items.some((item) => item.id === 'excalidraw' || item.id === 'algorithm'), false)
  await fiber.dispose()
})

