import assert from 'node:assert/strict'
import { test } from 'vitest'
import { builtinAllViewId, builtinScopeViewId } from './catalog-views.ts'
import { effectiveDataScope, highestViewRole, recordMatchesGrantedView } from './view-access.ts'

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

test('inherited view grants raise a personal record to workspace or shared', () => {
  const record = { id: 'p1', title: 'Alpha' }
  const personal = builtinScopeViewId('personal', 'builtin-all')
  const internal = { viewId: personal, subjectType: 'account' as const, subjectId: 'bob', memberKind: 'member' }
  const external = { viewId: personal, subjectType: 'account' as const, subjectId: 'cara', memberKind: 'external' }
  assert.equal(effectiveDataScope('personal', record, [internal], [], []), 'workspace')
  assert.equal(effectiveDataScope('personal', record, [internal, external], [], []), 'shared')
  assert.equal(effectiveDataScope('workspace', record, [], [], []), 'workspace')
  assert.equal(effectiveDataScope('personal', { id: 'p2', status: 'done' }, [{ ...internal, viewId: 'open' }], [{ id: 'open', filters: { status: 'open' } }], []), 'personal')
  const allMembers = { viewId: builtinAllViewId('/sessions'), subjectType: 'member_view' as const, subjectId: 'builtin-member:member' }
  assert.equal(recordMatchesGrantedView(record, allMembers.viewId, [], 'personal'), true)
  assert.equal(effectiveDataScope('personal', record, [allMembers], [], [{ id: 'builtin-member:member', filters: { membershipKind: 'member' } }]), 'workspace')
})
