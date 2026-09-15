import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { DEFAULT_CHROME_PATH, type CollectionChrome, type CollectionViewType, type DatabaseUi } from '@biu/type-file-system/ui'
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

test('core-editor paints Content as the default for every file body, and page-blocks overrides it', async () => {
  const ctx = new Context()
  const ui = new FakeDatabaseUi(ctx)
  await ctx.plugin(editorUi)
  assert.deepEqual(ui.paths, [DEFAULT_CHROME_PATH, '/page-blocks'])
  assert.deepEqual(ui.registered, [{ path: '/page-blocks', id: 'blocks', label: '组件' }])
  assert.ok(ctx.pageEditor)
})
