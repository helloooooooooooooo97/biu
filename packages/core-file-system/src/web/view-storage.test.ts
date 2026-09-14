import { test } from 'vitest'
import assert from 'node:assert/strict'
import { builtinAllView, builtinAllViewId, builtinCatalogViewId } from '../catalog-views.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
  defaultViewId,
  loadRecords,
  persistViewDisplay,
  rememberRecords,
  savedViewFromRecord,
  toggleStarredRecord,
  isRecordStarred,
  viewDisplayKey,
  viewForPath,
  withViewDisplay,
} from './view-storage.ts'

test('views collection still resolves catalog stubs from the route', () => {
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, 'builtin:/events')?.filters.tablePath, '/events')
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, builtinCatalogViewId('/events'))?.id, builtinCatalogViewId('/events'))
  assert.equal(viewForPath('/page-blocks', 'builtin-block:terminal')?.filters.blockKind, 'terminal')
})

test('tables default to the builtin 全部xx view', () => {
  assert.equal(defaultViewId('/sessions'), builtinAllViewId('/sessions'))
  assert.equal(defaultViewId(VIEWS_COLLECTION_PATH), builtinAllViewId(VIEWS_COLLECTION_PATH))
  assert.equal(viewForPath('/sessions')?.builtin, true)
  assert.deepEqual(viewForPath('/sessions')?.filters, {})
  assert.equal(viewForPath('/pages', builtinAllViewId('/sessions'))?.id, builtinAllViewId('/pages'))
})

test('builtin view wrap is stored as display prefs and restored', () => {
  const mem: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => mem[key] ?? null,
    setItem: (key: string, value: string) => {
      mem[key] = value
    },
    removeItem: (key: string) => {
      delete mem[key]
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  const path = '/sessions'
  const id = builtinAllViewId(path)
  persistViewDisplay(path, id, { wrap: true, truncate: false })
  assert.equal(mem[viewDisplayKey(path, id)]?.includes('"wrap":true'), true)
  const painted = withViewDisplay(path, builtinAllView({ path, label: '会话', view: { title: '会话' } }))
  assert.equal(painted.wrap, true)
  assert.equal(painted.truncate, false)
  assert.equal(painted.builtin, true)
  assert.equal(painted.name, '全部会话')
  assert.equal(viewForPath(path)?.wrap, true)
})

test('builtin view columns overlay survives withViewDisplay', () => {
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  const path = '/sessions'
  const id = builtinAllViewId(path)
  persistViewDisplay(path, id, { columns: ['title', 'project'] })
  assert.deepEqual(withViewDisplay(path, builtinAllView({ path, label: '会话', view: { title: '会话' } })).columns, [
    'title',
    'project',
  ])
})

test('savedViewFromRecord skips builtin rows and keeps filters', () => {
  assert.equal(savedViewFromRecord({ viewId: builtinAllViewId('/tasks'), title: '全部' }), null)
  const view = savedViewFromRecord({
    viewId: 'v1',
    title: '看板',
    mode: 'board',
    sortField: 'dueAt',
    filters: '{"status":"doing"}',
    columns: ['title'],
  })
  assert.equal(view?.id, 'v1')
  assert.equal(view?.mode, 'table')
  assert.equal(view?.filters.status, 'doing')
  const withSorts = savedViewFromRecord({
    viewId: 'v3',
    title: '排序',
    sorts: '[{"field":"project","dir":"desc"}]',
    filters: '{"project":"biu"}',
  })
  assert.equal(withSorts?.sortField, 'project')
  assert.equal(withSorts?.sortDir, 'desc')
  assert.equal(withSorts?.filterTree?.children[0] && withSorts.filterTree.children[0].kind === 'rule' && withSorts.filterTree.children[0].value, 'biu')
  const withWidths = savedViewFromRecord({
    viewId: 'v2',
    title: '宽列',
    mode: 'table',
    columnWidths: { title: 240 },
  })
  assert.equal(withWidths?.columnWidths?.title, 240)
})

test('rememberRecords keeps titles when another inspector page overwrites the same collection', () => {
  rememberRecords('/pages', [{ id: 'home', label: '首页' }], 'mine')
  rememberRecords('/pages', [{ id: 'draft', label: 'draft' }, { id: 'home', label: 'home' }], 'mine')
  const listed = loadRecords('/pages', 'mine')
  assert.equal(listed.find((row) => row.id === 'home')?.label, '首页')
  assert.equal(listed.find((row) => row.id === 'draft')?.label, 'draft')
})

test('rememberRecords scopes crumb rows to the current view', () => {
  rememberRecords('/pages', [{ id: 'home', label: '首页' }, { id: 'notes', label: '笔记' }], 'all')
  rememberRecords('/tasks', [{ id: 't1', label: '任务甲' }], 'board')
  rememberRecords('/pages', [{ id: 'home', label: '首页' }], 'mine')
  assert.deepEqual(
    loadRecords('/pages', 'mine').map((row) => row.id),
    ['home'],
  )
  assert.deepEqual(
    loadRecords('/pages', 'all').map((row) => row.id),
    ['home', 'notes'],
  )
  assert.equal(loadRecords('/pages', 'mine').some((row) => row.id === 't1'), false)
  assert.equal(loadRecords('/pages', 'all').some((row) => row.id === 't1'), false)
})

test('starred records toggle by collection path and id', () => {
  const next = toggleStarredRecord([], '/pages', 'home', { label: '首页' })
  assert.equal(isRecordStarred(next, '/pages', 'home'), true)
  assert.equal(next[0]?.label, '首页')
  assert.equal(isRecordStarred(next, '/tasks', 'home'), false)
  assert.equal(isRecordStarred(toggleStarredRecord(next, '/pages', 'home'), '/pages', 'home'), false)
})
