import { test } from 'vitest'
import assert from 'node:assert/strict'
import { collectShareResources, mintSharePin, shareResourceTypeCount } from './share-resources.ts'

test('mintSharePin is a six-digit code', () => {
  const pin = mintSharePin()
  assert.match(pin, /^\d{6}$/)
})

test('collectShareResources splits page files, plugins and facets', () => {
  const stats = collectShareResources(
    [{ id: 'p000', title: '讲义' }],
    {
      p000: [
        ':::pageBlock {kind=html plugin=page-html-blocks id=ab12}',
        '<img src="/api/page/file/cover.png">',
        '见 @page/p001 和 facet/music-era',
        ':::',
      ].join('\n'),
    },
    ['p000'],
  )
  assert.equal(stats.pages >= 2, true)
  assert.equal(stats.pluginIds.includes('page-html-blocks'), true)
  assert.equal(stats.collections >= 1, true)
  assert.equal(shareResourceTypeCount(stats), 3)
})
