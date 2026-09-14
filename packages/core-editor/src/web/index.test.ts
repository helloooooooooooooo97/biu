import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import type { CollectionChrome, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import * as editorUi from './index.ts'
import { PageEditor } from './page-editor.tsx'

class FakeDatabaseUi extends Service implements DatabaseUi {
  paths: string[] = []
  registered: Array<{ path: string; id: string; label: string }> = []
  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
  }
  decorate(path: string, chrome: CollectionChrome) {
    this.paths.push(path)
    if (path === '/page-blocks') {
      assert.ok(chrome.Content)
      assert.notEqual(chrome.Content, PageEditor)
      return { dispose() {} }
    }
    assert.equal(chrome.Content, PageEditor)
    assert.ok(chrome.DetailTools)
    if (path === '/pages') assert.ok(chrome.DetailHeader)
    return { dispose() {} }
  }
  registerView(path: string, view: CollectionViewType) {
    this.registered.push({ path, id: view.id, label: view.label })
    return { dispose() {} }
  }
  registerRowView() {
    return { dispose() {} }
  }
  chrome() {
    return {}
  }
  views() {
    return []
  }
  rowViews() {
    return []
  }
  subscribe() {
    return () => undefined
  }
}

test('core-editor paints Content on pages, tasks, plugins, facets and page-blocks, not sessions', async () => {
  const ctx = new Context()
  const ui = new FakeDatabaseUi(ctx)
  await ctx.plugin(editorUi)
  assert.deepEqual(ui.paths, ['/pages', '/tasks', '/plugins', '/facets', '/page-blocks'])
  assert.deepEqual(ui.registered, [{ path: '/page-blocks', id: 'blocks', label: '组件' }])
  assert.ok(ctx.pageEditor)
})
