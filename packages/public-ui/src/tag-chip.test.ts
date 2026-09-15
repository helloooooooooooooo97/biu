import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TAG_TONES, tagTone } from './tag-chip.tsx'

test('tagTone is stable and stays in the shared palette', () => {
  assert.equal(tagTone('dp'), tagTone('dp'))
  assert.equal(TAG_TONES.includes(tagTone('动态规划') as (typeof TAG_TONES)[number]), true)
  assert.notEqual(tagTone('dp'), tagTone('graph'))
})

test('TagChip ships the tinted chip markup', () => {
  const src = readFileSync(resolve(import.meta.dirname, './tag-chip.tsx'), 'utf8')
  assert.match(src, /function TagChip/)
  assert.match(src, /className=\{\`biu-tag/)
  assert.match(src, /color-mix\(in srgb,var\(--biu-tag/)
  assert.match(src, /color:var\(--dsw-tag-ink,#2c2c2b\)/)
  assert.match(src, /38%,transparent/)
  assert.match(src, /function tagTextColor/)
  assert.match(src, /icon\?: ReactNode/)
  assert.match(src, /biu-tag-icon/)
  assert.match(src, /TAG_TONE_ROSE/)
  assert.match(src, /TAG_TONE_BLUE/)
  assert.match(src, /TAG_TONE_ORANGE/)
  assert.match(src, /TAG_TONE_GREEN/)
  assert.match(src, /TAG_TONE_RED/)
  assert.equal(TAG_TONES.includes('#e255a1' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('#5b9fd6' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('#d9730d' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('#448361' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('#c4554d' as (typeof TAG_TONES)[number]), true)
})
