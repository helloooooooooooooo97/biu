import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  buildAppPath,
  centerKindFromRoute,
  isKnownAppPath,
  isLegacyDatabasePath,
  parseAppPath,
  routeFromState,
} from '@biu/web-session-view'
import type { AppModule } from '@biu/web-app-modules'

const plugins: AppModule[] = [
  { id: 'tasks', label: 'Tasks', path: '/tasks' },
  { id: 'extra', label: 'Extra', path: '/extra' },
  { id: 'database', label: '数据', path: '/database' },
]

test('parseAppPath covers home, session, and registered plugin modules', () => {
  assert.deepEqual(parseAppPath('/'), { kind: 'home' })
  assert.deepEqual(parseAppPath('/s/abc'), { kind: 'session', sessionId: 'abc', view: 'chat' })
  assert.deepEqual(parseAppPath('/s/abc/debug'), {
    kind: 'session',
    sessionId: 'abc',
    view: 'debug',
  })
  assert.deepEqual(parseAppPath('/extra', plugins), {
    kind: 'module',
    moduleId: 'extra',
    path: '/extra',
  })
  assert.deepEqual(parseAppPath('/tasks', plugins), { kind: 'module', moduleId: 'tasks', path: '/tasks' })
  assert.deepEqual(parseAppPath('/unknown'), { kind: 'home' })
  assert.deepEqual(parseAppPath('/tasks'), { kind: 'home' })
  assert.deepEqual(parseAppPath('/database', plugins), { kind: 'module', moduleId: 'database', path: '/database' })
  assert.deepEqual(parseAppPath('/share/tok'), { kind: 'share', token: 'tok' })
  assert.deepEqual(parseAppPath('/share/tok/r/p001'), { kind: 'share', token: 'tok', recordId: 'p001' })
  assert.equal(isKnownAppPath('/share/tok'), true)
})

test('database nested routes identify view vs record without touching /s/:id', () => {
  assert.deepEqual(parseAppPath('/database/pages', plugins), {
    kind: 'collection-view',
    moduleId: 'database',
    path: '/database',
    collection: '/pages',
    viewId: undefined,
  })
  assert.deepEqual(parseAppPath('/database/pages/view/default', plugins), {
    kind: 'collection-view',
    moduleId: 'database',
    path: '/database',
    collection: '/pages',
    viewId: 'default',
  })
  assert.deepEqual(parseAppPath('/database/pages/record/rec-1', plugins), {
    kind: 'record',
    moduleId: 'database',
    path: '/database',
    collection: '/pages',
    recordId: 'rec-1',
  })
  assert.deepEqual(parseAppPath('/database/pages/view/board/record/rec-1', plugins), {
    kind: 'record',
    moduleId: 'database',
    path: '/database',
    collection: '/pages',
    viewId: 'board',
    recordId: 'rec-1',
  })
  assert.deepEqual(parseAppPath('/database/c/pages/v/board/r/rec-1', plugins), {
    kind: 'record',
    moduleId: 'database',
    path: '/database',
    collection: '/pages',
    viewId: 'board',
    recordId: 'rec-1',
  })
  assert.equal(isLegacyDatabasePath('/database/c/pages/v/x'), true)
  assert.equal(isLegacyDatabasePath('/database/pages/view/board/record/rec-1'), false)
  assert.equal(isLegacyDatabasePath('/database/pages/view/x'), false)
  assert.equal(isLegacyDatabasePath('/database/pages/record/rec-1'), false)
  assert.equal(
    buildAppPath({
      kind: 'record',
      moduleId: 'database',
      path: '/database',
      collection: '/tasks',
      viewId: 'board',
      recordId: 'task_mtdbgnqj_5022je',
    }),
    '/database/tasks/view/board/record/task_mtdbgnqj_5022je',
  )
  assert.equal(
    buildAppPath({
      kind: 'record',
      moduleId: 'database',
      path: '/database',
      collection: '/tasks',
      recordId: 'task_mtdbgnqj_5022je',
    }),
    '/database/tasks/record/task_mtdbgnqj_5022je',
  )
  assert.equal(parseAppPath('/s/rec-1', plugins).kind, 'session')
})

test('isKnownAppPath only accepts builtins plus registered plugin paths', () => {
  assert.equal(isKnownAppPath('/'), true)
  assert.equal(isKnownAppPath('/extra'), false)
  assert.equal(isKnownAppPath('/extra', plugins), true)
  assert.equal(isKnownAppPath('/tasks', plugins), true)
  assert.equal(isKnownAppPath('/workspace'), false)
  assert.equal(isKnownAppPath('/s/abc'), true)
  assert.equal(isKnownAppPath('/unknown'), false)
  assert.equal(isKnownAppPath('/database/pages/view/x', plugins), true)
})

test('buildAppPath round-trips with parseAppPath', () => {
  const routes = [
    { kind: 'home' as const },
    { kind: 'session' as const, sessionId: 's1', view: 'chat' as const },
    { kind: 'session' as const, sessionId: 's1', view: 'debug' as const },
    { kind: 'module' as const, moduleId: 'extra' as const, path: '/extra' },
    { kind: 'module' as const, moduleId: 'tasks' as const, path: '/tasks' },
    {
      kind: 'collection-view' as const,
      moduleId: 'database' as const,
      path: '/database',
      collection: '/pages',
      viewId: 'v1',
    },
    {
      kind: 'record' as const,
      moduleId: 'database' as const,
      path: '/database',
      collection: '/pages',
      viewId: 'board',
      recordId: 'r1',
    },
    {
      kind: 'record' as const,
      moduleId: 'database' as const,
      path: '/database',
      collection: '/pages',
      recordId: 'r1',
    },
  ]
  for (const route of routes) {
    assert.deepEqual(parseAppPath(buildAppPath(route), plugins), route)
  }
})

test('centerKindFromRoute follows the center pane', () => {
  assert.equal(centerKindFromRoute({ kind: 'home' }), 'session')
  assert.equal(centerKindFromRoute({ kind: 'session', sessionId: 'a', view: 'chat' }), 'session')
  assert.equal(centerKindFromRoute({ kind: 'module', moduleId: 'tasks', path: '/tasks' }), 'task')
  assert.equal(centerKindFromRoute({ kind: 'module', moduleId: 'extra', path: '/extra' }), 'module')
  assert.equal(
    centerKindFromRoute({
      kind: 'collection-view',
      moduleId: 'database',
      path: '/database',
      collection: '/pages',
    }),
    'collection-view',
  )
  assert.equal(
    centerKindFromRoute({
      kind: 'record',
      moduleId: 'database',
      path: '/database',
      collection: '/pages',
      recordId: 'r1',
    }),
    'record',
  )
})

test('routeFromState maps sessionView fields', () => {
  assert.deepEqual(routeFromState(null, 'chat'), { kind: 'home' })
  assert.deepEqual(routeFromState('x', 'debug'), {
    kind: 'session',
    sessionId: 'x',
    view: 'debug',
  })
})
