import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MOTION_ALIASES, parseMotion, sampleMotion } from './motion.ts'

test('aliases expand to atoms', () => {
  const up = parseMotion('fadeUp')
  assert.ok(up.steps[0]?.atoms.some((atom) => atom.name === 'fade'))
  assert.ok(up.steps[0]?.atoms.some((atom) => atom.name === 'move' && atom.params.y === '+24'))
  assert.equal(Object.keys(MOTION_ALIASES).length >= 6, true)
})

test('plus is parallel and semicolon is sequential', () => {
  const both = parseMotion('fade+move(y:+24)')
  assert.equal(both.steps.length, 1)
  assert.equal(both.steps[0]!.atoms.length, 2)
  const seq = parseMotion('scale(0.8→1); fade')
  assert.equal(seq.steps.length, 2)
})

test('enter fade goes from 0 to rest', () => {
  const program = parseMotion('fade')
  assert.ok(sampleMotion(program, 0, 'enter').opacity < 0.2)
  assert.ok(sampleMotion(program, 1, 'enter').opacity > 0.9)
})

test('pop uses scale atom', () => {
  const program = parseMotion('pop')
  const mid = sampleMotion(program, 0, 'enter').scale
  const end = sampleMotion(program, 1, 'enter').scale
  assert.ok(mid < end)
})
