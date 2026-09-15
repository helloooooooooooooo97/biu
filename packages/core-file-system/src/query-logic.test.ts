import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  collectQueryFields,
  countFilterRules,
  emptyFilterGroup,
  emptyFilterRule,
  encodeListFilter,
  filterTreeStateKey,
  flatFiltersToTree,
  matchFilterNode,
  matchListFilterRecord,
  normalizeSorts,
  parseSortsInput,
  resolveViewFilterTree,
  moveList,
  sortRecordsBy,
} from './query-logic.ts'

test('legacy flat filters become an AND tree', () => {
  const tree = flatFiltersToTree({ status: 'open', '': '', $skip: 'x' })
  assert.equal(tree.combinator, 'and')
  assert.equal(tree.children.length, 1)
  assert.equal(tree.children[0] && tree.children[0].kind === 'rule' && tree.children[0].value, 'open')
})

test('query fields include active sorts and valued filters', () => {
  const group = emptyFilterGroup()
  group.children.push({ kind: 'rule', id: 'r', field: 'status', op: 'eq', value: 'open' })
  group.children.push(emptyFilterRule('title'))
  const keys = collectQueryFields([{ field: 'due' }], group)
  assert.equal(keys.has('status'), true)
  assert.equal(keys.has('due'), true)
  assert.equal(keys.has('title'), false)
})

test('empty rules do not count until they have a value', () => {
  const group = emptyFilterGroup()
  group.children.push(emptyFilterRule('title'))
  assert.equal(countFilterRules(group), 0)
  if (group.children[0]?.kind === 'rule') group.children[0].value = 'hi'
  assert.equal(countFilterRules(group), 1)
})

test('OR group matches either side', () => {
  const group = emptyFilterGroup()
  group.combinator = 'or'
  group.children = [
    { kind: 'rule', id: 'a', field: 'title', op: 'contains', value: '甲' },
    { kind: 'rule', id: 'b', field: 'title', op: 'contains', value: '乙' },
  ]
  assert.equal(matchFilterNode({ id: '1', title: '甲页' }, group), true)
  assert.equal(matchFilterNode({ id: '2', title: '乙页' }, group), true)
  assert.equal(matchFilterNode({ id: '3', title: '丙' }, group), false)
})

test('encodeListFilter keeps locks and drops empty trees', () => {
  const empty = encodeListFilter({ tablePath: '/pages' }, emptyFilterGroup())
  assert.equal(empty.tablePath, '/pages')
  assert.equal('$tree' in empty, false)
  const tree = emptyFilterGroup()
  tree.children.push({ kind: 'rule', id: 'r', field: 'title', op: 'contains', value: 'x' })
  assert.equal(Boolean(encodeListFilter({}, tree).$tree), true)
})

test('list filter still supports equality locks plus a tree', () => {
  const tree = emptyFilterGroup()
  tree.children.push({ kind: 'rule', id: 'r', field: 'title', op: 'contains', value: '页' })
  const row = { id: '1', title: '页面', status: 'open' }
  assert.equal(matchListFilterRecord(row, { status: 'open', $tree: tree }), true)
  assert.equal(matchListFilterRecord(row, { status: 'done', $tree: tree }), false)
})

test('multi-key sorts apply in order', () => {
  const rows = [
    { id: '2', title: 'b', n: 1 },
    { id: '1', title: 'a', n: 2 },
    { id: '3', title: 'a', n: 1 },
  ]
  const sorted = sortRecordsBy(rows, [
    { id: 's1', field: 'title', dir: 'asc' },
    { id: 's2', field: 'n', dir: 'asc' },
  ])
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['3', '1', '2'],
  )
})

test('moveList reorders without mutating', () => {
  const src = ['a', 'b', 'c']
  assert.deepEqual(moveList(src, 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(src, ['a', 'b', 'c'])
  assert.deepEqual(moveList(src, 2, 0), ['c', 'a', 'b'])
})

test('normalizeSorts falls back to a single field', () => {
  const sorts = normalizeSorts(undefined, 'dueAt', 'desc')
  assert.equal(sorts.length, 1)
  assert.equal(sorts[0]?.field, 'dueAt')
  assert.equal(sorts[0]?.dir, 'desc')
})

test('empty filterTree falls back to flat filters from the agent', () => {
  const empty = emptyFilterGroup()
  const tree = resolveViewFilterTree({ filters: { project: 'biu' }, filterTree: empty })
  assert.equal(countFilterRules(tree), 1)
  assert.equal(tree.children[0] && tree.children[0].kind === 'rule' && tree.children[0].field, 'project')
  assert.equal(tree.children[0] && tree.children[0].kind === 'rule' && tree.children[0].value, 'biu')
})

test('filterTreeStateKey ignores node ids and treats empty as absent', () => {
  const a = emptyFilterGroup()
  const b = emptyFilterGroup()
  assert.equal(filterTreeStateKey(a), filterTreeStateKey(b))
  assert.equal(filterTreeStateKey(a), filterTreeStateKey(undefined))
  a.children.push({ kind: 'rule', id: 'r1', field: 'tags', op: 'eq', value: 'test' })
  b.children.push({ kind: 'rule', id: 'r2', field: 'tags', op: 'eq', value: 'test' })
  assert.equal(filterTreeStateKey(a), filterTreeStateKey(b))
})

test('parseSortsInput accepts JSON strings', () => {
  const sorts = parseSortsInput('[{"field":"project","dir":"desc"}]')
  assert.equal(sorts[0]?.field, 'project')
  assert.equal(sorts[0]?.dir, 'desc')
})

