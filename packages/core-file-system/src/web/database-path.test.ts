import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseAppPath } from '@biu/web-session-view'
import { DATA_MODULE, databaseAllViewPath, databaseRecordPath, databaseViewPath, isRecordTreeCollection, isSystemCollection, sortDataCollections, viewsCatalogSource } from './database-path.ts'

const plugins = [DATA_MODULE]

test('view and record helpers match the database URL scheme', () => {
  assert.equal(databaseViewPath('/pages', 'default'), '/database/pages/view/default')
  assert.equal(databaseViewPath('/sessions'), '/database/sessions')
  assert.equal(databaseRecordPath('/pages', 'rec-1'), '/database/pages/record/rec-1')
  assert.equal(databaseRecordPath('/pages', 'rec-1', 'board'), '/database/pages/view/board/record/rec-1')
  assert.equal(parseAppPath(databaseViewPath('/pages', 'default'), plugins).kind, 'collection-view')
  assert.equal(parseAppPath(databaseViewPath('/sessions'), plugins).kind, 'collection-view')
  assert.equal(parseAppPath(databaseRecordPath('/pages', 'rec-1'), plugins).kind, 'record')
  const nested = parseAppPath(databaseRecordPath('/pages', 'rec-1', 'board'), plugins)
  assert.equal(nested.kind, 'record')
  if (nested.kind === 'record') assert.equal(nested.viewId, 'board')
})

test('builtin all-view helpers keep the database URL scheme', () => {
  assert.equal(
    databaseAllViewPath('/sessions'),
    `/database/sessions/view/${encodeURIComponent('builtin-all:/sessions')}`,
  )
  assert.equal(
    databaseAllViewPath('/tasks'),
    `/database/tasks/view/${encodeURIComponent('builtin-all:/tasks')}`,
  )
  assert.equal(
    databaseAllViewPath('/pages'),
    `/database/pages/view/${encodeURIComponent('builtin-all:/pages')}`,
  )
  assert.equal(
    databaseAllViewPath('/plugins'),
    `/database/plugins/view/${encodeURIComponent('builtin-all:/plugins')}`,
  )
  const parsed = parseAppPath(databaseAllViewPath('/sessions'), plugins)
  assert.equal(parsed.kind, 'collection-view')
  if (parsed.kind === 'collection-view') {
    assert.equal(parsed.collection, '/sessions')
    assert.equal(parsed.viewId, 'builtin-all:/sessions')
  }
})

test('table path without view still parses as a collection-view URL', () => {
  const parsed = parseAppPath(databaseViewPath('/tasks'), plugins)
  assert.equal(parsed.kind, 'collection-view')
  if (parsed.kind === 'collection-view') {
    assert.equal(parsed.collection, '/tasks')
    assert.equal(parsed.viewId, undefined)
  }
})

test('only pages and tasks nest records in the data sidebar', () => {
  assert.equal(isRecordTreeCollection('/pages'), true)
  assert.equal(isRecordTreeCollection('/pages/'), true)
  assert.equal(isRecordTreeCollection('/tasks'), true)
  assert.equal(isRecordTreeCollection('/sessions'), false)
  assert.equal(isRecordTreeCollection('/page-blocks'), false)
  assert.equal(isRecordTreeCollection('/plugins'), false)
})

test('views catalog source is a query filter', () => {
  assert.equal(viewsCatalogSource('?source=%2Fevents'), '/events')
  assert.equal(viewsCatalogSource(''), '')
})

test('views and events are system collections; tags sort with user tables', () => {
  assert.equal(isSystemCollection('/views'), true)
  assert.equal(isSystemCollection('/facets'), false)
  assert.equal(isSystemCollection('/events'), true)
  assert.equal(isSystemCollection('/notices'), true)
  assert.equal(isSystemCollection('/trash'), false)
  assert.equal(isSystemCollection('/sessions'), false)
  const { user, system } = sortDataCollections([
    { path: '/events' },
    { path: '/plugins' },
    { path: '/views' },
    { path: '/notices' },
    { path: '/trash' },
    { path: '/facets' },
    { path: '/sessions' },
    { path: '/pages' },
    { path: '/page-blocks' },
    { path: '/tasks' },
  ])
  assert.deepEqual(
    user.map((item) => item.path),
    ['/sessions', '/tasks', '/pages', '/page-blocks', '/plugins', '/facets', '/trash'],
  )
  assert.deepEqual(
    system.map((item) => item.path),
    ['/views', '/events', '/notices'],
  )
})
