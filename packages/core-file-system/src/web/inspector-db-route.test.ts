import { beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { databaseAllViewPath, databaseRecordPath } from './database-path.ts'
import {
  getInspectorDbPath,
  isInspectorDatabasePath,
  setInspectorDbPath,
  resetInspectorDbPathMemory,
  focusInspectorIfOpen,
  showRecordInInspector,
  showInInspector,
  applyDatabaseReveal,
  applyDatabaseChannelPayload,
  isInspectorAgentWorking,
  setInspectorAgentWorking,
  isInspectorAgentFollow,
  setInspectorAgentFollow,
  clearInspectorDbPath,
  isInspectorPaneAbandoned,
  snapshotInspectorDbPaths,
  restoreInspectorDbPaths,
  inspectorPageKey,
  reuseInspectorOfferPane,
} from './inspector-db-route.ts'

function clearInspectorPanes() {
  resetInspectorDbPathMemory()
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('inspector.dbPath:')) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
}

beforeEach(() => {
  clearInspectorPanes()
  setInspectorAgentFollow(false)
})

test('inspector database path is set explicitly', () => {
  setInspectorDbPath('')
  setInspectorDbPath('/database/pages')
  assert.equal(getInspectorDbPath(), '/database/pages')
  setInspectorDbPath('/database/tasks')
  assert.equal(getInspectorDbPath(), '/database/tasks')
})

test('chat routes are not inspector database paths', () => {
  setInspectorDbPath('')
  assert.equal(isInspectorDatabasePath('/s/abc'), false)
  assert.equal(isInspectorDatabasePath('/database/pages'), true)
  setInspectorDbPath('/s/abc')
  assert.equal(getInspectorDbPath(), '')
  setInspectorDbPath('/database/pages')
  assert.equal(getInspectorDbPath(), '/database/pages')
})

test('each inspector database pane keeps its own path', () => {
  setInspectorDbPath('database::a', '/database/pages')
  setInspectorDbPath('database::b', '/database/tasks')
  assert.equal(getInspectorDbPath('database::a'), '/database/pages')
  assert.equal(getInspectorDbPath('database::b'), '/database/tasks')
})

test('inspector pane path stays in memory until restored from session bind', () => {
  const pane = 'database:/sessions'
  setInspectorDbPath(pane, '/database/sessions/view/mine')
  assert.equal(getInspectorDbPath(pane), '/database/sessions/view/mine')
  resetInspectorDbPathMemory()
  assert.equal(getInspectorDbPath(pane), '')
  restoreInspectorDbPaths({ [pane]: '/database/sessions/record/s1?view=mine' })
  assert.equal(getInspectorDbPath(pane), '/database/sessions/record/s1?view=mine')
})

test('window reveal event opens the inspector record path', async () => {
  const tabs: string[] = []
  const onTab = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail === 'string') tabs.push(detail)
  }
  window.addEventListener('biu:inspector-tab', onTab)
  const opened = new Promise<void>((resolve) => {
    window.addEventListener('biu:inspector-open', () => resolve(), { once: true })
  })
  window.dispatchEvent(
    new CustomEvent('biu:inspector-reveal', { detail: { collection: '/pages', recordId: 'from-search' } }),
  )
  await opened
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/from-search')
  assert.deepEqual(tabs, ['database:/pages'])
  window.removeEventListener('biu:inspector-tab', onTab)
})

test('showRecordInInspector focuses an already-open pane for the same page', () => {
  const pane = 'database:/pages::abc123'
  setInspectorDbPath(pane, '/database/pages/record/p1?view=all')
  showRecordInInspector('/pages', 'p1')
  assert.equal(getInspectorDbPath(pane), '/database/pages/record/p1')
  assert.equal(getInspectorDbPath('database:/pages'), '')
})

test('showRecordInInspector reuses the collection pane instead of opening a second copy of the page', () => {
  setInspectorDbPath('database:/pages', databaseAllViewPath('/pages'))
  showRecordInInspector('/pages', 'p-new')
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/p-new')
  const extra = Object.keys(snapshotInspectorDbPaths()).filter((id) => id.startsWith('database:/pages::'))
  assert.equal(extra.length, 0)
})

test('opening a page from the all-pages list then navigating that pane still keeps one tab', () => {
  setInspectorDbPath('database:/pages', databaseAllViewPath('/pages'))
  showRecordInInspector('/pages', 'same-page')
  setInspectorDbPath('database:/pages', databaseRecordPath('/pages', 'same-page', 'builtin-all:/pages'))
  assert.equal(Object.keys(snapshotInspectorDbPaths()).filter((id) => id.startsWith('database:/pages')).length, 1)
})

test('showRecordInInspector opens the inspector on this record', async () => {
  const tabs: string[] = []
  const onTab = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail === 'string') tabs.push(detail)
  }
  window.addEventListener('biu:inspector-tab', onTab)
  const opened = new Promise<void>((resolve) => {
    window.addEventListener('biu:inspector-open', () => resolve(), { once: true })
  })
  showRecordInInspector('/pages', 'p1')
  await opened
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/p1')
  assert.deepEqual(tabs, ['database:/pages'])
  window.removeEventListener('biu:inspector-tab', onTab)
})

test('duplicate inspector panes for the same data page collapse to one', () => {
  const closed: string[] = []
  const onClosed = (event: Event) => {
    const id = (event as CustomEvent).detail
    if (typeof id === 'string') closed.push(id)
  }
  window.addEventListener('biu:inspector-pane-closed', onClosed)
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  setInspectorDbPath('database:/pages::dup', '/database/pages/record/p1?view=all')
  assert.equal(getInspectorDbPath('database:/pages::dup'), '/database/pages/record/p1?view=all')
  assert.equal(getInspectorDbPath('database:/pages'), '')
  assert.deepEqual(closed, ['database:/pages'])
  assert.equal(isInspectorPaneAbandoned('database:/pages'), true)
  window.removeEventListener('biu:inspector-pane-closed', onClosed)
})

test('a leftover canonical list path does not swallow a newly opened list pane', () => {
  setInspectorDbPath('database:/pages', databaseAllViewPath('/pages'))
  const live = 'database:/pages::live'
  setInspectorDbPath(live, databaseAllViewPath('/pages'))
  assert.equal(getInspectorDbPath(live), databaseAllViewPath('/pages'))
  assert.equal(getInspectorDbPath('database:/pages'), '')
})

test('opening a collection list keeps an already-open record pane', () => {
  setInspectorDbPath('database:/pages::doc', '/database/pages/record/p1')
  showInInspector('/pages', databaseAllViewPath('/pages'), { unique: true })
  assert.equal(getInspectorDbPath('database:/pages::doc'), '/database/pages/record/p1')
  const lists = Object.entries(snapshotInspectorDbPaths()).filter(([, path]) => !path.includes('/record/'))
  assert.equal(lists.length, 1)
  assert.equal(lists[0]![1], databaseAllViewPath('/pages'))
  assert.notEqual(lists[0]![0], 'database:/pages::doc')
})

test('plus offer reuses the default collection pane instead of opening another', () => {
  setInspectorDbPath('database:/pages', databaseAllViewPath('/pages'))
  assert.equal(reuseInspectorOfferPane('database:/pages', ['database:/pages', 'traj']), 'database:/pages')
  assert.equal(reuseInspectorOfferPane('database:/pages', ['database:/pages::x']), 'database:/pages::x')
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  assert.equal(reuseInspectorOfferPane('database:/pages', ['database:/pages']), undefined)
  clearInspectorDbPath('database:/pages::empty')
  assert.equal(reuseInspectorOfferPane('database:/pages', ['database:/pages::empty']), undefined)
})

test('showInInspector does not copy the same href onto every collection pane', () => {
  setInspectorDbPath('database:/notes', '/database/notes/record/n1')
  setInspectorDbPath('database:/notes::b', '/database/notes/record/n2')
  showInInspector('/notes', '/database/notes/record/n3')
  assert.equal(getInspectorDbPath('database:/notes'), '/database/notes/record/n3')
  assert.equal(getInspectorDbPath('database:/notes::b'), '/database/notes/record/n2')
})

test('inspectorPageKey ignores view query', () => {
  assert.equal(inspectorPageKey('/database/pages/record/p1?view=all'), '/database/pages/record/p1')
})

test('inspectorPageKey treats the same record leaf as one page even with a view in the path', () => {
  assert.equal(
    inspectorPageKey('/database/pages/view/all/record/p1'),
    inspectorPageKey('/database/pages/record/p1'),
  )
})

test('opening the same record leaf with a view path focuses the existing pane', () => {
  const tabs: string[] = []
  const onTab = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail === 'string') tabs.push(detail)
  }
  window.addEventListener('biu:inspector-tab', onTab)
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  showInInspector('/pages', '/database/pages/view/all/record/p1', { unique: true })
  assert.equal(Object.keys(snapshotInspectorDbPaths()).length, 1)
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/view/all/record/p1')
  assert.deepEqual(tabs, ['database:/pages'])
  window.removeEventListener('biu:inspector-tab', onTab)
})

test('duplicate panes for the same record leaf collapse and keep the canonical tab', () => {
  const tabs: string[] = []
  const onTab = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail === 'string') tabs.push(detail)
  }
  window.addEventListener('biu:inspector-tab', onTab)
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  showInInspector('/pages', '/database/pages/record/p1', { unique: true })
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/p1')
  assert.equal(Object.keys(snapshotInspectorDbPaths()).filter((id) => id.startsWith('database:/pages')).length, 1)
  assert.equal(tabs.at(-1), 'database:/pages')
  window.removeEventListener('biu:inspector-tab', onTab)
})

test('unique inspector reveal focuses the same page and opens a new pane for a different page', () => {
  setInspectorDbPath('database:/notes', '/database/notes/record/n1')
  showInInspector('/notes', '/database/notes/record/n1?view=all', { unique: true })
  assert.equal(getInspectorDbPath('database:/notes'), '/database/notes/record/n1?view=all')
  showInInspector('/notes', '/database/notes/record/n2', { unique: true })
  assert.equal(getInspectorDbPath('database:/notes'), '/database/notes/record/n1?view=all')
  const extra = Object.keys(snapshotInspectorDbPaths()).filter((id) => id.startsWith('database:/notes::'))
  assert.equal(extra.length, 1)
  assert.equal(getInspectorDbPath(extra[0]!), '/database/notes/record/n2')
})

test('focusInspectorIfOpen only focuses when that page is already in the inspector', () => {
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  assert.equal(focusInspectorIfOpen('/pages', '/database/pages/record/p1?view=all'), true)
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/p1?view=all')
  assert.equal(focusInspectorIfOpen('/pages', '/database/pages/record/p2'), false)
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/p1?view=all')
})

test('closing an inspector pane removes the stored path so it is no longer considered open', () => {
  setInspectorDbPath('database:/pages', '/database/pages/record/p1')
  clearInspectorDbPath('database:/pages')
  assert.equal(getInspectorDbPath('database:/pages'), '')
  assert.equal(isInspectorPaneAbandoned('database:/pages'), true)
  assert.equal(localStorage.getItem('inspector.dbPath:database:/pages'), null)
  assert.equal(focusInspectorIfOpen('/pages', '/database/pages/record/p1'), false)
  window.dispatchEvent(new CustomEvent('biu:inspector-pane-closed', { detail: 'database:/pages::old' }))
  setInspectorDbPath('database:/pages::old', '/database/pages/record/p2')
  window.dispatchEvent(new CustomEvent('biu:inspector-pane-closed', { detail: 'database:/pages::old' }))
  assert.equal(getInspectorDbPath('database:/pages::old'), '')
})

test('showInInspector opens a collection href in the inspector', async () => {
  const tabs: string[] = []
  const onTab = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail === 'string') tabs.push(detail)
  }
  window.addEventListener('biu:inspector-tab', onTab)
  const opened = new Promise<void>((resolve) => {
    window.addEventListener('biu:inspector-open', () => resolve(), { once: true })
  })
  showInInspector('/facets', '/database/facets/view/builtin-all:/facets?facetId=dp')
  await opened
  assert.equal(getInspectorDbPath('database:/facets'), '/database/facets/view/builtin-all:/facets?facetId=dp')
  assert.deepEqual(tabs, ['database:/facets'])
  window.removeEventListener('biu:inspector-tab', onTab)
})

test('applyDatabaseReveal opens the table, or the record when an id is present', () => {
  applyDatabaseReveal({ collection: '/tasks' })
  assert.equal(getInspectorDbPath('database:/tasks'), databaseAllViewPath('/tasks'))
  applyDatabaseReveal({ collection: '/tasks', recordId: 't9' })
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks/record/t9')
  applyDatabaseReveal({ collection: '/' })
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks/record/t9')
})

test('applyDatabaseChannelPayload marks the table as agent-working until done', () => {
  setInspectorAgentWorking('/tasks', false)
  applyDatabaseChannelPayload(
    { phase: 'working', sessionId: 'main', reveal: { collection: '/tasks' } },
    'main',
  )
  assert.equal(isInspectorAgentWorking('/tasks'), true)
  applyDatabaseChannelPayload(
    { phase: 'done', sessionId: 'main', reveal: { collection: '/tasks', recordId: 't1' } },
    'main',
  )
  assert.equal(isInspectorAgentWorking('/tasks'), false)
  assert.equal(getInspectorDbPath('database:/tasks'), '')
})

test('applyDatabaseChannelPayload emits content-jump on done', () => {
  const seen: unknown[] = []
  const onJump = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:content-jump', onJump)
  applyDatabaseChannelPayload(
    {
      phase: 'working',
      sessionId: 'main',
      reveal: { collection: '/pages', recordId: 'home' },
      contentJump: { path: '/pages/home', start_line: 8, end_line: 10 },
    },
    'main',
  )
  assert.equal(seen.length, 0)
  applyDatabaseChannelPayload(
    {
      phase: 'done',
      sessionId: 'main',
      reveal: { collection: '/pages', recordId: 'home' },
      contentJump: { path: '/pages/home', start_line: 8, end_line: 10 },
    },
    'main',
  )
  window.removeEventListener('biu:content-jump', onJump)
  assert.deepEqual(seen, [{ path: '/pages/home', start_line: 8, end_line: 10 }])
})

test('content-jump still fires when the live session does not match', () => {
  const seen: unknown[] = []
  const onJump = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:content-jump', onJump)
  applyDatabaseChannelPayload(
    {
      phase: 'done',
      sessionId: 'other',
      reveal: { collection: '/pages', recordId: 'home' },
      contentJump: { path: '/pages/home', start_line: 2, end_line: 2 },
    },
    'main',
  )
  window.removeEventListener('biu:content-jump', onJump)
  assert.deepEqual(seen, [{ path: '/pages/home', start_line: 2, end_line: 2 }])
})

test('agent channel does not open inspector views unless follow is on', () => {
  setInspectorDbPath('database:/pages', '/database/pages')
  applyDatabaseChannelPayload(
    { phase: 'working', sessionId: 'main', reveal: { collection: '/tasks', recordId: 't1' } },
    'main',
  )
  assert.equal(getInspectorDbPath('database:/tasks'), '')
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages')
  setInspectorAgentFollow(true)
  assert.equal(isInspectorAgentFollow(), true)
  applyDatabaseChannelPayload(
    { phase: 'done', sessionId: 'main', reveal: { collection: '/tasks', recordId: 't1' } },
    'main',
  )
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks/record/t1')
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages')
})

test('applyDatabaseChannelPayload ignores other sessions and unsigned broadcasts', () => {
  setInspectorDbPath('database:/tasks', '/database/tasks')
  setInspectorAgentWorking('/tasks', false)
  applyDatabaseChannelPayload(
    { phase: 'working', sessionId: 'other', reveal: { collection: '/tasks', recordId: 'x' } },
    'main',
  )
  applyDatabaseChannelPayload({ phase: 'working', reveal: { collection: '/tasks', recordId: 'y' } }, 'main')
  applyDatabaseChannelPayload(
    { phase: 'working', sessionId: 'main', reveal: { collection: '/tasks', recordId: 'z' } },
    null,
  )
  assert.equal(isInspectorAgentWorking('/tasks'), false)
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks')
})

test('applyDatabaseReveal opens a saved view when viewId is present', () => {
  applyDatabaseReveal({ collection: '/tasks', viewId: 'board-1' })
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks/view/board-1')
})

test('applyDatabaseChannelPayload upserts a created view then opens it', () => {
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
      key: (index: number) => Object.keys(mem)[index] ?? null,
      get length() {
        return Object.keys(mem).length
      },
    },
  })
  applyDatabaseChannelPayload(
    {
      phase: 'done',
      sessionId: 'main',
      reveal: { collection: '/tasks', viewId: 'board-1' },
      savedView: { id: 'board-1', name: '看板', mode: 'board', filters: { status: 'doing' } },
    },
    'main',
  )
  assert.equal(getInspectorDbPath('database:/tasks'), '')
  setInspectorAgentFollow(true)
  applyDatabaseChannelPayload(
    {
      phase: 'done',
      sessionId: 'main',
      reveal: { collection: '/tasks', viewId: 'board-1' },
      savedView: { id: 'board-1', name: '看板', mode: 'board', filters: { status: 'doing' } },
    },
    'main',
  )
  assert.equal(getInspectorDbPath('database:/tasks'), '/database/tasks/view/board-1')
  assert.equal(isInspectorAgentWorking('/tasks'), false)
  const stored = JSON.parse(mem['fsdb.views:/tasks'] ?? '[]') as Array<{ id: string; name: string; mode: string; filters?: Record<string, string> }>
  assert.equal(stored[0]?.id, 'board-1')
  assert.equal(stored[0]?.name, '看板')
  assert.equal(stored[0]?.mode, 'table')
  assert.equal(stored[0]?.filters?.status, 'doing')
})

test('view db_update writes the source table view, not /views', () => {
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
      key: (index: number) => Object.keys(mem)[index] ?? null,
      get length() {
        return Object.keys(mem).length
      },
    },
  })
  const seen: Array<{ collection?: string; view?: { id?: string } }> = []
  const onSaved = (event: Event) => {
    seen.push((event as CustomEvent<{ collection?: string; view?: { id?: string } }>).detail)
  }
  window.addEventListener('fsdb:saved-view', onSaved)
  applyDatabaseChannelPayload(
    {
      phase: 'done',
      sessionId: 'other',
      reveal: { collection: '/views', recordId: 'pages::mine' },
      savedView: { id: 'mine', tablePath: '/pages', name: '我的', filters: { project: 'biu' } },
    },
    'main',
  )
  window.removeEventListener('fsdb:saved-view', onSaved)
  assert.equal(mem['fsdb.views:/views'], undefined)
  const stored = JSON.parse(mem['fsdb.views:/pages'] ?? '[]') as Array<{ id: string; filters?: Record<string, string> }>
  assert.equal(stored[0]?.id, 'mine')
  assert.equal(stored[0]?.filters?.project, 'biu')
  assert.equal(seen[0]?.collection, '/pages')
  assert.equal(seen[0]?.view?.id, 'mine')
  assert.equal(getInspectorDbPath('database:/pages'), '')
})

test('inspector db paths restore replaces the global pane map', () => {
  setInspectorDbPath('database:/pages', '/database/pages')
  setInspectorDbPath('database:/tasks', '/database/tasks')
  assert.equal(snapshotInspectorDbPaths()['database:/pages'], '/database/pages')
  restoreInspectorDbPaths({ 'database:/sessions': '/database/sessions' })
  assert.equal(getInspectorDbPath('database:/pages'), '')
  assert.equal(getInspectorDbPath('database:/tasks'), '')
  assert.equal(getInspectorDbPath('database:/sessions'), '/database/sessions')
  restoreInspectorDbPaths({})
  assert.equal(getInspectorDbPath('database:/sessions'), '')
  assert.deepEqual(snapshotInspectorDbPaths(), {})
})
