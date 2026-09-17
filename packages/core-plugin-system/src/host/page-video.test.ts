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
  assert.doesNotMatch(web, /pv-embed:hover/)
  assert.match(web, /aria-label="进度"/)
  assert.match(web, /background:var\(--dsw-sidebar,#202020\)/)
  assert.match(web, /className="pv-preview"/)
  assert.match(web, /className="pv-embed-script"/)
  assert.match(web, /className="pv-embed-timeline"/)
  assert.match(web, /className="pv-stage-fit"/)
  assert.match(web, /ResizeObserver/)
  assert.match(web, /draggable=\{editable\}/)
  assert.match(web, /application\/x-page-video-clip/)
  assert.match(web, /application\/x-page-video-mode/)
  assert.match(web, /resize-start/)
  assert.match(web, /resizeClip\(project, clipId, edge, at\)/)
  assert.match(web, /aria-label="调整片段开始时间"/)
  assert.match(web, /aria-label="调整片段结束时间"/)
  assert.match(web, /dumpScript\(moveClip\(project, clipId, trackId, start\)\)/)
  assert.match(web, /data-testid=\{`page-video-clip-\$\{clip\.id\}`\}/)
  assert.match(web, /height:22px;border:0;border-radius:4px/)
  assert.doesNotMatch(web, /pv-split:hover,.pv-split\.is-drag\{background:[^}]*pv-blue/)
  assert.doesNotMatch(web, /pv-foot-split:hover,.pv-foot-split\.is-drag\{background:[^}]*pv-blue/)
  assert.match(web, /AbsoluteFill/)
  assert.match(readme, /<timeline fps=30 size=1920x1080/)
  assert.doesNotMatch(readme, /"script":/)
  assert.match(host, /video_script/)
  assert.match(host, /\/api\/page-video\/compile/)
  assert.match(readme, /<component src=hero\.js/)
  assert.match(readme, /<AbsoluteFill>/)
})

test('tag script compiles without prose parsing', () => {
  const project = compileScript(`<timeline fps=30 size=1280x720>
  <track>
    <title dur=2s bg=#111>Hello</title>
    <scene dur=3s>World</scene>
  </track>
  <track name=cap>
    <caption at=1s dur=1s>Hi</caption>
  </track>
</timeline>`)
  assert.equal(project.clips[1].start, 2)
  const dumped = dumpScript(project)
  assert.match(dumped, /<title /)
  assert.doesNotMatch(dumped, /然后/)
  assert.equal(compileSafe('<timeline><track><unknown>x</unknown></track></timeline>').ok, false)
})
