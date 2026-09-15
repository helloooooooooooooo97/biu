import { test } from 'vitest'
import assert from 'node:assert/strict'
import { asImageSrc, asImageSrcList, asAttachment, asAttachmentList, asPerson, asPersonList, appendPerson, personKey, actionVisibleToUser, emptySchemaValue, hasCollectionDeleteQuery, isReservedSchemaFieldKey, isReservedSchemaFieldLabel, normalizeSchemaPack, normalizeSchemaValue, recordBuiltinValues, REQUIRED_RECORD_FIELD_KEYS, REQUIRED_RECORD_FIELDS, retagSchemaValue, schemaSearchHaystack, withBuiltinFields } from './index.ts'

test('asImageSrc keeps http, data:image, and same-origin image paths', () => {
  assert.equal(asImageSrc('https://example.com/a.png'), 'https://example.com/a.png')
  assert.equal(asImageSrc('data:image/svg+xml;base64,QQ=='), 'data:image/svg+xml;base64,QQ==')
  assert.equal(asImageSrc('/page-covers/red.png'), '/page-covers/red.png')
  assert.equal(asImageSrc('/covers/photo.webp?v=1'), '/covers/photo.webp?v=1')
  assert.equal(asImageSrc({ src: '/page-covers/blue.png' }), '/page-covers/blue.png')
})

test('asImageSrcList keeps multiple images and asImageSrc takes the first', () => {
  assert.deepEqual(asImageSrcList(['/page-covers/red.png', 'https://example.com/a.png']), [
    '/page-covers/red.png',
    'https://example.com/a.png',
  ])
  assert.equal(asImageSrc(['/page-covers/red.png', 'https://example.com/a.png']), '/page-covers/red.png')
  assert.deepEqual(asImageSrcList('/page-covers/blue.png'), ['/page-covers/blue.png'])
  assert.deepEqual(asImageSrcList(['javascript:alert(1)', '/page-covers/red.png']), ['/page-covers/red.png'])
  assert.deepEqual(
    asImageSrcList(JSON.stringify(['/page-covers/red.png', '/page-covers/blue.png'])),
    ['/page-covers/red.png', '/page-covers/blue.png'],
  )
})

test('asAttachmentList keeps multiple files and asAttachment takes the first', () => {
  const a = { name: 'a.pdf', href: 'https://cdn.example/a.pdf' }
  const b = { name: 'b.pdf', href: '/api/page/file/b.pdf' }
  assert.deepEqual(asAttachmentList([a, b]), [a, b])
  assert.equal(asAttachment([a, b])?.href, a.href)
  assert.deepEqual(asAttachmentList(''), [])
  assert.deepEqual(asAttachmentList({ name: '', href: '' }), [])
  assert.equal(asAttachment({ name: 'pack.zip', href: 'assets/pack.zip' })?.href, 'assets/pack.zip')
  assert.deepEqual(
    asAttachmentList([
      { name: 'a.bin', href: 'assets/a.bin' },
      { name: 'b.bin', href: '/api/page/file/b.bin' },
    ]).map((file) => file.name),
    ['a.bin', 'b.bin'],
  )
})

test('asImageSrc rejects scripts and non-image paths', () => {
  assert.equal(asImageSrc('javascript:alert(1)'), '')
  assert.equal(asImageSrc('//evil.example/x.png'), '')
  assert.equal(asImageSrc('/not-an-image.txt'), '')
  assert.equal(asImageSrc('../secret.png'), '')
})

test('schemaSearchHaystack includes facet labels and field values', () => {
  const text = schemaSearchHaystack(
    { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } },
    [{ id: 'dp', label: '动态规划', fields: [] }],
  )
  assert.match(text, /动态规划/)
  assert.match(text, /O\(n\)/)
})

test('retagSchemaValue does not revive bags for a collection that was removed then attached again', () => {
  const leftover = { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } }
  const cleared = retagSchemaValue(leftover, [])
  assert.deepEqual(cleared, { tags: [], values: {} })
  assert.deepEqual(retagSchemaValue(cleared, ['dp']), { tags: ['dp'], values: {} })
  assert.deepEqual(retagSchemaValue({ tags: [], values: leftover.values }, ['dp']), { tags: ['dp'], values: {} })
  assert.deepEqual(retagSchemaValue(leftover, ['dp']), leftover)
})

test('reserved schema fields include 合集 / facet by key or label', () => {
  assert.equal(isReservedSchemaFieldKey('facet'), true)
  assert.equal(isReservedSchemaFieldKey('title'), true)
  assert.equal(isReservedSchemaFieldLabel('标签'), true)
  assert.equal(isReservedSchemaFieldLabel('类型'), false)
  assert.equal(isReservedSchemaFieldLabel('标题'), true)
  assert.equal(isReservedSchemaFieldLabel('facet'), true)
  assert.equal(isReservedSchemaFieldKey('parentId'), true)
  assert.equal(isReservedSchemaFieldKey('dependsOn'), true)
  assert.equal(isReservedSchemaFieldLabel('父级'), true)
  assert.equal(isReservedSchemaFieldLabel('依赖'), true)
  assert.equal(isReservedSchemaFieldKey('createdBy'), true)
  assert.equal(isReservedSchemaFieldKey('updatedBy'), true)
  assert.equal(isReservedSchemaFieldLabel('创建人'), true)
  assert.equal(isReservedSchemaFieldLabel('编辑人'), true)
})

test('normalizeSchemaPack keeps nested facet fields and action', () => {
  const pack = normalizeSchemaPack({
    id: 'dp',
    label: '动态规划',
    fields: [
      { key: 'complexity', type: 'string' },
      { key: 'nested', type: 'facet' },
      { key: 'run', type: 'action' },
    ],
  })
  assert.equal(pack?.id, 'dp')
  assert.deepEqual(pack?.fields.map((field) => field.key), ['complexity', 'nested', 'run'])
  assert.equal(pack?.fields.find((field) => field.key === 'nested')?.type, 'facet')
})

test('normalizeSchemaPack drops fields that reuse file-system keys or labels', () => {
  const pack = normalizeSchemaPack({
    id: 'dp',
    label: '动态规划',
    fields: [
      { key: 'facet', type: 'string', label: '别的名字' },
      { key: 'extra', type: 'string', label: '合集' },
      { key: 'title', type: 'string', label: '题目' },
      { key: 'complexity', type: 'string', label: '复杂度' },
      { key: 'dup', type: 'string', label: '复杂度' },
    ],
  })
  assert.deepEqual(pack?.fields.map((field) => field.key), ['complexity'])
})

test('withBuiltinFields always includes writable facet and tags', () => {
  const fields = withBuiltinFields({ title: { type: 'string', writable: true }, parentId: { type: 'string', label: '父级', writable: true } })
  assert.equal(fields.facet?.type, 'facet')
  assert.equal(fields.facet?.writable, true)
  assert.equal(fields.facet?.label, '合集')
  assert.equal(fields.tags?.type, 'multi-select')
  assert.equal(fields.tags?.writable, true)
  assert.equal(fields.emoji?.writable, true)
  assert.equal(fields.parentId?.writable, true)
  assert.equal(fields.parentId?.label, '父级')
  assert.equal(fields.parentId?.type, 'ref')
  assert.equal(fields.dependsOn?.type, 'multi-ref')
  assert.equal(fields.dependsOn?.writable, true)
  assert.equal(fields.dependsOn?.label, '依赖')
  assert.equal(fields.createdBy?.type, 'person')
  assert.equal(fields.createdBy?.writable, false)
  assert.equal(fields.updatedBy?.type, 'person')
  assert.equal(fields.updatedBy?.writable, false)
  assert.equal(fields.updatedBy?.multiple, true)
})

test('recordBuiltinValues fills required record columns', () => {
  assert.deepEqual(recordBuiltinValues({}), {
    createdAt: 0,
    updatedAt: 0,
    emoji: '',
    tags: [],
    facet: { tags: [], values: {} },
    parentId: '',
    dependsOn: [],
    createdBy: null,
    updatedBy: null,
  })
  assert.equal(recordBuiltinValues({ createdAt: 10, emoji: '📄' }).emoji, '📄')
  assert.deepEqual(recordBuiltinValues({ tags: ['a', 'a', ''] }).tags, ['a'])
  assert.equal(recordBuiltinValues({ parentId: 'p1' }).parentId, 'p1')
  assert.deepEqual(recordBuiltinValues({ dependsOn: ['a', 'a', ''] }).dependsOn, ['a'])
})

test('required record fields are icon, tags, timestamps, facet, parent, and dependency', () => {
  assert.deepEqual([...REQUIRED_RECORD_FIELD_KEYS].sort(), [
    'createdAt',
    'createdBy',
    'dependsOn',
    'emoji',
    'facet',
    'parentId',
    'tags',
    'updatedAt',
    'updatedBy',
  ])
  assert.equal(REQUIRED_RECORD_FIELDS.createdBy.type, 'person')
  assert.equal(REQUIRED_RECORD_FIELDS.updatedBy.type, 'person')
  assert.equal(REQUIRED_RECORD_FIELDS.updatedBy.multiple, true)
  assert.equal(REQUIRED_RECORD_FIELDS.emoji.type, 'string')
  assert.equal(REQUIRED_RECORD_FIELDS.tags.type, 'multi-select')
  assert.equal(REQUIRED_RECORD_FIELDS.facet.type, 'facet')
  assert.equal(REQUIRED_RECORD_FIELDS.createdAt.type, 'datetime')
  assert.equal(REQUIRED_RECORD_FIELDS.updatedAt.type, 'datetime')
  assert.equal(REQUIRED_RECORD_FIELDS.parentId.type, 'ref')
  assert.equal(REQUIRED_RECORD_FIELDS.dependsOn.type, 'multi-ref')
})

test('asPerson reads user, system, and agent session ids', () => {
  assert.deepEqual(asPerson('用户'), { kind: 'user', name: '用户' })
  assert.deepEqual(asPerson('系统'), { kind: 'system', name: '系统' })
  assert.equal(personKey(asPerson({ kind: 'agent', name: '指挥', sessionId: 's1' })), 's1')
  assert.equal(asPerson({ kind: 'agent', name: '蓝', sessionId: 's1', mascot: { shape: 'blob', color: 'cyan' } })?.mascot?.shape, 'blob')
  assert.equal(asPerson(''), null)
})

test('updatedBy is a person list that appends unique editors', () => {
  const user = { kind: 'user' as const, name: '用户' }
  const agent = { kind: 'agent' as const, name: '蓝', sessionId: 's1' }
  assert.deepEqual(asPersonList(user), [user])
  assert.deepEqual(appendPerson(user, agent), [user, agent])
  assert.equal(appendPerson([user, agent], agent).length, 2)
})

test('hasCollectionDeleteQuery requires ids, q, or a non-empty filter', () => {
  assert.equal(hasCollectionDeleteQuery({}), false)
  assert.equal(hasCollectionDeleteQuery({ ids: [] }), false)
  assert.equal(hasCollectionDeleteQuery({ ids: ['a'] }), true)
  assert.equal(hasCollectionDeleteQuery({ q: '  x ' }), true)
  assert.equal(hasCollectionDeleteQuery({ filter: { status: 'open' } }), true)
  assert.equal(hasCollectionDeleteQuery({ filter: { status: '' } }), false)
})

test('actionVisibleToUser shows user and both, hides agent', () => {
  assert.equal(actionVisibleToUser({}), true)
  assert.equal(actionVisibleToUser({ for: 'both' }), true)
  assert.equal(actionVisibleToUser({ for: 'user' }), true)
  assert.equal(actionVisibleToUser({ for: 'agent' }), false)
})
