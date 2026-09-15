import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  builtinAllView,
  builtinAllViewId,
  builtinBlockKindViewId,
  builtinCatalogViewId,
  builtinCatalogViews,
  isBuiltinBlockKindViewId,
  isBuiltinCatalogViewId,
  isReadOnlyViewId,
  mergeCatalogViews,
  mergePageBlockViews,
  mergeTableViews,
  catalogLockFilters,
  stubBuiltinAllView,
  stubBuiltinBlockKindView,
  isBuiltinAllViewForCollection,
  stubBuiltinCatalogView,
  catalogRowOpenTarget,
  displayNameForView,
  builtinTagViewId,
  isBuiltinTagViewId,
  stampRowOpenTarget,
} from './catalog-views.ts'

test('each registered table gets a builtin catalog view', () => {
  const tables = [
    { id: 'views', path: '/views', kind: 'collection' as const, label: '视图', view: { moduleId: 'views-db', route: '/db-views', title: '视图' } },
    { id: 'pages', path: '/pages', kind: 'collection' as const, label: '页面', view: { moduleId: 'page', route: '/pages', title: '页面' } },
    { id: 'tasks', path: '/tasks', kind: 'collection' as const, label: '任务', view: { moduleId: 'tasks', route: '/tasks', title: '任务' } },
  ]
  const listed = builtinCatalogViews(tables)
  assert.equal(listed.length, 3)
  assert.equal(listed[1]?.id, builtinCatalogViewId('/pages'))
  assert.equal(listed[1]?.name, '页面')
  assert.deepEqual(listed[1]?.filters, { tablePath: '/pages' })
  assert.equal(listed[1]?.builtin, true)
  const merged = mergeCatalogViews(tables, [
    { id: builtinCatalogViewId('/pages'), name: '旧的', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'user-1', name: '周报', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(merged[0]?.id, builtinAllViewId('/views'))
  assert.equal(merged[0]?.name, '全部视图')
  assert.equal(merged.filter((view) => view.builtin).length, 4)
  assert.equal(merged.some((view) => view.id === 'user-1'), true)
  assert.equal(merged.filter((view) => view.id === builtinCatalogViewId('/pages')).length, 1)
})

test('stub builtin catalog view from route id', () => {
  const stub = stubBuiltinCatalogView('builtin:/drawings')
  assert.equal(stub?.builtin, true)
  assert.deepEqual(stub?.filters, { tablePath: '/drawings' })
  assert.equal(stubBuiltinCatalogView('user-1'), null)
  assert.equal(isBuiltinCatalogViewId('builtin-all:/sessions'), false)
  assert.equal(stubBuiltinCatalogView('builtin-all:/sessions'), null)
})

test('builtin all view ids belong to one collection', () => {
  assert.equal(isBuiltinAllViewForCollection('builtin-all:/sessions', '/sessions'), true)
  assert.equal(isBuiltinAllViewForCollection('builtin-all:/sessions', '/pages'), false)
  assert.equal(isBuiltinAllViewForCollection('mine', '/sessions'), false)
})

test('every registered table gets a read-only 全部xx view', () => {
  const sessions = { id: 'sessions', path: '/sessions', kind: 'collection' as const, label: '会话', view: { title: '会话' } }
  const all = builtinAllView(sessions)
  assert.equal(all.id, builtinAllViewId('/sessions'))
  assert.equal(all.name, '全部会话')
  assert.deepEqual(all.filters, {})
  assert.equal(all.builtin, true)
  const merged = mergeTableViews(sessions, [
    { id: builtinAllViewId('/sessions'), name: '假的', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(merged[0]?.name, '全部会话')
  assert.equal(merged.filter((view) => view.id === builtinAllViewId('/sessions')).length, 1)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
  assert.equal(stubBuiltinAllView('builtin-all:/pages')?.name, '全部pages')
})

test('builtin share titles use collection Chinese names instead of path ids', () => {
  const pages = { path: '/pages', label: '页面', view: { title: '页面' } }
  assert.equal(displayNameForView(builtinAllViewId('/pages'), pages), '全部页面')
  assert.equal(displayNameForView(builtinAllViewId('/sessions'), { path: '/sessions', label: '会话', view: { title: '会话' } }), '全部会话')
  assert.equal(displayNameForView(builtinAllViewId('/mcp'), { path: '/mcp', label: 'MCP', view: { title: 'MCP' } }), '全部MCP')
  assert.equal(displayNameForView(builtinAllViewId('/page-blocks'), { path: '/page-blocks', label: '组件', view: { title: '组件' } }), '全部组件')
  assert.equal(displayNameForView('mine', pages, '周报'), '周报')
})

test('catalog view rows open the source table view instead of a record pane', () => {
  assert.deepEqual(catalogRowOpenTarget({ tablePath: '/plugins', viewId: builtinAllViewId('/plugins') }), {
    collection: '/plugins',
    viewId: builtinAllViewId('/plugins'),
  })
  assert.equal(catalogRowOpenTarget({ tablePath: '', viewId: 'x' }), null)
  assert.equal(catalogRowOpenTarget({ tablePath: '/events' }), null)
})

test('tags collection uses the same view list as other tables', () => {
  assert.equal(isBuiltinTagViewId(builtinTagViewId('dp')), true)
  assert.equal(isBuiltinCatalogViewId(builtinTagViewId('dp')), false)
  const table = { path: '/facets', label: '合集', view: { title: '合集' } }
  const merged = mergeTableViews(table, [{ id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] }])
  assert.equal(merged[0]?.id, builtinAllViewId('/facets'))
  assert.equal(merged[0]?.name, '全部合集')
  assert.equal(merged.some((view) => isBuiltinTagViewId(view.id)), false)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
})

test('stamp rows open the source record, not a tag view', () => {
  assert.deepEqual(stampRowOpenTarget({ tablePath: '/pages', sourceId: 'home' }), {
    collection: '/pages',
    recordId: 'home',
  })
  assert.equal(stampRowOpenTarget({ tablePath: '', sourceId: 'home' }), null)
})

test('builtin all views are read-only', () => {
  assert.equal(isReadOnlyViewId(builtinAllViewId('/sessions')), true)
  assert.equal(isReadOnlyViewId('user-traj'), false)
})

test('each registered page block kind gets a builtin view', () => {
  const table = { path: '/page-blocks', label: '组件', view: { title: '组件' } }
  const merged = mergePageBlockViews(
    table,
    [
      { kind: 'excalidraw', label: '画板' },
      { kind: 'html', label: 'HTML' },
      { kind: 'html', label: '重复' },
      { kind: '', label: '空' },
    ],
    [
      { id: builtinBlockKindViewId('html'), name: '旧的', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
      { id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    ],
  )
  assert.equal(merged[0]?.id, builtinAllViewId('/page-blocks'))
  assert.equal(merged[0]?.name, '全部组件')
  assert.equal(merged[1]?.id, builtinBlockKindViewId('excalidraw'))
  assert.equal(merged[1]?.name, '画板')
  assert.deepEqual(merged[1]?.filters, { blockKind: 'excalidraw' })
  assert.equal(merged[1]?.builtin, true)
  assert.equal(merged[2]?.id, builtinBlockKindViewId('html'))
  assert.equal(merged[2]?.name, 'HTML')
  assert.equal(merged.filter((view) => view.id === builtinBlockKindViewId('html')).length, 1)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
  assert.equal(isReadOnlyViewId(builtinBlockKindViewId('html')), true)
  assert.equal(isBuiltinCatalogViewId(builtinBlockKindViewId('html')), false)
  assert.equal(isBuiltinBlockKindViewId(builtinBlockKindViewId('algorithm')), true)
  assert.equal(stubBuiltinBlockKindView('builtin-block:html')?.filters.blockKind, 'html')
  assert.equal(stubBuiltinBlockKindView('user-1'), null)
  assert.deepEqual(catalogLockFilters('builtin-block:terminal', []), { blockKind: 'terminal' })
  assert.deepEqual(
    catalogLockFilters('builtin-block:terminal', [{ id: 'builtin-block:terminal', builtin: true, filters: {} }]),
    { blockKind: 'terminal' },
  )
  assert.deepEqual(catalogLockFilters('mine', [{ id: 'mine', builtin: false, filters: { blockKind: 'html' } }]), {})
})
