import { render } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import { PageEditorService } from './service.ts'
import { parsePageBlockRowData, PageBlocksView, PageBlockContent, openSourcePage, pageLabelOf } from './page-blocks-view.tsx'

test('parsePageBlockRowData reads json string or object', () => {
  assert.deepEqual(parsePageBlockRowData('{"html":"<p>a</p>"}'), { html: '<p>a</p>' })
  assert.deepEqual(parsePageBlockRowData({ html: '<p>b</p>' }), { html: '<p>b</p>' })
  assert.deepEqual(parsePageBlockRowData(''), {})
})

test('page-blocks view paints the registered block View', () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: 'page-html-blocks',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-ui">{String(data.html ?? '')}</div>,
  })
  const { container } = render(
    <PageBlocksView
      path="/page-blocks"
      rows={[
        { id: 'p1::a1', title: '刊头', pageId: 'p1', pageTitle: '首页', blockKind: 'html', plugin: 'page-html-blocks', data: '{"html":"<b>hi</b>"}' },
        { id: 'p1::a2', title: '缺插件', blockKind: 'gone', plugin: 'missing-plugin', data: '{}' },
      ]}
      onOpen={() => undefined}
    />,
  )
  assert.equal(container.querySelector('[data-testid="html-ui"]')?.textContent, '<b>hi</b>')
  assert.equal(container.querySelector('[data-testid="html-ui"]')?.getAttribute('data-biu-plugin'), 'page-html-blocks')
  assert.ok(container.querySelector('[data-testid="page-block-missing"]'))
  assert.equal(container.querySelector('[data-testid="page-blocks-view-page"]')?.textContent, '首页')
  assert.ok(container.querySelector('[data-testid="page-blocks-view-zoom"]'))
})

test('gallery page chip names the source page', () => {
  assert.equal(pageLabelOf({ id: 'p1::a', pageId: 'p1', pageTitle: '首页' }), '首页')
  assert.equal(pageLabelOf({ id: 'p1::a', pageId: 'p1' }), 'p1')
})

test('opening the source page reveals /pages in the inspector', () => {
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  openSourcePage('p1')
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/pages', recordId: 'p1', unique: true }])
})

test('component gallery can scroll inside the collection stage', () => {
  const css = readFileSync(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(css, /\.page-blocks-view\{[^}]*min-height:0/)
  assert.match(css, /\.page-blocks-view\{[^}]*overflow:auto/)
  assert.match(css, /\.page-blocks-view-head\{[^}]*display:flex/)
  assert.match(css, /\.page-blocks-view-meta\{[^}]*margin-left:auto/)
})

test('gallery block writes notify other surfaces', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-blocks-view.tsx'), 'utf8')
  assert.match(src, /window.dispatchEvent\(new Event\('fsdb:change'\)\)/)
  assert.match(src, /bindPageBlockPlugin/)
})

test('page-block detail content paints the registered View', () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: 'page-html-blocks',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-detail">{String(data.html ?? '')}</div>,
  })
  const { container } = render(
    <PageBlockContent
      record={{ id: 'p1::a1', title: '刊头', blockKind: 'html', plugin: 'page-html-blocks' }}
      field="data"
      spec={{ type: 'string', writable: true }}
      value={{ html: '<i>detail</i>' }}
      writable
    />,
  )
  assert.ok(container.querySelector('[data-testid="page-blocks-detail"]'))
  assert.equal(container.querySelector('[data-testid="html-detail"]')?.textContent, '<i>detail</i>')
})
