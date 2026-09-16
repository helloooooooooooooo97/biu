import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  annotationMotion,
  cameraAt,
  compileSafe,
  compileScript,
  cursorAt,
  dumpScript,
  clipsAt,
  projectDuration,
} from './compose.ts'

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

test('zoom does not advance the playhead and eases the camera', () => {
  const project = compileScript(`<video>
  <scene dur=4s>A</scene>
  <zoom at=1s dur=1s cx=0.2 cy=0.3 depth=2 />
</video>`)
  assert.equal(projectDuration(project), 4)
  const mid = cameraAt(project, 1.5)
  assert.ok(mid.scale > 1.2 && mid.scale < 2)
  assert.ok(mid.cx < 0.45)
})

test('dump round-trips compiled clips', () => {
  const project = compileScript(`<video fps=24 size=640x360>
  <title dur=1s>Hi</title>
</video>`)
  const again = compileScript(dumpScript(project))
  assert.equal(again.fps, 24)
  assert.equal(again.clips[0].text, 'Hi')
})

test('OpenScreen-style effects compile from agent tags', () => {
  const project = compileScript(`<video fps=60 size=1920x1080 background=#dedbd3 padding=6 radius=18 shadow=28>
  <media src=screen.mp4 in=1.5s dur=6s speed=1.25 crop=0.1,0.1,0.8,0.8 />
  <text at=.5s dur=2s x=.5 y=.15 size=42 color=#fff anim=typewriter>Hello</text>
  <arrow at=1s dur=2s x=.2 y=.7 x2=.7 y2=.3 color=#7dd3fc width=5 />
  <blur at=2s dur=2s x=.7 y=.2 w=.2 h=.15 amount=16 shape=rounded />
  <cursor at=.5s dur=3s x=.1 y=.8 x2=.8 y2=.2 click=1.4s size=30 />
  <pip src=face.mp4 at=1s dur=4s x=.84 y=.76 w=.2 h=.28 shape=circle />
  <image src=logo.png at=2s dur=2s x=.15 y=.15 w=.12 h=.12 anim=pop />
  <audio src=voice.mp3 at=0s dur=6s volume=.8 />
</video>`)
  assert.equal(project.padding, 6)
  assert.equal(project.radius, 18)
  assert.equal(project.shadow, 28)
  assert.equal(project.clips.length, 8)
  assert.equal(project.clips[0].sourceIn, 1.5)
  assert.equal(project.clips[0].speed, 1.25)
  assert.deepEqual(project.clips[0].crop, [0.1, 0.1, 0.8, 0.8])
  assert.equal(project.clips[1].anim, 'typewriter')
  assert.equal(project.clips[2].amount, 5)
  assert.equal(project.clips[5].shape, 'circle')
  assert.equal(projectDuration(project), 6)
  const dumped = dumpScript(project)
  assert.match(dumped, /padding=6/)
  assert.match(dumped, /<cursor /)
  assert.match(dumped, /<audio /)
})

test('text and cursor motion are deterministic at any preview time', () => {
  const project = compileScript(`<video>
  <scene dur=4s>A</scene>
  <text at=1s dur=2s anim=rise>Label</text>
  <cursor at=0s dur=2s x=.1 y=.2 x2=.9 y2=.8 click=1s />
</video>`)
  const text = project.clips.find((clip) => clip.kind === 'text')!
  const cursor = project.clips.find((clip) => clip.kind === 'cursor')!
  const motion = annotationMotion(text, 1.35)
  assert.ok(motion.opacity > 0 && motion.opacity < 1)
  assert.ok(motion.translateY > 0)
  const pointer = cursorAt(cursor, 1)
  assert.ok(pointer.x > 0.4 && pointer.x < 0.6)
  assert.equal(pointer.click, 1)
})
