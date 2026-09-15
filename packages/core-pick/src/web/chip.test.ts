import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as lu from '@heroicons/react/16/solid'
import { tagTone } from '@biu/public-ui'
import { pickKindIcon, pickKindTone } from './chip.tsx'

test('kind maps to distinct heroicons', () => {
  const needed = [
    'CircleStackIcon',
    'StopCircleIcon',
    'HashtagIcon',
    'Square3Stack3DIcon',
    'RectangleStackIcon',
    'ClipboardDocumentCheckIcon',
    'CheckCircleIcon',
    'DocumentTextIcon',
    'ChatBubbleLeftIcon',
    'PuzzlePieceIcon',
    'TagIcon',
    'WrenchScrewdriverIcon',
    'DocumentIcon',
  ] as const
  for (const name of needed) {
    assert.ok(name in lu, `${name} missing`)
  }
  assert.equal(pickKindIcon('session'), lu.ChatBubbleLeftIcon)
  assert.equal(pickKindIcon('message'), lu.ChatBubbleLeftIcon)
  assert.equal(pickKindIcon('text'), lu.DocumentTextIcon)
  assert.equal(pickKindIcon('block'), lu.DocumentTextIcon)
  assert.equal(pickKindIcon('html'), lu.DocumentIcon)
  assert.notEqual(pickKindIcon('text'), pickKindIcon('session'))
  assert.equal(pickKindIcon('task'), lu.CheckCircleIcon)
  assert.equal(pickKindIcon('tasks'), lu.CheckCircleIcon)
  assert.equal(pickKindIcon('page'), lu.DocumentIcon)
  assert.notEqual(pickKindIcon('collection'), pickKindIcon('usage'))
  assert.equal(pickKindIcon('plugin'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('plugins'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('facet'), lu.RectangleStackIcon)
  assert.equal(pickKindIcon('facets'), lu.RectangleStackIcon)
  assert.equal(pickKindIcon('unknown'), lu.TagIcon)
})

test('pick kind maps to the facet palette by string', () => {
  assert.equal(pickKindTone('session'), tagTone('session'))
  assert.equal(pickKindTone('task'), tagTone('task'))
  assert.equal(pickKindTone('tasks'), tagTone('task'))
  assert.notEqual(pickKindTone('session'), pickKindTone('task'))
})

test('pick chips can show the facet close mark', () => {
  const src = readFileSync(resolve(import.meta.dirname, './chip.tsx'), 'utf8')
  assert.match(src, /onRemove/)
  assert.match(src, /biu-tag-x/)
  assert.match(src, /TagChipCloseMark/)
  assert.match(src, /pick-chip-name/)
  assert.match(src, /pick-chip-lines/)
})
