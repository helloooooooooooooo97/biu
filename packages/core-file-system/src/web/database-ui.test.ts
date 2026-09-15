import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { DEFAULT_CHROME_PATH } from '@biu/type-file-system/ui'
import { DatabaseUiService, normalizeCollectionPath } from './database-ui.ts'

test('normalizeCollectionPath strips trailing slash', () => {
  assert.equal(normalizeCollectionPath('/plugins/'), '/plugins')
  assert.equal(normalizeCollectionPath('plugins'), '/plugins')
})

test('decorate merges cells; later layer wins; dispose restores', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const NameA = () => null
  const NameB = () => null
  const Tags = () => null
  const first = ui.decorate('/plugins', { cells: { name: NameA, tags: Tags } })
  const second = ui.decorate('/plugins', { cells: { name: NameB } })
  assert.equal(ui.chrome('/plugins').cells?.name, NameB)
  assert.equal(ui.chrome('/plugins').cells?.tags, Tags)
  first.dispose()
  assert.equal(ui.chrome('/plugins').cells?.name, NameB)
  assert.equal(ui.chrome('/plugins').cells?.tags, undefined)
  second.dispose()
  assert.equal(ui.chrome('/plugins').cells?.name, undefined)
})

test('decorate merges DetailTools; later layer wins', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const First = () => null
  const Second = () => null
  ui.decorate('/pages', { DetailTools: First })
  assert.equal(ui.chrome('/pages').DetailTools, First)
  ui.decorate('/pages', { DetailTools: Second })
  assert.equal(ui.chrome('/pages').DetailTools, Second)
})

test('decorate merges Actions; later layer wins', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const First = () => null
  const Second = () => null
  ui.decorate('/plugins', { Actions: First })
  assert.equal(ui.chrome('/plugins').Actions, First)
  ui.decorate('/plugins', { Actions: Second })
  assert.equal(ui.chrome('/plugins').Actions, Second)
})

test('decorate keeps Icon as the record mark, later layer wins', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const IconA = () => null
  const IconB = () => null
  ui.decorate('/sessions', { Icon: IconA })
  assert.equal(ui.chrome('/sessions').Icon, IconA)
  ui.decorate('/sessions', { Icon: IconB })
  assert.equal(ui.chrome('/sessions').Icon, IconB)
})

test('decorate notifies subscribers', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  let n = 0
  const off = ui.subscribe(() => {
    n += 1
  })
  const handle = ui.decorate('/pages', { cells: {} })
  assert.equal(n, 1)
  handle.dispose()
  assert.equal(n, 2)
  off()
})

test('decorate panes with the same id keep a single pane', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const PaneA = () => null
  const PaneB = () => null
  ui.decorate('/tasks', { panes: [{ id: 'script', label: '脚本 A', Pane: PaneA }] })
  ui.decorate('/tasks', { panes: [{ id: 'script', label: '脚本 B', Pane: PaneB }] })
  const panes = ui.chrome('/tasks').panes ?? []
  assert.equal(panes.length, 1)
  assert.equal(panes[0]?.label, '脚本 B')
  assert.equal(panes[0]?.Pane, PaneB)
})

test('default chrome applies to every table and a later table layer wins', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const DefaultContent = () => null
  const OverrideContent = () => null
  const DefaultTools = () => null
  ui.decorate(DEFAULT_CHROME_PATH, { Content: DefaultContent, DetailTools: DefaultTools })
  assert.equal(ui.chrome('/skills').Content, DefaultContent)
  assert.equal(ui.chrome('/mcp').Content, DefaultContent)
  assert.equal(ui.chrome('/skills').DetailTools, DefaultTools)
  ui.decorate('/skills', { Content: OverrideContent })
  assert.equal(ui.chrome('/skills').Content, OverrideContent)
  assert.equal(ui.chrome('/mcp').Content, DefaultContent)
})

test('registerView is scoped to the collection that registered it', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const Graph = () => null
  const first = ui.registerView('/tasks', { id: 'graph', label: '依赖图', View: Graph })
  assert.equal(ui.views('/tasks').length, 1)
  assert.equal(ui.views('/tasks')[0]?.id, 'graph')
  assert.equal(ui.views('/plugins').length, 0)
  const later = ui.registerView('/tasks', { id: 'graph', label: 'DAG', View: Graph })
  assert.equal(ui.views('/tasks').length, 1)
  assert.equal(ui.views('/tasks')[0]?.label, 'DAG')
  later.dispose()
  assert.equal(ui.views('/tasks')[0]?.label, '依赖图')
  first.dispose()
  assert.equal(ui.views('/tasks').length, 0)
})

test('registerRowView merges star path with the collection', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  const Card = () => null
  const Task = () => null
  ui.registerRowView('*', { id: 'card', label: '卡片', Row: Card })
  ui.registerRowView('/tasks', { id: 'task-card', label: '任务卡', Row: Task })
  ui.registerRowView('/plugins', { id: 'plugin-card', label: '插件卡', Row: Card })
  assert.equal(ui.rowViews('/tasks').map((item) => item.id).join(','), 'card,task-card')
  assert.equal(ui.rowViews('/plugins').map((item) => item.id).join(','), 'card,plugin-card')
  const later = ui.registerRowView('/tasks', { id: 'card', label: '任务默认卡', Row: Task })
  assert.equal(ui.rowViews('/tasks').find((item) => item.id === 'card')?.label, '任务默认卡')
  later.dispose()
  assert.equal(ui.rowViews('/tasks').find((item) => item.id === 'card')?.label, '卡片')
})

test('refresh notifies chrome subscribers', () => {
  const ctx = new Context()
  const ui = new DatabaseUiService(ctx)
  let n = 0
  ui.subscribe(() => {
    n += 1
  })
  ui.refresh()
  assert.equal(n, 1)
})
