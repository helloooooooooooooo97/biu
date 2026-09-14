import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pickSurfaceAtPoint, resolvePickFromNode, resolvePickAtPoint, resolvePicksInRect, visiblePickBox, editorBlockElFromNode } from './resolve.ts'
import { formatPicks, parsePicks, splitPickStream, chipLabel, chipCaption, dedupePicks, textPickFromSelection, textPickFromPlain } from './types.ts'
import { bindEditorTextHost } from './editor-host.ts'

test('splitPickStream keeps text and chips in order', () => {
  const parts = splitPickStream('看 <pick kind="task" id="t1" label="写需求" /> 和 <pick kind="plugin" id="p1" label="Hello" /> 吧')
  assert.equal(parts.length, 5)
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[1]?.type, 'pick')
  assert.equal(parts[1]?.type === 'pick' ? parts[1].ref.id : '', 't1')
  assert.equal(parts[3]?.type, 'pick')
  assert.equal(parts[3]?.type === 'pick' ? parts[3].ref.id : '', 'p1')
})

test('merges child action onto parent kind/id', () => {
  const card = document.createElement('div')
  card.setAttribute('data-biu-kind', 'task')
  card.setAttribute('data-biu-id', 't1')
  card.setAttribute('data-biu-label', '写需求')
  const btn = document.createElement('button')
  btn.setAttribute('data-biu-action', 'open')
  card.append(btn)
  document.body.append(card)
  const hit = resolvePickFromNode(btn, '/tasks')
  assert.ok(hit)
  assert.equal(hit.ref.kind, 'task')
  assert.equal(hit.ref.id, 't1')
  assert.equal(hit.ref.action, 'open')
  assert.equal(hit.ref.label, '写需求')
  assert.equal(chipLabel(hit.ref), '写需求 · open')
  card.remove()
})

test('ignored subtrees are not pickable', () => {
  const wrap = document.createElement('div')
  wrap.setAttribute('data-biu-ignore', '')
  const inner = document.createElement('div')
  inner.setAttribute('data-biu-kind', 'session')
  inner.setAttribute('data-biu-id', 's1')
  wrap.append(inner)
  document.body.append(wrap)
  assert.equal(resolvePickFromNode(inner, '/'), null)
  wrap.remove()
})

test('picking does not look through the chat overlay', () => {
  const behind = document.createElement('div')
  behind.setAttribute('data-biu-kind', 'page')
  behind.setAttribute('data-biu-id', 'p1')
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  document.body.append(behind, panel)
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [panel, behind],
  })
  assert.equal(resolvePickAtPoint(0, 0, '/pages'), null)
  behind.remove()
  panel.remove()
})

test('formatPicks emits JSON handles only', () => {
  const text = formatPicks([
    { kind: 'session', id: 'abc', label: '聊天', route: '/s/abc' },
  ])
  assert.equal(text, '<pick>{"kind":"session","id":"abc","route":"/s/abc","label":"聊天"}</pick>')
  assert.doesNotMatch(text, /class=|svg|html/i)
})

test('formatPicks keeps page title for the agent', () => {
  const text = formatPicks([
    {
      kind: 'text',
      id: 't1',
      label: '海报',
      title: '爱乐之城',
      route: '/database/pages/record/p002',
      path: '/pages/p002',
      start_line: 1,
      end_line: 1,
      text: '海报',
      selection: '海报',
    },
  ])
  const parsed = parsePicks(text)
  assert.equal(parsed.refs[0]?.title, '爱乐之城')
  assert.equal(parsed.refs[0]?.path, '/pages/p002')
  assert.equal(chipLabel(parsed.refs[0]!), '爱乐之城 (1)')
})

test('text pick without source lines shows character count', () => {
  const ref = textPickFromPlain('/s/abc', 'hello world this is a pasted blob')
  assert.ok(ref)
  assert.equal(chipCaption(ref).span, String(ref.selection?.length))
  assert.match(chipLabel(ref), /\(\d+\)$/)
  assert.equal(textPickFromPlain('/s/abc', '   '), null)
})

test('chip caption keeps line span off the truncated preview', () => {
  const raw =
    '<pick>{"kind":"text","id":"4b33982e","route":"/s/b3b1d688-1e8b-45b1-ac56-b8747a14e842","path":"/pages/p004","start_line":1,"end_line":12,"text":"的的的\\n\\n我爱你\\n完成滕王阁序  \\n我爱你，谢谢  \\n我爱你  \\n我爱你 forever  \\n你好吗？？？  \\n我喜欢呢？？？  \\n非常好  \\n你好  \\n继续加","selection":"的的的\\n我爱你\\n完成滕王阁序我爱你，谢谢我爱你我爱你 forever你好吗？？？我喜欢呢？？？非常好你好继续加"}</pick>'
  const parsed = parsePicks(raw)
  const ref = parsed.refs[0]
  assert.ok(ref)
  assert.equal(ref.start_line, 1)
  assert.equal(ref.end_line, 12)
  const { name, span } = chipCaption(ref)
  assert.equal(span, '1-12')
  assert.ok(name.length <= 25)
  assert.match(chipLabel(ref), /\(1-12\)$/)
})

test('chip label puts line span in parentheses after the name', () => {
  assert.equal(
    chipLabel({
      kind: 'page',
      id: 'p1',
      label: '说明',
      route: '/',
      path: '/docs/README.md',
      start_line: 9,
      end_line: 10,
    }),
    'README.md (9-10)',
  )
  assert.equal(
    chipLabel({
      kind: 'page',
      id: 'p1',
      label: '说明',
      route: '/',
      path: '/docs/README.md',
      start_line: 9,
      end_line: 9,
    }),
    'README.md (9)',
  )
})

test('JSON pick keeps line numbers when text contains quotes and >', () => {
  const text = formatPicks([
    {
      kind: 'text',
      id: 'q1',
      label: 'x',
      route: '/s/a',
      path: '/pages/p000',
      start_line: 4,
      end_line: 6,
      text: '甲 > 乙 "丙"',
      selection: '乙 "丙"',
    },
  ])
  const parsed = parsePicks(text)
  assert.equal(parsed.refs[0]?.start_line, 4)
  assert.equal(parsed.refs[0]?.end_line, 6)
  assert.equal(parsed.refs[0]?.text, '甲 > 乙 "丙"')
  assert.equal(parsed.refs[0]?.selection, '乙 "丙"')
})

test('text pick round-trips markdown source line numbers', () => {
  const text = formatPicks([
    {
      kind: 'text',
      id: 'a1',
      label: '第一段',
      route: '/pages/home',
      path: '/pages/home',
      start_line: 5,
      end_line: 6,
      text: '第一段\n\nUNIQUESEL',
      selection: 'UNIQUESEL',
    },
  ])
  assert.match(text, /"path":"\/pages\/home"/)
  assert.match(text, /"start_line":5/)
  assert.match(text, /"end_line":6/)
  assert.match(text, /"text":"第一段\\n\\nUNIQUESEL"/)
  assert.match(text, /"selection":"UNIQUESEL"/)
  assert.doesNotMatch(text, /"label"/)
  const parsed = parsePicks(text)
  assert.equal(parsed.refs[0]?.start_line, 5)
  assert.equal(parsed.refs[0]?.end_line, 6)
  assert.equal(parsed.refs[0]?.text, '第一段\n\nUNIQUESEL')
  assert.equal(parsed.refs[0]?.selection, 'UNIQUESEL')
  assert.equal(parsed.refs[0]?.path, '/pages/home')
  assert.equal(chipLabel({
    kind: 'text',
    id: 'a1',
    label: '整行',
    route: '/',
    text: '勃，三尺微命，一介书生。',
    selection: '三尺微命',
    start_line: 11,
    path: '/pages/p000',
  }), '三尺微命 (11)')
})

test('caret pick round-trips insert offset in the markdown line', () => {
  const insert = '前 **粗体**'.length
  const text = formatPicks([
    {
      kind: 'text',
      id: 'c1',
      label: 'L1:4',
      route: '/s/abc',
      path: '/pages/p000',
      start_line: 1,
      end_line: 1,
      text: '前 **粗体** 后',
      insert,
    },
  ])
  assert.match(text, new RegExp(`"insert":${insert}`))
  assert.doesNotMatch(text, /"selection"/)
  const parsed = parsePicks(text)
  assert.equal(parsed.refs[0]?.insert, insert)
  assert.equal(parsed.refs[0]?.text, '前 **粗体** 后')
  assert.equal(chipLabel(parsed.refs[0]!), '前 **粗体** 后 (1)')
})

test('text pick with > in source still round-trips as a chip handle', () => {
  const text = formatPicks([
    {
      kind: 'text',
      id: 'gt1',
      label: 'x',
      route: '/s/abc',
      path: '/pages/p000',
      start_line: 3,
      end_line: 5,
      text: '千里逢迎，高朋满座。>\n层峦耸翠',
      selection: '高朋满座',
    },
  ])
  assert.match(text, /"text":"千里逢迎，高朋满座。>\\n层峦耸翠"/)
  const parsed = parsePicks(text)
  assert.equal(parsed.refs.length, 1)
  assert.equal(parsed.refs[0]?.text, '千里逢迎，高朋满座。>\n层峦耸翠')
  assert.equal(parsed.rest, '')
  const parts = splitPickStream(text)
  assert.equal(parts.length, 1)
  assert.equal(parts[0]?.type, 'pick')
})

test('legacy unescaped > inside text attr still parses', () => {
  const raw = '<pick kind="text" id="x" route="/s/a" path="/pages/p000" start_line="3" end_line="5" text="甲 > 乙" />'
  const parsed = parsePicks(raw)
  assert.equal(parsed.refs.length, 1)
  assert.equal(parsed.refs[0]?.text, '甲 > 乙')
})

test('pick text with highlight HTML still becomes one chip', () => {
  const raw =
    '<pick kind="text" id="3c6fe4e9" route="/s/abc" path="/pages/p000" start_line="7" end_line="9" text="**<mark data-color=&quot;color-mix(in srgb, #c4554d 22%, transparent)&quot;>遥襟甫畅</mark>高而北辰远。**" selection="遥襟甫畅" />'
  const parsed = parsePicks(raw)
  assert.equal(parsed.refs.length, 1)
  assert.equal(parsed.refs[0]?.id, '3c6fe4e9')
  assert.match(parsed.refs[0]?.text ?? '', /遥襟甫畅/)
  assert.equal(parsed.refs[0]?.selection, '遥襟甫畅')
  assert.equal(parsed.rest, '')
  const parts = splitPickStream(raw)
  assert.equal(parts[0]?.type, 'pick')
})

test('selected body text becomes a text pick', () => {
  const fake = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => '  这段正文  ',
  }
  const ref = textPickFromSelection('/s/abc', fake)
  assert.ok(ref)
  assert.equal(ref.kind, 'text')
  assert.equal(ref.label, '这段正文')
  assert.equal(ref.route, '/s/abc')
  assert.equal(textPickFromSelection('/', { isCollapsed: true, rangeCount: 1, toString: () => 'x' }), null)
})

test('parsePicks recovers chips that markdown would strip', () => {
  const raw = '<pick kind="task" id="t1" action="open" route="/tasks" label="写需求" />\n看这个'
  const parsed = parsePicks(raw)
  assert.equal(parsed.refs.length, 1)
  assert.equal(parsed.refs[0]?.kind, 'task')
  assert.equal(parsed.refs[0]?.id, 't1')
  assert.equal(parsed.refs[0]?.action, 'open')
  assert.equal(parsed.refs[0]?.label, '写需求')
  assert.equal(parsed.rest, '看这个')
})

function stubBox(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON() {
        return {}
      },
    }) as DOMRect
}

test('marquee selects every kind+id object inside the rect', () => {
  const a = document.createElement('div')
  a.setAttribute('data-biu-kind', 'task')
  a.setAttribute('data-biu-id', 't1')
  a.setAttribute('data-biu-label', '甲')
  const b = document.createElement('div')
  b.setAttribute('data-biu-kind', 'task')
  b.setAttribute('data-biu-id', 't2')
  b.setAttribute('data-biu-label', '乙')
  const outside = document.createElement('div')
  outside.setAttribute('data-biu-kind', 'task')
  outside.setAttribute('data-biu-id', 't3')
  document.body.append(a, b, outside)
  stubBox(a, 10, 10, 40, 20)
  stubBox(b, 60, 12, 40, 20)
  stubBox(outside, 200, 10, 40, 20)
  const hits = resolvePicksInRect({ left: 0, top: 0, width: 120, height: 40 }, '/tasks')
  assert.deepEqual(
    hits.map((item) => item.ref.id).sort(),
    ['t1', 't2'],
  )
  a.remove()
  b.remove()
  outside.remove()
})

test('marquee skips ignored subtrees and inner action buttons', () => {
  const card = document.createElement('div')
  card.setAttribute('data-biu-kind', 'task')
  card.setAttribute('data-biu-id', 't1')
  const btn = document.createElement('button')
  btn.setAttribute('data-biu-action', 'open')
  card.append(btn)
  const ignored = document.createElement('div')
  ignored.setAttribute('data-biu-ignore', '')
  const inner = document.createElement('div')
  inner.setAttribute('data-biu-kind', 'session')
  inner.setAttribute('data-biu-id', 's1')
  ignored.append(inner)
  document.body.append(card, ignored)
  stubBox(card, 0, 0, 80, 40)
  stubBox(btn, 4, 4, 20, 12)
  stubBox(inner, 10, 10, 20, 20)
  const hits = resolvePicksInRect({ left: 0, top: 0, width: 100, height: 50 }, '/')
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.ref.kind, 'task')
  assert.equal(hits[0]?.ref.action, undefined)
  card.remove()
  ignored.remove()
})

test('marquee in the inspector does not take center-pane rows at the same height', () => {
  const center = document.createElement('div')
  center.style.overflow = 'hidden'
  const row = document.createElement('div')
  row.setAttribute('data-biu-kind', 'task')
  row.setAttribute('data-biu-id', 'center-row')
  center.append(row)
  const inspector = document.createElement('div')
  inspector.setAttribute('data-biu-kind', 'task')
  inspector.setAttribute('data-biu-id', 'inspector-row')
  document.body.append(center, inspector)
  stubBox(center, 80, 0, 120, 80)
  stubBox(row, 80, 10, 400, 20)
  stubBox(inspector, 220, 10, 80, 20)
  const hits = resolvePicksInRect({ left: 220, top: 8, width: 60, height: 24 }, '/tasks')
  assert.deepEqual(
    hits.map((item) => item.ref.id),
    ['inspector-row'],
  )
  const vis = visiblePickBox(row)
  assert.ok(vis)
  assert.equal(vis.left, 80)
  assert.equal(vis.width, 120)
  center.remove()
  inspector.remove()
})

test('clicking over the inspector does not pick overflowing center chat', () => {
  const inspector = document.createElement('aside')
  inspector.setAttribute('data-testid', 'session-inspector')
  const chrome = document.createElement('div')
  inspector.append(chrome)
  const chat = document.createElement('div')
  chat.setAttribute('data-biu-kind', 'message')
  chat.setAttribute('data-biu-id', 'm1')
  document.body.append(inspector, chat)
  stubBox(inspector, 220, 0, 200, 400)
  stubBox(chrome, 220, 0, 200, 400)
  stubBox(chat, 0, 10, 480, 40)
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [chat],
  })
  assert.equal(pickSurfaceAtPoint(240, 20), inspector)
  assert.equal(resolvePickAtPoint(240, 20, '/s/abc'), null)
  inspector.remove()
  chat.remove()
})

test('clicking the inspector table does not pick chat stacked underneath', () => {
  const inspector = document.createElement('aside')
  inspector.setAttribute('data-testid', 'session-inspector')
  const pane = document.createElement('div')
  pane.className = 'inspector-stage-pane is-active'
  const row = document.createElement('tr')
  row.setAttribute('data-biu-kind', 'task')
  row.setAttribute('data-biu-id', 't-row')
  pane.append(row)
  inspector.append(pane)
  const chat = document.createElement('div')
  chat.setAttribute('data-biu-kind', 'message')
  chat.setAttribute('data-biu-id', 'm1')
  document.body.append(inspector, chat)
  stubBox(row, 220, 10, 80, 20)
  stubBox(chat, 0, 10, 400, 20)
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [chat, row],
  })
  const hit = resolvePickAtPoint(240, 16, '/tasks')
  assert.equal(hit?.ref.kind, 'task')
  assert.equal(hit?.ref.id, 't-row')
  inspector.remove()
  chat.remove()
})

test('inactive inspector trajectory pane is not pickable', () => {
  const inspector = document.createElement('aside')
  inspector.setAttribute('data-testid', 'session-inspector')
  const hidden = document.createElement('div')
  hidden.className = 'inspector-stage-pane'
  const msg = document.createElement('div')
  msg.setAttribute('data-biu-kind', 'message')
  msg.setAttribute('data-biu-id', 'ghost')
  hidden.append(msg)
  inspector.append(hidden)
  document.body.append(inspector)
  stubBox(msg, 220, 10, 80, 40)
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [msg],
  })
  assert.equal(resolvePickAtPoint(240, 20, '/s/abc'), null)
  inspector.remove()
})

test('marquee scoped to inspector skips center chat', () => {
  const inspector = document.createElement('aside')
  inspector.setAttribute('data-testid', 'session-inspector')
  const row = document.createElement('div')
  row.setAttribute('data-biu-kind', 'task')
  row.setAttribute('data-biu-id', 't-row')
  inspector.append(row)
  const chat = document.createElement('div')
  chat.setAttribute('data-biu-kind', 'message')
  chat.setAttribute('data-biu-id', 'm1')
  document.body.append(inspector, chat)
  stubBox(row, 220, 10, 80, 20)
  stubBox(chat, 220, 10, 80, 20)
  const hits = resolvePicksInRect({ left: 220, top: 8, width: 60, height: 24 }, '/tasks', inspector)
  assert.deepEqual(
    hits.map((item) => item.ref.id),
    ['t-row'],
  )
  inspector.remove()
  chat.remove()
})

test('dedupePicks keeps one chip per kind+id', () => {
  const refs = dedupePicks([
    { kind: 'task', id: 't1', label: '甲', route: '/tasks' },
    { kind: 'task', id: 't1', label: '甲', action: 'open', route: '/tasks' },
    { kind: 'task', id: 't2', label: '乙', route: '/tasks' },
  ])
  assert.equal(refs.length, 2)
  assert.equal(refs[0]?.id, 't1')
  assert.equal(refs[0]?.action, 'open')
  assert.equal(refs[1]?.id, 't2')
})

test('editor paragraphs headings lists and plugin shells are pickable', () => {
  const root = document.createElement('div')
  root.className = 'tiptap'
  const p = document.createElement('p')
  p.textContent = '一段正文'
  const h2 = document.createElement('h2')
  h2.textContent = '小标题'
  const li = document.createElement('li')
  const inner = document.createElement('p')
  inner.textContent = '列表项'
  li.append(inner)
  const ul = document.createElement('ul')
  ul.append(li)
  const img = document.createElement('img')
  img.src = '/api/db/file/cover.png'
  img.alt = '封面'
  const table = document.createElement('table')
  const row = document.createElement('tr')
  const cell = document.createElement('td')
  cell.textContent = '格'
  row.append(cell)
  table.append(row)
  const block = document.createElement('div')
  block.className = 'page-block'
  block.setAttribute('data-page-block', 'html')
  block.setAttribute('data-biu-kind', 'plugin')
  block.setAttribute('data-biu-id', 'page-html-blocks:html')
  block.setAttribute('data-biu-label', 'HTML')
  root.append(p, h2, ul, img, table, block)
  document.body.append(root)
  stubBox(p, 0, 0, 100, 20)
  stubBox(h2, 0, 24, 100, 20)
  stubBox(li, 0, 48, 100, 20)
  stubBox(inner, 0, 48, 100, 20)
  stubBox(img, 0, 72, 100, 20)
  stubBox(table, 0, 96, 100, 20)
  stubBox(cell, 0, 96, 100, 20)
  stubBox(block, 0, 120, 100, 40)
  const fromImg = resolvePickFromNode(img, '/pages/p1')
  assert.equal(fromImg?.ref.kind, 'block')
  const fromTable = resolvePickFromNode(cell, '/pages/p1')
  assert.equal(fromTable?.el.tagName, 'TABLE')
  const fromP = resolvePickFromNode(p, '/pages/p1')
  assert.equal(fromP?.ref.kind, 'block')
  assert.equal(fromP?.ref.label, '一段正文')
  assert.equal(editorBlockElFromNode(inner), li)
  const fromLi = resolvePickFromNode(inner, '/pages/p1')
  assert.equal(fromLi?.ref.kind, 'block')
  assert.equal(fromLi?.ref.label, '列表项')
  const fromPlugin = resolvePickFromNode(block, '/pages/p1')
  assert.equal(fromPlugin?.ref.kind, 'plugin')
  assert.equal(fromPlugin?.ref.id, 'page-html-blocks:html')
  const hits = resolvePicksInRect({ left: 0, top: 0, width: 120, height: 180 }, '/pages/p1', root)
  const kinds = hits.map((item) => item.ref.kind).sort()
  assert.ok(kinds.includes('block'))
  assert.ok(kinds.includes('plugin'))
  root.remove()
})

test('html surface pick carries page path and markdown lines like a block', () => {
  const root = document.createElement('div')
  root.className = 'tiptap'
  const block = document.createElement('div')
  block.className = 'page-block'
  block.setAttribute('data-page-block', 'html')
  block.setAttribute('data-page-block-plugin', 'page-html-blocks')
  block.setAttribute('data-biu-plugin', 'page-html-blocks')
  const card = document.createElement('div')
  card.setAttribute('data-biu-kind', 'html')
  card.setAttribute('data-biu-id', 'html:0-abcd:0/1')
  card.setAttribute('data-biu-label', '静态富排版')
  card.textContent = '静态富排版，不跑脚本'
  block.append(card)
  root.append(block)
  document.body.append(root)
  bindEditorTextHost(root, {
    path: '/pages/p002',
    locusFromSelection: () => null,
    locusFromElement: (el) =>
      el === block || block.contains(el)
        ? { start_line: 14, end_line: 22, text: ':::html\n<div>静态富排版</div>\n:::' }
        : null,
  })
  const hit = resolvePickFromNode(card, '/s/abc')
  assert.ok(hit)
  assert.equal(hit.ref.kind, 'html')
  assert.equal(hit.ref.id, 'html:0-abcd:0/1')
  assert.equal(hit.ref.path, '/pages/p002')
  assert.equal(hit.ref.start_line, 14)
  assert.equal(hit.ref.end_line, 22)
  assert.equal(hit.ref.text, ':::html\n<div>静态富排版</div>\n:::')
  assert.equal(hit.ref.selection, '静态富排版，不跑脚本')
  assert.equal(hit.ref.plugin, 'page-html-blocks')
  assert.match(hit.ref.element ?? '', /静态富排版，不跑脚本/)
  assert.doesNotMatch(hit.ref.element ?? '', /data-biu-kind/)
  const packed = formatPicks([hit.ref])
  assert.match(packed, /"plugin":"page-html-blocks"/)
  assert.match(packed, /"path":"\/pages\/p002"/)
  assert.match(packed, /"start_line":14/)
  assert.match(packed, /"element":/)
  bindEditorTextHost(root, null)
  root.remove()
})

test('html block pick names the inner node even when the host is the plugin shell', () => {
  const root = document.createElement('div')
  root.className = 'tiptap'
  const block = document.createElement('div')
  block.className = 'page-block'
  block.setAttribute('data-page-block', 'html')
  block.setAttribute('data-biu-kind', 'plugin')
  block.setAttribute('data-biu-id', 'page-html-blocks:html')
  block.setAttribute('data-biu-label', 'HTML')
  const title = document.createElement('div')
  title.textContent = '达米恩·查泽雷'
  block.append(title)
  root.append(block)
  document.body.append(root)
  const hit = resolvePickFromNode(title, '/pages/p1')
  assert.ok(hit)
  assert.match(hit.ref.element ?? '', /达米恩·查泽雷/)
  assert.doesNotMatch(hit.ref.element ?? '', /data-biu-kind="plugin"/)
  root.remove()
})
