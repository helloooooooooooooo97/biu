import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { ENABLE_PAGE_BLOCK_PLUGIN, formatPageBlockFence, parsePageBlockData, parsePageBlockMeta, requestEnablePageBlockPlugin } from './page-block-meta.ts'
import { PageBlockMissing } from './page-block-view.tsx'

test('page block fence keeps plugin id in the document', () => {
  assert.deepEqual(parsePageBlockMeta('kind=excalidraw plugin=page-excalidraw'), {
    kind: 'excalidraw',
    plugin: 'page-excalidraw',
    id: '',
    extras: {},
  })
  assert.match(
    formatPageBlockFence('excalidraw', 'page-excalidraw', { file: 'assets/a.json' }, 'ab12cd34'),
    /:::pageBlock \{kind=excalidraw plugin=page-excalidraw id=ab12cd34\}/,
  )
})

test('missing block shows stored source and asks to enable the stored plugin', () => {
  const { container } = render(
    <PageBlockMissing kind="excalidraw" plugin="page-excalidraw" data={{ file: 'assets/a.json' }} />,
  )
  const text = container.textContent ?? ''
  assert.doesNotMatch(text, /未启用「/)
  assert.doesNotMatch(text, /文档里已经存/)
  assert.match(text, /page-excalidraw/)
  assert.doesNotMatch(text, /未运行/)
  assert.doesNotMatch(text, /源码/)
  assert.match(text, /assets\/a\.json/)
  const enable = container.querySelector('[data-testid="page-block-enable"]')
  assert.equal(enable?.getAttribute('aria-label'), '启用')
  assert.ok(enable?.querySelector('svg'))
})

test('html pageBlock fence stores raw html and deck on the header', () => {
  assert.deepEqual(parsePageBlockMeta('kind=html plugin=page-html-blocks deck=true'), {
    kind: 'html',
    plugin: 'page-html-blocks',
    id: '',
    extras: { deck: true },
  })
  const src = formatPageBlockFence('html', 'page-html-blocks', {
    html: '<div style="color:#fff">爱乐之城</div>',
    deck: true,
  })
  assert.match(src, /:::pageBlock \{kind=html plugin=page-html-blocks deck=true\}/)
  assert.match(src, /<div style="color:#fff">爱乐之城<\/div>/)
  assert.doesNotMatch(src, /\\"/)
  assert.doesNotMatch(src, /"html":/)
  assert.deepEqual(parsePageBlockData('html', '<div>裸 HTML</div>', { deck: false }), {
    deck: false,
    html: '<div>裸 HTML</div>',
  })
  assert.equal(parsePageBlockData('html', '{"html":"<p>旧</p>","deck":true}').html, '<p>旧</p>')
  const frame = formatPageBlockFence('htmlframe', 'page-html-blocks', {
    html: '<html></html>',
    deck: false,
    height: 300,
  })
  assert.match(frame, /kind=htmlframe plugin=page-html-blocks deck=false height=300/)
  assert.match(frame, /<html><\/html>/)
  const sized = formatPageBlockFence('html', 'page-html-blocks', {
    html: '<div>卡</div>',
    deck: true,
    width: '100%',
    height: '100vh',
  })
  assert.match(sized, /width=100%/)
  assert.match(sized, /height=100vh/)
  assert.deepEqual(parsePageBlockMeta('kind=html plugin=page-html-blocks id=ab12cd34 deck=true'), {
    kind: 'html',
    plugin: 'page-html-blocks',
    id: 'ab12cd34',
    extras: { deck: true },
  })
})

test('video pageBlock fence stores the tag script, not JSON', () => {
  const src = formatPageBlockFence('video', 'page-video', {
    script: '<timeline fps=30>\n  <track><title dur=1s>Hi</title></track>\n</timeline>',
    clips: [{ kind: 'title' }],
  }, 'viddemo1')
  assert.match(src, /:::pageBlock \{kind=video plugin=page-video id=viddemo1\}/)
  assert.match(src, /<title dur=1s>Hi<\/title>/)
  assert.doesNotMatch(src, /"script":/)
  assert.deepEqual(parsePageBlockData('video', '<timeline fps=24>\n  <track><scene dur=1s>A</scene></track>\n</timeline>'), {
    script: '<timeline fps=24>\n  <track><scene dur=1s>A</scene></track>\n</timeline>',
  })
  assert.match(String(parsePageBlockData('video', '{"script":"<timeline></timeline>"}').script), /<timeline><\/timeline>/)
})

test('html pageBlock fence keeps title on the header', () => {
  const src = formatPageBlockFence('html', 'page-html-blocks', {
    html: '<div>旧</div>',
    title: '海报 HTML',
  }, 'ab12cd34')
  assert.match(src, /title="海报 HTML"/)
  assert.equal(parsePageBlockMeta(src.match(/\{([^}]*)\}/)?.[1] ?? '').extras.title, '海报 HTML')
})

test('enable button only dispatches the stored plugin id', () => {
  const seen: string[] = []
  const onEnable = (event: Event) => {
    seen.push(String((event as CustomEvent<{ plugin?: string }>).detail?.plugin ?? ''))
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  requestEnablePageBlockPlugin('page-excalidraw', 'excalidraw')
  window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  assert.deepEqual(seen, ['page-excalidraw'])
})
