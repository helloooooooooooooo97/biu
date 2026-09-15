import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { filterSlashItems, SLASH_ITEMS } from './slash.ts'

test('slash filter matches chinese labels and aliases', () => {
  assert.ok(filterSlashItems('标题').some((item) => item.id === 'h1'))
  assert.ok(filterSlashItems('code').some((item) => item.id === 'code'))
  assert.ok(filterSlashItems('图片').some((item) => item.id === 'image'))
  const slashSrc = readFileSync(resolve(import.meta.dirname, './slash.ts'), 'utf8')
  assert.match(slashSrc, /\/api\/db\/file\//)
  assert.doesNotMatch(slashSrc, /readAsDataURL/)
  assert.ok(filterSlashItems('表格').some((item) => item.id === 'table'))
  assert.ok(filterSlashItems('公式').some((item) => item.id === 'math'))
  assert.ok(filterSlashItems('latex').some((item) => item.id === 'math'))
  assert.equal(filterSlashItems('zzz').length, 0)
  assert.equal(filterSlashItems('').length, SLASH_ITEMS.length)
})

test('markdown roundtrips headings lists quote and code', () => {
  const src = `# 大标题

一段 **粗** 和 *斜*。

- 苹果
- 梨

1. 先
2. 后

> 引用

\`\`\`ts
const a = 1
\`\`\`
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const html = editor.getHTML()
  const out = editor.getMarkdown()
  assert.match(html, /<h1>大标题<\/h1>/)
  assert.match(html, /<strong>粗<\/strong>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<ol>/)
  assert.match(out, /^# 大标题/m)
  assert.match(out, /\*\*粗\*\*/)
  assert.match(out, /苹果/)
  assert.match(out, /先/)
  assert.match(out, /引用/)
  assert.match(out, /const a = 1/)
  editor.destroy()
})

test('heading stays a native h1 without node-view wrappers', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '# 标题\n\n正文',
    contentType: 'markdown',
  })
  const html = editor.getHTML()
  assert.match(html, /<h1>标题<\/h1>/)
  assert.doesNotMatch(html, /data-node-view/)
  editor.destroy()
})

test('empty paragraphs serialize as blank lines, not &nbsp;', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    },
  })
  const md = editor.getMarkdown()
  assert.doesNotMatch(md, /&nbsp;/)
  assert.match(md, /hi/)
  editor.destroy()
  const loaded = new Editor({
    extensions: pageEditorExtensions(),
    content: 'a\n\n&nbsp;\n\n&nbsp;\n\nb',
    contentType: 'markdown',
  })
  assert.doesNotMatch(loaded.getMarkdown(), /&nbsp;/)
  assert.match(loaded.getHTML(), /<p>a<\/p>/)
  assert.match(loaded.getHTML(), /<p>b<\/p>/)
  loaded.destroy()
})

test('slash suggestion uses a fixed high stacking context', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './slash.ts'), 'utf8')
  const css = await readFile(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(src, /slashMayOpen\(editor\)/)
  assert.match(src, /strategy: 'fixed'/)
  assert.match(src, /keepInWindow/)
  assert.match(src, /placeSlashInWindow/)
  assert.match(src, /zIndex = '10000'/)
  assert.match(css, /\.page-slash\{[^}]*z-index:10000/)
  assert.match(css, /\.page-slash\{[^}]*width:240px/)
  assert.match(css, /\.page-slash-icon\{[^}]*width:18px/)
  assert.doesNotMatch(css, /\.page-slash-icon\{[^}]*width:46px/)
  assert.match(css, /\.page-slash-foot\{/)
  assert.match(css, /\.page-slash\{[^}]*border:1px solid/)
  assert.doesNotMatch(css, /\.page-slash\{[^}]*0 0 0 1px/)
  assert.match(src, /MENU_HEIGHT = 280|Math.min\(280/)
  assert.match(src, /width: Math.max\(rects.floating.width, 240\)/)
  assert.match(css, /\.page-editor\{[^}]*font-family:var\(--font-sans\)/)
  assert.match(css, /\.page-editor\{[^}]*font-size:var\(--fsdb-body-size,15px\)/)
  assert.match(css, /\.page-editor \.react-renderer\.node-pageBlock\{[^}]*overflow:hidden/)
  assert.match(css, /\.page-editor \.page-block\[data-page-block\]\{[^}]*isolation:isolate/)
  assert.match(css, /\.page-editor \.page-block\[data-page-block=excalidraw\] img\{[^}]*margin:0/)
  assert.match(css, /\.page-editor \.page-block\[data-page-block=excalidraw\] \.welcome-screen-center\{display:none\}/)
  assert.match(css, /\.page-editor \.page-block\[data-page-block=terminal\] \.pt-scroll-rail\{/)
  assert.match(css, /\.page-editor \.tiptap ul\{list-style-type:disc\}/)
  assert.match(css, /\.page-editor \.tiptap ol\{list-style-type:decimal\}/)
  assert.match(css, /div\[data-type=block-math\]\.tiptap-mathematics-render\{[^}]*margin:8px 0/)
  assert.match(css, /span\[data-type=inline-math\]\{[^}]*display:inline/)
  assert.match(css, /span\[data-type=inline-math\]\{[^}]*vertical-align:baseline/)
  assert.doesNotMatch(css, /\.tiptap \.tiptap-mathematics-render\{margin:8px 0/)
  assert.doesNotMatch(css, /span\[data-type=inline-math\]\{[^}]*display:inline-block/)
})

test('markdown roundtrips image and table', () => {
  const src = `![封面](/api/db/file/cover.png)

| 甲 | 乙 |
| --- | --- |
| 1 | 2 |
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const html = editor.getHTML()
  const out = editor.getMarkdown()
  assert.match(html, /<img[^>]+src="\/api\/db\/file\/cover.png"/)
  assert.match(html, /<table/)
  assert.match(out, /!\[封面\]\(\/api\/db\/file\/cover\.png\)/)
  assert.match(out, /\|/)
  editor.destroy()
})

test('slash command inserts a table', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const table = SLASH_ITEMS.find((item) => item.id === 'table')
  assert.ok(table)
  table!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  assert.equal(editor.isActive('table'), true)
  editor.chain().focus().addRowAfter().run()
  editor.chain().focus().addColumnAfter().run()
  let rows = 0
  let cells = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') rows += 1
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells += 1
  })
  assert.equal(rows, 4)
  assert.equal(cells, 16)
  editor.destroy()
})

test('markdown roundtrips inline and block latex', () => {
  const src = `行内 $E = mc^2$ 公式。

$$\\sum_{i=1}^{n} x_i$$
`
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: src,
    contentType: 'markdown',
  })
  const html = editor.getHTML()
  const out = editor.getMarkdown()
  assert.match(html, /data-type="inline-math"/)
  assert.match(html, /data-type="block-math"/)
  assert.match(out, /\$E = mc\^2\$/)
  assert.match(out, /\\sum_\{i=1\}\^\{n\} x_i/)
  editor.destroy()
})

test('latex markdown does not accumulate backslashes across reloads', () => {
  let md = '的 $a_b$ 的\n\n$$\\sum_{i=1}^{n} x_i$$\n'
  const counts: number[] = []
  for (let i = 0; i < 4; i++) {
    const editor = new Editor({
      extensions: pageEditorExtensions(),
      content: md,
      contentType: 'markdown',
    })
    md = editor.getMarkdown()
    counts.push((md.match(/\\/g) ?? []).length)
    editor.destroy()
  }
  assert.equal(counts[0], counts[3])
  const again = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  assert.equal(again.getMarkdown(), md)
  again.destroy()
})

test('slash command inserts inline math into the current paragraph', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const math = SLASH_ITEMS.find((item) => item.id === 'math-inline')
  assert.ok(math)
  math!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  assert.match(editor.getHTML(), /data-type="inline-math"/)
  assert.match(editor.getHTML(), /x\^2/)
  assert.match(editor.getMarkdown(), /\$x\^2\$/)
  editor.destroy()
})

test('slash command inserts block math', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const math = SLASH_ITEMS.find((item) => item.id === 'math')
  assert.ok(math)
  math!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  assert.match(editor.getHTML(), /data-type="block-math"/)
  assert.match(editor.getHTML(), /E = mc\^2/)
  editor.destroy()
})

test('slash command turns the current block into a heading', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const heading = SLASH_ITEMS.find((item) => item.id === 'h1')
  assert.ok(heading)
  heading!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  assert.equal(editor.isActive('heading', { level: 1 }), true)
  editor.destroy()
})

test('fenced code keeps language on the block and highlights tokens', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: '```ts\nconst a = 1\n```\n',
    contentType: 'markdown',
  })
  const pre = host.querySelector('pre')
  assert.equal(pre?.getAttribute('data-language'), 'ts')
  assert.ok(host.querySelector('.hljs-keyword, .hljs-attr, .hljs-number, [class^="hljs-"]'))
  assert.match(editor.getMarkdown(), /```ts/)
  editor.destroy()
  host.remove()
})

test('code fence without language still auto-highlights', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: '```\nfunction hello() { return 1 }\n```\n',
    contentType: 'markdown',
  })
  assert.equal(host.querySelector('pre')?.hasAttribute('data-language'), false)
  assert.ok(host.querySelector('[class^="hljs-"], [class*=" hljs-"]'))
  editor.destroy()
  host.remove()
})
