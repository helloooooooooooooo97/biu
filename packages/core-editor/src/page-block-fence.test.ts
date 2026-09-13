import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  listPageBlockFences,
  pageBlockData,
  pageBlockRecordId,
  parsePageBlockRecordId,
  patchPageBlockMarkdown,
  uniquifyPageBlockMarkdown,
  defaultPageBlockTitle,
} from './page-block-fence.ts'

const doc = `前言

:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34 deck=true}
<div>旧</div>
:::

中间

:::pageBlock {kind=excalidraw plugin=page-excalidraw id=ef90ab12}
{"file":"assets/board.json"}
:::
`

test('listPageBlockFences reads id kind plugin and body', () => {
  const fences = listPageBlockFences(doc)
  assert.equal(fences.length, 2)
  assert.equal(fences[0]?.id, 'ab12cd34')
  assert.equal(fences[0]?.kind, 'html')
  assert.equal(pageBlockData(fences[0]!).html, '<div>旧</div>')
  assert.equal(pageBlockData(fences[0]!).deck, true)
  assert.equal(fences[1]?.id, 'ef90ab12')
  assert.equal(pageBlockData(fences[1]!).file, 'assets/board.json')
})

test('patchPageBlockMarkdown merges attrs of one id and leaves the rest', () => {
  const next = patchPageBlockMarkdown(doc, 'ab12cd34', { data: { html: '<div>新</div>', deck: false } })
  assert.match(next, /id=ab12cd34 deck=false/)
  assert.match(next, /<div>新<\/div>/)
  assert.match(next, /id=ef90ab12/)
  assert.match(next, /assets\/board.json/)
  assert.match(next, /前言/)
})

test('patchPageBlockMarkdown can replace data and change plugin', () => {
  const next = patchPageBlockMarkdown(doc, 'ef90ab12', {
    plugin: 'page-excalidraw',
    replace: true,
    data: { file: 'assets/other.json' },
  })
  assert.match(next, /id=ef90ab12/)
  assert.match(next, /"file": "assets\/other.json"/)
  assert.doesNotMatch(next, /board.json/)
})

test('patchPageBlockMarkdown rejects missing or duplicate ids', () => {
  assert.throws(() => patchPageBlockMarkdown(doc, 'nope', { data: {} }), /unknown pageBlock/)
  const dup = `:::pageBlock {kind=html id=ab12cd34}\na\n:::\n\n:::pageBlock {kind=html id=ab12cd34}\nb\n:::\n`
  assert.throws(() => patchPageBlockMarkdown(dup, 'ab12cd34', { data: { html: 'x' } }), /not unique/)
})

test('html fence with inline styles still yields the poster html', () => {
  const md = `:::pageBlock {kind=html plugin=page-html-blocks id=d6ac31a5}
<div style="box-sizing:border-box;height:100%;width:100%;overflow:hidden;position:relative;background:linear-gradient(170deg,#f3ecd8 0%,#eadfc2 100%)">
<div style="position:absolute;left:26px;top:22px">番附</div>
</div>
:::
`
  const fences = listPageBlockFences(md)
  assert.equal(fences.length, 1)
  assert.equal(fences[0]?.kind, 'html')
  assert.match(String(pageBlockData(fences[0]!).html), /番附/)
  assert.match(String(pageBlockData(fences[0]!).html), /height:100%/)
})

test('uniquifyPageBlockMarkdown keeps the first id and rewrites duplicates', () => {
  const dup = `:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34}
<div>a</div>
:::

:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34}
<div>b</div>
:::
`
  const next = uniquifyPageBlockMarkdown(dup)
  assert.equal(next.changed, true)
  const ids = listPageBlockFences(next.markdown).map((item) => item.id)
  assert.equal(ids.length, 2)
  assert.equal(ids[0], 'ab12cd34')
  assert.notEqual(ids[1], ids[0])
  assert.match(ids[1]!, /^[a-z0-9]{8}$/i)
  assert.equal(uniquifyPageBlockMarkdown(next.markdown).changed, false)
})

test('pageBlock record id is page::block', () => {
  assert.equal(pageBlockRecordId('p001', 'ab12cd34'), 'p001::ab12cd34')
  assert.deepEqual(parsePageBlockRecordId('p001::ab12cd34'), { pageId: 'p001', blockId: 'ab12cd34' })
  assert.equal(parsePageBlockRecordId('p001'), null)
})

test('default page block title is page name plus kind label', () => {
  assert.equal(defaultPageBlockTitle('海报', 'HTML'), '海报 HTML')
  assert.equal(defaultPageBlockTitle('', '画板'), '画板')
  assert.equal(defaultPageBlockTitle('海报', ''), '海报')
})
