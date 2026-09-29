import { test } from 'vitest'
import assert from 'node:assert/strict'
import { fieldPickAttrs, fieldPickId, pickDomAttrs, recordPickKind, recordSourcePath, viewPickId } from './pick-dom.ts'

test('pickDomAttrs writes the same handles core-pick reads', () => {
  assert.deepEqual(pickDomAttrs('page', 'p000', '页面 1'), {
    'data-biu-kind': 'page',
    'data-biu-id': 'p000',
    'data-biu-label': '页面 1',
  })
  assert.equal(recordPickKind('page'), 'page')
  assert.equal(recordPickKind('tasks'), 'task')
  assert.equal(recordPickKind('plugins'), 'plugin')
  assert.equal(recordPickKind('sessions-db'), 'session')
  assert.equal(recordPickKind(''), 'record')
  assert.equal(viewPickId('/pages', 'v1'), '/pages::v1')
})

test('field pick attrs carry path field and current value', () => {
  assert.equal(recordSourcePath('/tasks', 't1'), '/tasks/t1')
  assert.equal(fieldPickId('t1', 'status'), 't1:status')
  assert.deepEqual(
    fieldPickAttrs('task', 't1', 'status', {
      label: '状态',
      title: '写需求',
      path: '/tasks/t1',
      text: '进行中',
    }),
    {
      'data-biu-kind': 'task',
      'data-biu-id': 't1:status',
      'data-biu-label': '状态',
      'data-biu-path': '/tasks/t1',
      'data-biu-title': '写需求',
      'data-biu-text': '进行中',
      'data-biu-field': 'status',
    },
  )
})
