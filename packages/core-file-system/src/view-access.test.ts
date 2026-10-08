import assert from 'node:assert/strict'
import { test } from 'vitest'
import { builtinScopeViewId } from './catalog-views.ts'
import { highestViewRole, recordMatchesGrantedView } from './view-access.ts'

test('a view grant matches records in that view and keeps the highest role', () => {
  const personal = builtinScopeViewId('personal', 'builtin-all')
  const saved = [{ id: 'open', filters: { status: 'open', $scope: 'workspace' } }]
  const record = { id: 'p1', status: 'open', title: 'Alpha' }
  assert.equal(recordMatchesGrantedView(record, personal, saved, 'personal'), true)
  assert.equal(recordMatchesGrantedView(record, personal, saved, 'shared'), false)
  assert.equal(recordMatchesGrantedView(record, 'open', saved, 'workspace'), true)
  assert.equal(recordMatchesGrantedView(record, 'open', saved, 'personal'), false)
  assert.equal(recordMatchesGrantedView({ id: 'p2', status: 'done' }, 'open', saved, 'workspace'), false)
  assert.equal(recordMatchesGrantedView(record, 'missing', saved, 'workspace'), false)
  assert.equal(highestViewRole(['viewer', 'manager', 'editor']), 'manager')
})
