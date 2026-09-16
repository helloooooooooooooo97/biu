import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compileScript, compileSafe, dumpScript } from '../../../../.plugin-dev/page-video/compose.ts'

const dir = resolve(import.meta.dirname, '../../../../.plugin-dev/page-video')

test('page-video is a headless page block with tag grammar', async () => {
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as {
    id: string
    headless?: boolean
  }
  const web = await readFile(resolve(dir, 'web.tsx'), 'utf8')
  const host = await readFile(resolve(dir, 'host.ts'), 'utf8')
  const readme = await readFile(resolve(dir, 'README.md'), 'utf8')
  assert.equal(manifest.id, 'page-video')
  assert.equal(manifest.headless, true)
  assert.match(web, /kind: 'video'/)
  assert.match(web, /plugin: name/)
  assert.match(web, /requestFullscreen/)
  assert.match(web, /HTMLVideoElement/)
  assert.match(web, /onLive/)
  assert.match(web, /data-testid="page-video-cam"/)
  assert.match(web, /isVideoSrc/)
  assert.match(web, /onChange=\{\(event\) => \{/)
  assert.match(web, /createPortal/)
  assert.match(web, /page-video-studio/)
  assert.match(web, /page-video-split/)
  assert.match(web, /调整预览与源码宽度/)
  assert.match(web, /全屏编辑/)
  assert.match(web, /pv-embed:hover/)
  assert.match(readme, /<video fps=30 size=1280x720/)
  assert.doesNotMatch(readme, /"script":/)
  assert.match(host, /video_script/)
  assert.match(host, /\/api\/page-video\/compile/)
  assert.match(readme, /:::pageBlock \{kind=video plugin=page-video/)
})

test('tag script compiles without prose parsing', () => {
  const project = compileScript(`<video fps=30 size=1280x720>
  <title dur=2s bg=#111>Hello</title>
  <scene dur=3s>World</scene>
  <caption at=1s dur=1s>Hi</caption>
</video>`)
  assert.equal(project.clips[1].start, 2)
  assert.equal(project.clips[2].start, 1)
  const dumped = dumpScript(project)
  assert.match(dumped, /<title /)
  assert.doesNotMatch(dumped, /然后/)
  assert.equal(compileSafe('<video><unknown>x</unknown></video>').ok, false)
})
