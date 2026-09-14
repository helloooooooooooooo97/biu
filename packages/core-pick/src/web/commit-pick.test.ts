import { test } from 'vitest'
import assert from 'node:assert/strict'
import { picksOnPointerUp } from './commit-pick.ts'
import type { PickRef } from './types.ts'

const inner: PickRef = {
  kind: 'html',
  id: 'html:0-d981a47f:0/0/2',
  label: '从民歌运动到流媒体时代 · 半世纪的声音地图',
  route: '/p/p002',
  plugin: 'page-html-blocks',
  element: '<div>从民歌运动到流媒体时代</div>',
}

const blockText: PickRef = {
  kind: 'text',
  id: 'fence',
  label: '整块围栏',
  route: '/p/p002',
  text: ':::pageBlock {kind=html plugin=page-html-blocks}\n<div>整页</div>\n:::',
  selection: '从民歌运动到流媒体时代 · 半世纪的声音地图\n其它段落',
}

function hit(ref: PickRef): { el: HTMLElement; ref: PickRef } {
  return { el: document.createElement('div'), ref }
}

test('click keeps the hovered html node even when the editor selected the whole block', () => {
  const added = picksOnPointerUp({
    hover: hit(inner),
    point: hit({ ...inner, id: 'html:0-d981a47f:root', label: '整块根' }),
    text: blockText,
  })
  assert.equal(added.length, 1)
  assert.equal(added[0]?.kind, 'html')
  assert.equal(added[0]?.id, 'html:0-d981a47f:0/0/2')
  assert.equal(added[0]?.label, inner.label)
})

test('click without hover still prefers the html node under the pointer over block text', () => {
  const added = picksOnPointerUp({
    hover: null,
    point: hit(inner),
    text: blockText,
  })
  assert.equal(added[0]?.id, inner.id)
})

test('a real text selection still wins when the hover is a normal editor block', () => {
  const para: PickRef = { kind: 'block', id: 'p:1', label: '一段正文', route: '/p/p002' }
  const added = picksOnPointerUp({
    hover: hit(para),
    point: hit(para),
    text: { kind: 'text', id: 'sel', label: '一段', route: '/p/p002', selection: '一段' },
  })
  assert.equal(added[0]?.kind, 'text')
  assert.equal(added[0]?.id, 'sel')
})

test('box select keeps rect hits', () => {
  const added = picksOnPointerUp({
    boxed: true,
    boxHits: [inner],
    hover: hit(inner),
    point: hit(inner),
    text: blockText,
  })
  assert.deepEqual(added, [inner])
})
