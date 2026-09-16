import assert from 'node:assert/strict'
import { test } from 'vitest'
import { compileSafe, compileScript, dumpScript, clipsAt, projectDuration } from './compose.ts'

test('sample script compiles to a playable timeline', () => {
  const project = compileScript(`<video fps=30 size=1280x720>
  <title dur=2s bg=#111 ink=#eee>A</title>
  <scene dur=3s bg=#222>B</scene>
  <caption at=1s dur=2s>Hi</caption>
  <media src=clip.mp4 dur=1.5s />
</video>`)
  assert.equal(project.width, 1280)
  assert.equal(project.clips.length, 4)
  assert.equal(project.clips[0].kind, 'title')
  assert.equal(project.clips[1].start, 2)
  assert.equal(project.clips[2].kind, 'caption')
  assert.equal(project.clips[2].start, 1)
  assert.equal(project.clips[3].src, 'clip.mp4')
  assert.equal(projectDuration(project), 6.5)
  assert.equal(clipsAt(project, 1.2).some((c) => c.kind === 'caption'), true)
})

test('unknown tags and missing media src fail closed', () => {
  const badTag = compileSafe('<video><foo>x</foo></video>')
  assert.equal(badTag.ok, false)
  const badMedia = compileSafe('<video><media dur=1s /></video>')
  assert.equal(badMedia.ok, false)
})

test('dump round-trips compiled clips', () => {
  const project = compileScript(`<video fps=24 size=640x360>
  <title dur=1s>Hi</title>
</video>`)
  const again = compileScript(dumpScript(project))
  assert.equal(again.fps, 24)
  assert.equal(again.clips[0].text, 'Hi')
})
