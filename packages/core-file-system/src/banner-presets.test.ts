import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BANNER_PRESETS, BANNER_STYLE_IDS, isBannerPreset, presetsOf } from './banner-presets.ts'

test('banner presets cover four styles in static and live kinds', () => {
  const ids = new Set<string>()
  for (const item of BANNER_PRESETS) {
    assert.equal(ids.has(item.id), false, item.id)
    ids.add(item.id)
    assert.ok(item.title.trim())
    assert.ok(item.note.trim().length >= 4)
    assert.ok(item.html.includes(item.title) || item.html.length > 80)
  }
  for (const style of BANNER_STYLE_IDS) {
    const still = presetsOf('html').filter((item) => item.style === style)
    const moving = presetsOf('htmlframe').filter((item) => item.style === style)
    assert.ok(still.length >= 8, style)
    assert.ok(moving.length >= 4, style)
  }
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'us-cranbrook'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'eu-weingart'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'jp-hara'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'cn-steiner'))
  const sample = BANNER_PRESETS[0]!
  assert.equal(isBannerPreset({ kind: sample.kind, html: sample.html }), true)
  assert.equal(isBannerPreset({ kind: 'html', html: '<div>custom</div>' }), false)
  assert.match(sample.html, /max-height:100%/)
})

test('static movements use distinct composition systems instead of one shared copy block', () => {
  const preset = (id: string) => {
    const item = BANNER_PRESETS.find((entry) => entry.id === id)
    assert.ok(item, id)
    return item.html
  }

  assert.match(preset('jp-ukiyo'), /writing-mode:vertical-rl/)
  assert.match(preset('jp-seigaiha'), /border-radius:50%/)
  assert.match(preset('jp-yokoo'), /transform:rotate\(-7deg\)/)
  assert.match(preset('us-lubalin'), /letter-spacing:-\.105em/)
  assert.match(preset('us-vignelli'), /grid-template-columns:repeat\(8,1fr\)/)
  assert.match(preset('us-carson'), /skewX\(-18deg\)/)
  assert.match(preset('eu-swiss'), /grid-template-columns:repeat\(12,1fr\)/)
  assert.match(preset('eu-deco'), /clip-path:polygon/)
  assert.match(preset('eu-futurism'), /skewX\(-23deg\)/)
  assert.match(preset('cn-song'), /writing-mode:vertical-rl/)
  assert.match(preset('cn-yue'), /grid-template-columns:1fr 1\.6fr 1fr/)
  assert.match(preset('cn-xuan'), /font:900 clamp/)
  assert.match(preset('cn-kan'), /STKaiti/)
})
