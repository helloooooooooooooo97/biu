import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  annotationMotion,
  cameraAt,
  compileSafe,
  compileScript,
  cursorAt,
  dumpScript,
  clipEnd,
  clipsAt,
  formatReport,
  moveClip,
  projectDuration,
  propAt,
  resizeClip,
  SAMPLE_SCRIPT,
} from './compose.ts'

test('default sample is a frame-driven React advertisement', () => {
  const result = compileSafe(SAMPLE_SCRIPT)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  if (!result.ok) return
  const project = result.project
  assert.match(SAMPLE_SCRIPT, /src=builtin:ad-scene/)
  assert.match(SAMPLE_SCRIPT, /src=builtin:ad-wipe/)
  assert.match(SAMPLE_SCRIPT, /React 逐帧文字与遮罩转场/)
  assert.match(SAMPLE_SCRIPT, /BIU 视频块\|介绍/)
  assert.match(SAMPLE_SCRIPT, /让创作\|即刻发生。/)
  assert.match(SAMPLE_SCRIPT, /desc="品牌 Slogan 尾卡"/)
  assert.equal(project.background, '#191919')
  assert.equal(project.tracks.length, 2)
  assert.equal(project.clips.length, 15)
  const scenes = project.clips.filter((clip) => clip.src === 'builtin:ad-scene')
  const wipes = project.clips.filter((clip) => clip.src === 'builtin:ad-wipe')
  assert.equal(scenes.length, 8)
  assert.equal(wipes.length, 7)
  assert.ok(scenes.every((clip) => clip.kind === 'component' && clip.duration === 2))
  assert.deepEqual(scenes.map((clip) => clip.variant), ['hero', 'split', 'marquee', 'stagger', 'focus', 'code', 'stack', 'finale'])
  assert.ok(wipes.every((clip) => clip.kind === 'component' && clip.duration === 26 / project.fps))
  assert.ok(Math.abs((wipes[0]?.start ?? 0) - (2 - 26 / project.fps)) < 1e-9)
  assert.ok(Math.abs((wipes[6]?.start ?? 0) - (14 - 26 / project.fps)) < 1e-9)
  assert.doesNotMatch(SAMPLE_SCRIPT, /demo\/hero\.mp4/)
  assert.equal(projectDuration(project), 16)
  assert.match(dumpScript(project), /variant=marquee/)
  assert.match(dumpScript(project), /color=#F472B6/)
  assert.doesNotMatch(formatReport(project), /字幕重叠/)
  assert.doesNotMatch(formatReport(project), /[✅⚠️⛔ℹ️]/)
})

test('sample script compiles to a playable timeline', () => {
  const project = compileScript(`<timeline fps=30 size=1280x720>
  <track name=main>
    <title dur=2s bg=#111 ink=#eee>A</title>
    <scene dur=3s bg=#222>B</scene>
    <clip src=clip.mp4 dur=1.5s />
  </track>
  <track name=sub layer=2>
    <caption at=1s dur=2s>Hi</caption>
  </track>
</timeline>`)
  assert.equal(project.width, 1280)
  assert.equal(project.tracks.length, 2)
  assert.equal(project.clips[0].kind, 'title')
  assert.equal(project.clips[1].start, 2)
  assert.equal(project.clips[2].src, 'clip.mp4')
  assert.equal(project.clips[2].start, 5)
  assert.equal(project.clips.find((clip) => clip.kind === 'caption')?.start, 1)
  assert.equal(projectDuration(project), 6.5)
  assert.equal(clipsAt(project, 1.2).some((c) => c.kind === 'caption'), true)
})

test('old video root and unknown tags fail closed', () => {
  assert.equal(compileSafe('<video><title dur=1s>x</title></video>').ok, false)
  assert.equal(compileSafe('<timeline><track><foo>x</foo></track></timeline>').ok, false)
  assert.equal(compileSafe('<timeline><track><clip dur=1s /></track></timeline>').ok, false)
})

test('component and AbsoluteFill share the timeline', () => {
  const project = compileScript(`<timeline fps=30 size=960x540>
  <track name=main>
    <title dur=2s>标签照旧</title>
    <AbsoluteFill dur=3s at=2s />
    <component src=hero.js dur=3s at=2s desc="自定义 React 组件" />
  </track>
</timeline>`)
  assert.equal(project.clips[0].kind, 'title')
  assert.equal(project.clips.find((clip) => clip.kind === 'fill')?.start, 2)
  assert.equal(project.clips.find((clip) => clip.kind === 'fill')?.bg, 'transparent')
  const hero = project.clips.find((clip) => clip.kind === 'component')!
  assert.equal(hero.src, 'hero.js')
  assert.equal(hero.start, 2)
  assert.equal(hero.description, '自定义 React 组件')
  const dumped = dumpScript(project)
  assert.match(dumped, /<AbsoluteFill /)
  assert.match(dumped, /<component /)
  assert.equal(compileSafe('<timeline><track><component dur=1s /></track></timeline>').ok, false)
})

test('serial gap and relative at expressions', () => {
  const project = compileScript(`<timeline fps=30>
  <track name=voice>
    <audio id=q1 src=q1.mp3 dur=1s />
    <audio id=no src=no.mp3 dur=1s at="q1.end + 0.5s" />
  </track>
  <track name=sub>
    <caption follow=q1 offset="-0.1s,0.2s">Q</caption>
  </track>
</timeline>`)
  const q1 = project.clips.find((clip) => clip.name === 'q1')!
  const no = project.clips.find((clip) => clip.name === 'no')!
  const cap = project.clips.find((clip) => clip.kind === 'caption')!
  assert.equal(q1.start, 0)
  assert.equal(no.start, 1.5)
  assert.equal(cap.start, -0.1)
  assert.equal(Number(cap.duration.toFixed(4)), 1.3)
})

test('zoom does not live on the main serial track', () => {
  const project = compileScript(`<timeline>
  <track name=main>
    <scene dur=4s>A</scene>
  </track>
  <track name=cam>
    <zoom at=1s dur=1s cx=0.2 cy=0.3 depth=2 />
  </track>
</timeline>`)
  assert.equal(projectDuration(project), 4)
  const mid = cameraAt(project, 1.5)
  assert.ok(mid.scale > 1.2 && mid.scale < 2)
  assert.ok(mid.cx < 0.45)
})

test('dump round-trips compiled clips', () => {
  const project = compileScript(`<timeline fps=24 size=640x360>
  <track><title dur=1s>Hi</title></track>
</timeline>`)
  const again = compileScript(dumpScript(project))
  assert.equal(again.fps, 24)
  assert.equal(again.clips[0].text, 'Hi')
})

test('dragging a clip moves it across tracks and snaps to frames', () => {
  const project = compileScript(`<timeline fps=30>
  <track name=main><title id=a dur=2s>A</title></track>
  <track name=fx layer=4><text id=b at=1s dur=1s>Label</text></track>
</timeline>`)
  const target = project.tracks.find((track) => track.name === 'fx')!
  const moved = moveClip(project, 'a', target.id, 1.234)
  const clip = moved.clips.find((item) => item.id === 'a')!
  assert.equal(clip.start, 37 / 30)
  assert.equal(clip.track, 'fx')
  assert.equal(clip.layer, 4)
  assert.equal(moved.tracks[0]?.clips.some((item) => item.id === 'a'), false)
  assert.equal(moved.tracks[1]?.clips.some((item) => item.id === 'a'), true)
  assert.match(dumpScript(moved), /<title id=a dur=2s at=1\.23s/)
})

test('dragging either clip edge changes its time span', () => {
  const project = compileScript(`<timeline fps=30><track><scene id=a at=1s dur=2s>A</scene></track></timeline>`)
  const fromStart = resizeClip(project, 'a', 'start', 1.52)
  const startClip = fromStart.clips.find((item) => item.id === 'a')!
  assert.equal(startClip.start, 46 / 30)
  assert.equal(startClip.duration, 3 - 46 / 30)
  const fromEnd = resizeClip(project, 'a', 'end', 4.26)
  const endClip = fromEnd.clips.find((item) => item.id === 'a')!
  assert.equal(endClip.start, 1)
  assert.equal(endClip.duration, 98 / 30)
  assert.match(dumpScript(fromEnd), /<scene id=a dur=3\.27s at=1s/)
})

test('OpenScreen-style effects compile from agent tags', () => {
  const project = compileScript(`<timeline fps=60 size=1920x1080 background=#dedbd3 padding=6 radius=18 shadow=28>
  <track name=main>
    <clip src=screen.mp4 in=1.5s dur=6s speed=1.25 crop=0.1,0.1,0.8,0.8 />
  </track>
  <track name=fx>
    <text at=.5s dur=2s x=.5 y=.15 size=42 color=#fff anim=typewriter>Hello</text>
    <arrow at=1s dur=2s x=.2 y=.7 x2=.7 y2=.3 color=#7dd3fc width=5 />
    <blur at=2s dur=2s x=.7 y=.2 w=.2 h=.15 amount=16 shape=rounded />
    <cursor at=.5s dur=3s x=.1 y=.8 x2=.8 y2=.2 click=1.4s size=30 />
    <pip src=face.mp4 at=1s dur=4s x=.84 y=.76 w=.2 h=.28 shape=circle />
    <image src=logo.png at=2s dur=2s x=.15 y=.15 w=.12 h=.12 anim=pop />
  </track>
  <track name=music kind=audio>
    <audio src=voice.mp3 at=0s dur=6s volume=.8 />
  </track>
</timeline>`)
  assert.equal(project.padding, 6)
  assert.equal(project.radius, 18)
  assert.equal(project.shadow, 28)
  assert.equal(project.clips.length, 8)
  assert.equal(project.clips[0].sourceIn, 1.5)
  assert.equal(project.clips[0].speed, 1.25)
  assert.deepEqual(project.clips[0].crop, [0.1, 0.1, 0.8, 0.8])
  assert.equal(project.clips[1].anim, 'typewriter')
  assert.equal(project.clips[2].amount, 5)
  assert.equal(project.clips.find((clip) => clip.kind === 'pip')?.shape, 'circle')
  assert.equal(projectDuration(project), 6)
  const dumped = dumpScript(project)
  assert.match(dumped, /padding=6/)
  assert.match(dumped, /<cursor /)
  assert.match(dumped, /<audio /)
})

test('description gap transition and diagnostics', () => {
  const project = compileScript(`<timeline description="demo">
  <track name=main>
    <title dur=1s align=left valign=top desc="开场">Hi</title>
    <gap dur=0.5s />
    <transition kind=dissolve dur=0.5s />
    <solid color=#000 dur=2s />
  </track>
  <track name=fx>
    <box at=.2s dur=.5s x=.4 y=.4 w=.2 h=.2 color=#ff0 />
    <stamp at=.2s dur=.5s x=.8 y=.1>LIVE</stamp>
  </track>
</timeline>`)
  assert.equal(project.description, 'demo')
  assert.equal(project.clips[0].description, '开场')
  assert.equal(project.clips[0].align, 'left')
  assert.equal(project.clips.find((clip) => clip.kind === 'gap')?.duration, 0.5)
  assert.equal(project.clips.find((clip) => clip.kind === 'solid')?.kind, 'solid')
  assert.match(formatReport(project), /编译通过/)
  assert.doesNotMatch(formatReport(project), /[✅⚠️⛔ℹ️]/)
  const dumped = dumpScript(project)
  assert.match(dumped, /<timeline /)
  assert.match(dumped, /<box /)
})

test('text and cursor motion are deterministic at any preview time', () => {
  const project = compileScript(`<timeline>
  <track name=main>
    <scene dur=4s>A</scene>
  </track>
  <track name=fx>
    <text at=1s dur=2s anim=rise>Label</text>
    <cursor at=0s dur=2s x=.1 y=.2 x2=.9 y2=.8 click=1s />
  </track>
</timeline>`)
  const text = project.clips.find((clip) => clip.kind === 'text')!
  const cursor = project.clips.find((clip) => clip.kind === 'cursor')!
  const motion = annotationMotion(text, 1.35)
  assert.ok(motion.opacity > 0 && motion.opacity < 1)
  assert.ok(motion.translateY > 0)
  const pointer = cursorAt(cursor, 1)
  assert.ok(pointer.x > 0.4 && pointer.x < 0.6)
  assert.equal(pointer.click, 1)
})

test('keyframes and text stagger compile', () => {
  const project = compileScript(`<timeline fps=30>
  <track name=main>
    <clip src=a.mp4 dur=5s zoom="1→1.6→1.2">
      <animate prop="x" from="0.3" to="0.7" delay="1s" dur="3s" ease="inOut" />
      <mask shape=ellipse x=.5 y=.5 w=.7 h=.8 />
    </clip>
  </track>
  <track name=fx>
    <text dur=2s anim=rise unit=word stagger=0.1s>Hello world</text>
  </track>
</timeline>`)
  const clip = project.clips[0]!
  assert.ok(clip.animates.some((item) => item.prop === 'scale' && item.keys.length === 3))
  assert.ok(clip.animates.some((item) => item.prop === 'x'))
  assert.equal(clip.mask?.shape, 'ellipse')
  const mid = propAt(clip, 'scale', 2.5)
  assert.ok(mid > 1.1 && mid < 1.7)
  const text = project.clips.find((item) => item.kind === 'text')!
  assert.equal(text.unit, 'word')
  assert.equal(text.stagger, 0.1)
})

test('enter exit atoms and transitions compile', () => {
  const project = compileScript(`<timeline fps=30>
  <track name=main>
    <title dur=2s enter="fadeUp">A</title>
    <transition enter="move(x:+100%)" exit="move(x:-100%)" dur=0.5s />
    <scene dur=2s>B</scene>
  </track>
  <track name=fx>
    <text at=0s dur=2s enter="scale(0.8→1); fade" ease="backOut" unit=char stagger=0.05s>Hi</text>
  </track>
</timeline>`)
  const title = project.clips[0]!
  const scene = project.clips.find((clip) => clip.kind === 'scene')!
  const text = project.clips.find((clip) => clip.kind === 'text')!
  assert.equal(title.enter, 'fadeUp')
  assert.equal(title.exit, 'move(x:-100%)')
  assert.equal(scene.enter, 'move(x:+100%)')
  assert.ok(scene.start < 2)
  assert.equal(text.enter, 'scale(0.8→1); fade')
  assert.equal(text.ease, 'backOut')
  const motion = annotationMotion(title, title.start)
  assert.ok(motion.opacity < 0.3)
})

test('frame durations snap to the project rate', () => {
  const project = compileScript(`<timeline fps=24>
  <track><clip src=a.mp4 dur=48f /></track>
</timeline>`)
  assert.equal(project.clips[0].duration, 2)
})
