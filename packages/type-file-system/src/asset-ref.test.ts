import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  assetNameFromUrl,
  assetNamesFromBlock,
  assetNamesFromHtml,
  assetNamesFromMarkdown,
  collectAssetNames,
  collectAssetNamesLoose,
} from './asset-ref.ts'

test('markdown extracts links and html tags, not prose mentions', () => {
  const md = [
    'see .biu/assets/page，页面正文',
    'assets/画板-edd9.json 只是提及',
    '![x](/api/db/file/keep.png)',
    '[doc](/api/page/file/note.json)',
    '<img src="/api/db/file/pic.webp">',
  ].join('\n')
  const names = assetNamesFromMarkdown(md)
  assert.equal(names.has('keep.png'), true)
  assert.equal(names.has('note.json'), true)
  assert.equal(names.has('pic.webp'), true)
  assert.equal(names.has('page'), false)
  assert.equal(names.has('画板-edd9.json'), false)
  assert.equal(collectAssetNamesLoose(md).has('page'), true)
  assert.equal(collectAssetNamesLoose(md).has('画板-edd9.json'), true)
})

test('assetNameFromUrl only accepts known prefixes', () => {
  assert.equal(assetNameFromUrl('/api/db/file/a.png'), 'a.png')
  assert.equal(assetNameFromUrl('assets/画板-ab.json'), '画板-ab.json')
  assert.equal(assetNameFromUrl('.biu/assets/page'), null)
})

test('html banner only reads src/href', () => {
  const names = assetNamesFromHtml('<div class="assets/page">x</div><img src="/api/db/file/hero.png">')
  assert.equal(names.has('hero.png'), true)
  assert.equal(names.has('page'), false)
})

test('excalidraw block uses declared file field', () => {
  const names = assetNamesFromBlock('excalidraw', 'page-excalidraw', { file: 'assets/画板-ab12.json', title: 'assets/page' })
  assert.deepEqual([...names], ['画板-ab12.json'])
})

test('undeclared block kinds yield no assets', () => {
  assert.equal(assetNamesFromBlock('mystery', 'nope', { file: 'assets/x.png' }).size, 0)
  assert.equal(assetNamesFromBlock('html', 'page-html-blocks', { html: '<img src="/api/db/file/x.png">' }).size, 0)
})

test('collectAssetNames walks exact urls without prose hits', () => {
  const names = collectAssetNames({ file: 'assets/画板-ab12.json' }, 'see .biu/assets/page')
  assert.equal(names.has('画板-ab12.json'), true)
  assert.equal(names.has('page'), false)
})
