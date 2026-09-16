import { createPortal } from 'react-dom'
import {
  cameraAt,
  clipAlpha,
  clipShift,
  clipsAt,
  compileSafe,
  isVideoSrc,
  parseProject,
  projectDuration,
  SAMPLE_SCRIPT,
  type Clip,
  type Project,
} from './compose.ts'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'page-video'
export const inject = ['pageEditor']

const STYLE_ID = 'pv-style-v3'
const STYLE_CSS = `
.pv{
  --pv-ink: var(--dsw-label, #37352f);
  --pv-mute: var(--dsw-label-3, #787774);
  --pv-line: var(--dsw-border, #e9e9e7);
  --pv-hover: var(--dsw-hover, rgba(55,53,47,.06));
  position:relative;
  color:var(--pv-ink);
  font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;
}
.pv-embed{
  overflow:hidden;
  border:1px solid var(--pv-line);
  border-radius:8px;
  background:var(--dsw-bg, #fff);
}
.pv-stage{
  position:relative;aspect-ratio:16/9;background:#191919;overflow:hidden;
}
.pv-cam{position:absolute;inset:0;transform-origin:center center;will-change:transform}
.pv-layer{position:absolute;inset:0}
.pv-frame{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:9% 10%;box-sizing:border-box}
.pv-kicker{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.55}
.pv-title{font-size:clamp(22px,4.4vw,40px);font-weight:700;letter-spacing:-.03em;margin-top:6px;line-height:1.15}
.pv-caption{
  position:absolute;left:8%;right:8%;bottom:10%;z-index:3;
  text-align:center;font-size:clamp(14px,2.1vw,20px);font-weight:600;
  text-shadow:0 1px 10px rgba(0,0,0,.4);
}
.pv-media{position:absolute;inset:0;width:100%;height:100%;background:#111}
.pv-rail{
  position:relative;height:28px;margin:0;background:color-mix(in srgb,var(--dsw-sidebar,#f7f6f3) 88%,transparent);
  border-top:1px solid var(--pv-line);
}
.pv-clip{
  position:absolute;top:7px;bottom:7px;border-radius:4px;
  font:10px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.88);
  padding:0 6px;display:flex;align-items:center;pointer-events:none;opacity:.92;
}
.pv-playhead{position:absolute;top:0;bottom:0;width:1px;background:#37352f;pointer-events:none}
.pv-chrome{
  position:absolute;top:8px;right:8px;z-index:4;
  display:flex;gap:2px;padding:2px;
  border-radius:6px;background:rgba(255,255,255,.92);
  box-shadow:0 1px 3px rgba(15,15,15,.08);
  opacity:0;pointer-events:none;transition:opacity .12s ease;
}
.pv-embed:hover .pv-chrome,.pv-embed:focus-within .pv-chrome{opacity:1;pointer-events:auto}
.pv-icon{
  width:26px;height:26px;border:0;border-radius:4px;background:transparent;
  color:#787774;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
}
.pv-icon:hover{background:var(--pv-hover);color:var(--pv-ink)}
.pv-studio{
  position:fixed;inset:0;z-index:2147483646;
  display:grid;grid-template-rows:44px 1fr 36px;
  background:#fff;color:#37352f;
}
.pv-studio:fullscreen,.pv-studio:-webkit-full-screen{width:100%;height:100%}
.pv-studio-bar,.pv-studio-foot{
  display:flex;align-items:center;gap:8px;padding:0 12px;
  border-bottom:1px solid #e9e9e7;font-size:12px;
}
.pv-studio-foot{border-bottom:0;border-top:1px solid #e9e9e7}
.pv-studio-name{font-weight:600}
.pv-studio-mute{margin-left:auto;color:#787774;font-variant-numeric:tabular-nums}
.pv-studio-body{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,380px);min-height:0}
.pv-studio .pv-stage{aspect-ratio:auto;height:100%;border-radius:0}
.pv-script{
  display:flex;flex-direction:column;min-height:0;border-left:1px solid #e9e9e7;background:#f7f6f3;
}
.pv-src{
  flex:1;min-height:0;width:100%;box-sizing:border-box;border:0;outline:none;resize:none;
  padding:14px 16px;background:transparent;color:#37352f;
  font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
.pv-err{padding:8px 16px;color:#c4554d;font-size:12px}
.pv-hint{padding:8px 16px 12px;color:#9b9a97;font-size:11px}
@media (max-width:720px){
  .pv-studio-body{grid-template-columns:1fr}
  .pv-script{border-left:0;border-top:1px solid #e9e9e7;min-height:180px}
}
`

function useStyle() {
  useEffect(() => {
    const el = (document.getElementById(STYLE_ID) as HTMLStyleElement | null) ?? document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function fmtClock(t: number) {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`
}

function assetUrl(src: string) {
  const file = src.replace(/^assets\//, '')
  if (!file) return ''
  if (/^https?:/i.test(file) || file.startsWith('/')) return file
  return `/api/page/file/${encodeURIComponent(file)}`
}

function cameraCss(project: Project, time: number) {
  const cam = cameraAt(project, time)
  const x = (0.5 - cam.cx) * 100 * (cam.scale - 1)
  const y = (0.5 - cam.cy) * 100 * (cam.scale - 1)
  return `translate(${x}%, ${y}%) scale(${cam.scale})`
}

function alphaAt(clip: Clip, time: number) {
  if (time < 0.05 && clip.start <= 0.05) return 1
  return clipAlpha(clip, time)
}

function MediaEl({ clip, time, playing }: { clip: Clip; time: number; playing: boolean }) {
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = Math.max(0, time - clip.start)
  const alpha = alphaAt(clip, time)
  const shift = clipShift(clip, time)
  const video = useRef<HTMLVideoElement | null>(null)
  const url = assetUrl(clip.src)
  const movie = isVideoSrc(clip.src)
  useEffect(() => {
    const el = video.current
    if (!el || !movie) return
    const drift = Math.abs((el.currentTime || 0) - local)
    if (!active) {
      el.pause()
      return
    }
    if (drift > 0.12) el.currentTime = local
    if (playing) {
      if (el.paused) void el.play().catch(() => undefined)
    } else if (!el.paused) el.pause()
  }, [active, local, movie, playing])
  const fit = { objectFit: clip.fit, opacity: active ? alpha : 0, transform: `translateX(${shift}px)` } as const
  if (movie) {
    return <video ref={video} className="pv-media" src={url} muted playsInline preload="auto" style={{ ...fit, pointerEvents: 'none' }} />
  }
  return <img className="pv-media" src={url} alt="" style={fit} />
}

function Stage({ project, time, playing }: { project: Project; time: number; playing: boolean }) {
  const active = clipsAt(project, time)
  const bases = active.filter((clip) => clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'media')
  const captions = active.filter((clip) => clip.kind === 'caption')
  const media = project.clips.filter((clip) => clip.kind === 'media')
  const bg = [...bases].reverse().find((clip) => clip.kind !== 'media')?.bg ?? '#191919'
  return (
    <div className="pv-stage" data-testid="page-video-stage" style={{ background: bg }}>
      <div className="pv-cam" data-testid="page-video-cam" style={{ transform: cameraCss(project, time) }}>
        {media.map((clip) => (
          <MediaEl key={clip.id} clip={clip} time={time} playing={playing} />
        ))}
        {bases
          .filter((clip) => clip.kind !== 'media')
          .map((clip) => (
            <div
              key={clip.id}
              className="pv-layer"
              style={{
                background: clip.bg,
                color: clip.ink,
                opacity: alphaAt(clip, time),
                transform: `translateX(${clipShift(clip, time)}px)`,
              }}
            >
              <div className="pv-frame">
                <div className="pv-kicker">{clip.kind}</div>
                <div className="pv-title">{clip.text || '·'}</div>
              </div>
            </div>
          ))}
      </div>
      {captions.map((clip) => (
        <div key={clip.id} className="pv-caption" style={{ color: clip.ink, opacity: alphaAt(clip, time) }}>
          {clip.text}
        </div>
      ))}
    </div>
  )
}

function ScriptField({
  value,
  onCommit,
  onLive,
  readOnly,
}: {
  value: string
  onCommit: (next: string) => void
  onLive: (next: string) => void
  readOnly: boolean
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  draftRef.current = draft
  valueRef.current = value
  onCommitRef.current = onCommit
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  useEffect(
    () => () => {
      if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
    },
    [],
  )
  return (
    <textarea
      data-testid="page-video-script"
      data-page-block-capture=""
      spellCheck={false}
      readOnly={readOnly}
      className="pv-src"
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = event.currentTarget.value
        setDraft(next)
        onLive(next)
      }}
    />
  )
}

function IconPlay({ running }: { running: boolean }) {
  return running ? (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3.5" y="3" width="3.1" height="10" rx="0.7" />
      <rect x="9.4" y="3" width="3.1" height="10" rx="0.7" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4.6 2.8v10.5L13 8.05z" />
    </svg>
  )
}

function IconExpand() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 3h4v1.4H4.4V7H3V3zm6 0h4v4h-1.4V4.4H9V3zM3 9h1.4v2.6H7V13H3V9zm6 2.6H12.6V9H14v4H9v-1.4z" />
    </svg>
  )
}

function Timeline({ project, duration, time, onSeek }: { project: Project; duration: number; time: number; onSeek: (t: number) => void }) {
  return (
    <div
      className="pv-rail"
      data-testid="page-video-rail"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / Math.max(1, rect.width)
        onSeek(Math.min(1, Math.max(0, x)) * duration)
      }}
    >
      {project.clips.map((clip) => (
        <ClipBar key={clip.id} clip={clip} duration={duration} />
      ))}
      <div className="pv-playhead" style={{ left: `${(time / duration) * 100}%` }} />
    </div>
  )
}

function ClipBar({ clip, duration }: { clip: Clip; duration: number }) {
  const overlay = clip.kind === 'caption' || clip.kind === 'zoom'
  return (
    <div
      className="pv-clip"
      title={clip.kind}
      style={{
        left: `${(clip.start / duration) * 100}%`,
        width: `${Math.max((clip.duration / duration) * 100, 2.4)}%`,
        top: overlay ? 16 : 6,
        bottom: overlay ? 4 : 14,
        background: clip.kind === 'zoom' ? '#79b8ff' : overlay ? 'rgba(55,53,47,.28)' : clip.bg,
      }}
    >
      {overlay ? '' : clip.kind}
    </div>
  )
}

function Studio({
  project,
  script,
  compiledOk,
  error,
  time,
  duration,
  playing,
  writable,
  onClose,
  onPlay,
  onSeek,
  onCommit,
  onLive,
}: {
  project: Project
  script: string
  compiledOk: boolean
  error?: string
  time: number
  duration: number
  playing: boolean
  writable: boolean
  onClose: () => void
  onPlay: () => void
  onSeek: (t: number) => void
  onCommit: (script: string) => void
  onLive: (script: string) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = rootRef.current
    void el?.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)
    const onFs = () => {
      if (!document.fullscreenElement) closeRef.current()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) void document.exitFullscreen?.()
    }
  }, [])
  return createPortal(
    <div ref={rootRef} className="pv-studio" data-testid="page-video-studio" data-page-block-capture="">
      <div className="pv-studio-bar">
        <span className="pv-studio-name">Video</span>
        <button type="button" className="pv-icon" aria-label={playing ? '暂停' : '播放'} onClick={onPlay}>
          <IconPlay running={playing} />
        </button>
        <span className="pv-studio-mute">
          {fmtClock(time)} / {fmtClock(duration)}
        </span>
        <button type="button" className="pv-icon" data-page-block-expand="" aria-label="退出全屏" onClick={onClose}>
          <IconExpand />
        </button>
      </div>
      <div className="pv-studio-body">
        <Stage project={project} time={time} playing={playing} />
        <div className="pv-script">
          <ScriptField value={script} onCommit={onCommit} onLive={onLive} readOnly={!writable} />
          {compiledOk ? <div className="pv-hint">&lt;video&gt; &lt;title&gt; &lt;scene&gt; &lt;caption&gt; &lt;media /&gt; &lt;zoom /&gt;</div> : <div className="pv-err">{error}</div>}
        </div>
      </div>
      <div className="pv-studio-foot">
        <Timeline project={project} duration={duration} time={time} onSeek={onSeek} />
      </div>
    </div>,
    document.body,
  )
}

function Editor({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  useStyle()
  const parsed = useMemo(() => parseProject(data), [data])
  const [liveScript, setLiveScript] = useState(parsed.script)
  const [open, setOpen] = useState(false)
  useEffect(() => setLiveScript(parsed.script), [parsed.script])
  const compiled = useMemo(() => compileSafe(liveScript || parsed.script), [liveScript, parsed.script])
  const project = compiled.ok ? compiled.project : parsed
  const duration = Math.max(0.2, projectDuration(project))
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!playing) return
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      setTime((t) => {
        const next = t + dt
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, duration])

  const commitScript = (script: string) => {
    const result = compileSafe(script)
    setLiveScript(script)
    update({ script: result.ok ? result.project.script : script })
  }

  const togglePlay = () => {
    if (time >= duration - 0.05) setTime(0)
    setPlaying((v) => !v)
  }

  return (
    <div className="pv" data-testid="page-video-editor">
      <div className="pv-embed">
        <div className="pv-chrome">
          <button type="button" className="pv-icon" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay}>
            <IconPlay running={playing} />
          </button>
          <button type="button" className="pv-icon" data-page-block-expand="" aria-label="全屏编辑" onClick={() => setOpen(true)}>
            <IconExpand />
          </button>
        </div>
        <Stage project={project} time={time} playing={playing} />
        <Timeline project={project} duration={duration} time={time} onSeek={setTime} />
      </div>
      {open ? (
        <Studio
          project={project}
          script={liveScript || SAMPLE_SCRIPT}
          compiledOk={compiled.ok}
          error={!compiled.ok ? compiled.error : undefined}
          time={time}
          duration={duration}
          playing={playing}
          writable={writable}
          onClose={() => setOpen(false)}
          onPlay={togglePlay}
          onSeek={setTime}
          onCommit={commitScript}
          onLive={setLiveScript}
        />
      ) : null}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown>
      View: (props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'video',
    plugin: name,
    label: '视频编排',
    blockType: 'video',
    blockTypeLabel: '视频',
    hint: '标签时间轴，全屏编辑脚本',
    aliases: ['video', 'timeline', 'remotion', 'openscreen', '影片'],
    defaults: { script: SAMPLE_SCRIPT },
    View: Editor,
  })
}
