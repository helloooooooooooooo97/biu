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
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'jp-tokyo-chrome'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'cn-shanghai-mode'))
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

  assert.match(preset('jp-hattori'), /東 京/)
  assert.match(preset('jp-taku-satoh'), /STRUCTURE 01/)
  assert.match(preset('jp-groovisions'), /GROOVISIONS/)
  assert.match(preset('jp-mieno'), /拉伸、切割、越界/)
  assert.match(preset('jp-tokyo-chrome'), /LIQUID \/ UTILITY/)
  assert.match(preset('jp-hybrid-tailoring'), /mix-blend-mode:difference/)
  assert.match(preset('us-lubalin'), /letter-spacing:-\.105em/)
  assert.match(preset('us-vignelli'), /grid-template-columns:repeat\(8,1fr\)/)
  assert.match(preset('us-carson'), /skewX\(-18deg\)/)
  assert.match(preset('eu-swiss'), /grid-template-columns:repeat\(12,1fr\)/)
  assert.match(preset('eu-deco'), /clip-path:polygon/)
  assert.match(preset('eu-futurism'), /skewX\(-23deg\)/)
  assert.match(preset('cn-gba-tech'), /SYSTEM READY/)
  assert.match(preset('cn-variable-hanzi'), /scaleX\(1\.35\)/)
  assert.match(preset('cn-digital-jade'), /backdrop-filter:blur/)
  assert.match(preset('cn-night-shanghai'), /CLUB \/ 02:17/)
})

test('gallery spans light, cool, vivid, pastel, neutral, and intentionally dark palettes', () => {
  const preset = (id: string) => BANNER_PRESETS.find((entry) => entry.id === id)?.html ?? ''

  assert.match(preset('jp-tokyo-chrome'), /#7dff36/)
  assert.match(preset('jp-sato'), /#1457ff/)
  assert.match(preset('jp-hattori'), /#f1ff55/)
  assert.match(preset('jp-groovisions'), /#53d7ff/)
  assert.match(preset('jp-harajuku-soft'), /#ffc9e8/)
  assert.match(preset('us-greiman'), /#8ff5ff/)
  assert.match(preset('us-warhol'), /#ff5ebc/)
  assert.match(preset('eu-weingart'), /#2357ff/)
  assert.match(preset('eu-memphis'), /#b9f3dc/)
  assert.match(preset('cn-shanghai-mode'), /#d8ff36/)
  assert.match(preset('cn-variable-hanzi'), /#ff477e/)
  assert.match(preset('cn-soft-future'), /#ffd7f0/)

  // A few dark fields remain because darkness is integral to these movements,
  // not because every regional family shares one museum-like palette.
  assert.match(preset('eu-deco'), /#1a1420/)
  assert.match(preset('us-carson'), /#151515/)
})

test('Japanese and Chinese defaults are fashion-forward rather than historical exhibits', () => {
  const ids = new Set(BANNER_PRESETS.map((item) => item.id))
  for (const retired of [
    'jp-rimpa', 'jp-ukiyo', 'jp-seigaiha', 'jp-mingei', 'jp-tate',
    'jp-kamekura', 'jp-ikko', 'jp-sugiura', 'jp-yokoo', 'jp-hara',
    'cn-song', 'cn-bai', 'cn-yue', 'cn-liangyou', 'cn-xuan',
    'cn-seal', 'cn-steiner', 'cn-kan', 'cn-chan', 'cn-window',
  ]) {
    assert.equal(ids.has(retired), false, retired)
  }
  for (const current of [
    'jp-tokyo-chrome', 'jp-harajuku-soft', 'jp-data-stage', 'jp-numero', 'jp-hybrid-tailoring',
    'cn-shanghai-mode', 'cn-gba-tech', 'cn-variable-hanzi', 'cn-digital-jade',
    'cn-cpop-stage', 'cn-new-luxury', 'cn-street-type', 'cn-art-book',
    'cn-night-shanghai', 'cn-soft-future',
  ]) {
    assert.equal(ids.has(current), true, current)
  }
})
