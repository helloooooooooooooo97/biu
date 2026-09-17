import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'vitest'

const dir = import.meta.dirname

test('page-video owns its headless block, studio, and timeline UI contracts', async () => {
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as {
    id: string
    headless?: boolean
  }
  const src = await readFile(resolve(dir, 'web.tsx'), 'utf8')
  const host = await readFile(resolve(dir, 'host.ts'), 'utf8')
  const readme = await readFile(resolve(dir, 'README.md'), 'utf8')

  assert.equal(manifest.id, 'page-video')
  assert.equal(manifest.headless, true)
  assert.match(src, /kind: 'video'/)
  assert.match(src, /plugin: name/)
  assert.match(src, /function ScriptField/)
  assert.match(src, /data-testid="page-video-script"/)
  assert.match(src, /onLive\(next\)/)
  assert.match(src, /createPortal/)
  assert.match(src, /page-video-studio/)
  assert.match(src, /page-video-split/)
  assert.match(src, /全屏编辑/)
  assert.match(src, /className="pv-player-controls"/)
  assert.match(src, /className="pv-embed-script"/)
  assert.match(src, /className="pv-embed-timeline"/)
  assert.match(src, /function TrackIcon/)
  assert.match(src, /from '@heroicons\/react\/16\/solid'/)
  assert.match(src, /const TRACK_ICONS/)
  assert.match(src, /--pv-bg:var\(--dsw-bg/)
  assert.match(src, /--pv-panel:var\(--dsw-sidebar/)
  assert.match(src, /font-family:var\(--font-sans\)/)
  assert.match(src, /font-family:var\(--font-mono\)/)
  assert.match(src, /className="pv-stage-fit"/)
  assert.match(src, /new ResizeObserver/)
  assert.match(src, /el\.clientWidth \/ Math\.max\(1, project\.width\)/)

  assert.match(src, /application\/x-page-video-clip/)
  assert.match(src, /application\/x-page-video-mode/)
  assert.match(src, /dumpScript\(moveClip\(project, clipId, trackId, start\)\)/)
  assert.match(src, /resizeClip\(project, clipId, edge, at\)/)
  assert.match(src, /className="pv-clip-handle"/)
  assert.match(src, /data-testid=\{`page-video-clip-\$\{clip\.id\}`\}/)
  assert.match(src, /--pv-track-h:32px/)
  assert.match(src, /height:22px;border:0;border-radius:4px/)

  assert.match(src, /--pv-progress/)
  assert.match(src, /appearance:none;-webkit-appearance:none/)
  assert.match(src, /::-webkit-slider-runnable-track/)
  assert.match(src, /::-moz-range-progress/)
  assert.match(src, /\.pv-player-controls \.pv-icon:focus-visible\{outline:0/)

  assert.doesNotMatch(src, /pv-split:hover:after/)
  assert.doesNotMatch(src, /pv-foot-split:hover:after/)
  assert.doesNotMatch(src, /\.pv-src:focus\{[^}]*box-shadow/)
  assert.match(src, /function highlightTimelineScript/)
  assert.match(src, /className="pv-code-highlight"/)
  assert.match(src, /className: 'pv-code-tag'/)
  assert.match(src, /className: 'pv-code-attr'/)
  assert.match(src, /className: 'pv-code-value'/)
  assert.match(src, /highlight\.scrollTop = event\.currentTarget\.scrollTop/)

  assert.match(src, /function ComponentLayer/)
  assert.match(src, /function FillLayer/)
  assert.match(src, /data-pv-fill/)
  assert.match(src, /from '\.\/runtime\.ts'/)
  assert.match(src, /function isLegacySampleScript/)
  assert.match(src, /if \(migrateSample && writable\) update\(\{ script: SAMPLE_SCRIPT \}\)/)
  assert.doesNotMatch(src, /builtin:ad-beat/)
  assert.doesNotMatch(src, /from '\.\/beat\.ts'/)
  assert.doesNotMatch(src, /pv-embed:hover/)
  assert.doesNotMatch(src, /className="pv-transport"/)
  assert.doesNotMatch(src, /✅/)

  assert.match(host, /video_script/)
  assert.match(host, /\/api\/page-video\/compile/)
  assert.match(readme, /<timeline fps=30 size=1920x1080/)
  assert.match(readme, /<component src=hero\.js/)
  assert.match(readme, /<AbsoluteFill>/)
  assert.doesNotMatch(readme, /"script":/)
})
