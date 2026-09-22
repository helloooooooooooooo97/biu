import { render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { PageEditor } from './page-editor.tsx'
import { PageEditorService } from './service.ts'

test('page editor paints markdown headings without a chrome toolbar', async () => {
  const { container, rerender } = render(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={'# 欢迎\n\n正文'}
      writable
    />,
  )
  await waitFor(() => {
    assert.ok(container.querySelector('[data-testid="page-editor"]'))
  })
  assert.equal(container.querySelector('h1')?.textContent?.trim(), '欢迎')
  assert.match(container.textContent ?? '', /正文/)
  rerender(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={'# 欢迎\n\n正文\n'}
      writable
    />,
  )
  assert.equal(container.querySelector('h1')?.textContent?.trim(), '欢迎')
})

test('heading plugin skins native h1 and does not install a node view', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.replaceHeading(1, { label: 'H1', className: 'page-heading-card' })
  const { container } = render(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={'# 欢迎'}
      writable
    />,
  )
  await waitFor(() => {
    assert.ok(container.querySelector('h1[data-heading-plugin="1"]'))
  })
  const heading = container.querySelector('h1[data-heading-plugin="1"]')
  assert.equal(heading?.textContent?.trim(), '欢迎')
  assert.equal(heading?.classList.contains('page-heading-card'), true)
  assert.equal(container.querySelector('[data-node-view-wrapper]'), null)
})

test('page editor paints a registered algorithm block', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'algorithm',
    plugin: 'page-algorithm',
    label: '算法题',
    defaults: { title: 'Two Sum' },
    View: ({ data }) => <div data-testid="algo-view">{String(data.title ?? '')}</div>,
  })
  const src = `:::pageBlock {kind=algorithm}
{"title":"Two Sum"}
:::
`
  const { container } = render(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={src}
      writable
    />,
  )
  await waitFor(() => {
    assert.ok(container.querySelector('[data-testid="algo-view"]'))
  })
  assert.equal(container.querySelector('[data-testid="algo-view"]')?.textContent, 'Two Sum')
})

test('page editor hydrates markdown after content fetch', async () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'algorithm',
    plugin: 'page-algorithm',
    label: '算法题',
    defaults: { title: 'Two Sum' },
    View: ({ data }) => <div data-testid="algo-view">{String(data.title ?? '')}</div>,
  })
  const src = `:::pageBlock {kind=algorithm}
{"title":"Two Sum"}
:::

一段正文
`
  const { container, rerender } = render(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={null}
      writable
    />,
  )
  await waitFor(() => {
    assert.ok(container.querySelector('[data-testid="page-editor"]'))
  })
  assert.equal(container.querySelector('[data-testid="algo-view"]'), null)
  rerender(
    <PageEditor
      record={{ id: 'home' }}
      field="notes"
      spec={{ type: 'file', label: '正文', writable: true }}
      value={src}
      writable
    />,
  )
  await waitFor(() => {
    assert.ok(container.querySelector('[data-testid="algo-view"]'))
  })
  assert.equal(container.querySelector('[data-testid="algo-view"]')?.textContent, 'Two Sum')
  assert.match(container.textContent ?? '', /一段正文/)
})

test('page editor applies later value when it is not focused', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './page-editor.tsx'), 'utf8')
  assert.match(src, /shouldApplyRemoteMarkdown/)
  assert.match(src, /recentlyLocal/)
  assert.match(src, /contentJumpForRecord/)
  assert.match(src, /editorHostIsLive\(editor\)/)
  assert.doesNotMatch(src, /if \(editor\.isFocused && !contentJumpForRecord\(record\.id\)\) return/)
  assert.match(src, /md === saved\.current/)
  assert.match(src, /leavingSource/)
  assert.match(src, /sourceMode\.current/)
})

