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

const STYLE_ID = 'pv-style-v2'
const STYLE_CSS = `
.pv{
  --pv-line: var(--dsw-border);
  --pv-ink: var(--dsw-label);
  --pv-mute: var(--dsw-label-3);
  border:1px solid var(--pv-line);
  border-radius:12px;
  overflow:hidden;
  background:var(--dsw-bg);
  color:var(--pv-ink);
  font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;
}
.pv:fullscreen,.pv:-webkit-full-screen{border:0;border-radius:0;background:#0b0b0b;height:100%;}
.pv:fullscreen .pv-script,.pv:fullscreen .pv-hint,.pv:fullscreen .pv-err,
.pv:-webkit-full-screen .pv-script{display:none}
.pv:fullscreen .pv-top,.pv:-webkit-full-screen .pv-top{grid-template-columns:1fr;min-height:100%}
.pv:fullscreen .pv-stage{aspect-ratio:auto;height:calc(100% - 76px)}
.pv-top{display:grid;grid-template-columns:minmax(240px,1fr) minmax(280px,1.15fr);min-height:280px}
@media (max-width:720px){.pv-top{grid-template-columns:1fr}}
.pv-stage{position:relative;aspect-ratio:16/9;background:#0b0b0b;overflow:hidden}
.pv-cam{position:absolute;inset:0;transform-origin:center center;will-change:transform}
.pv-layer{position:absolute;inset:0}
.pv-frame{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8%;box-sizing:border-box}
.pv-kicker{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.7}
.pv-title{font-size:clamp(22px,4.6vw,42px);font-weight:800;letter-spacing:-.03em;margin-top:8px;line-height:1.15}
.pv-caption{
  position:absolute;left:8%;right:8%;bottom:10%;z-index:3;
  text-align:center;font-size:clamp(14px,2.2vw,22px);font-weight:650;
  text-shadow:0 1px 8px rgba(0,0,0,.45);
}
.pv-media{position:absolute;inset:0;width:100%;height:100%;background:#111}
.pv-script{
  display:flex;flex-direction:column;border-left:1px solid var(--pv-line);min-height:0;background:color-mix(in srgb,var(--dsw-hover) 55%,var(--dsw-bg));
}
@media (max-width:720px){.pv-script{border-left:0;border-top:1px solid var(--pv-line)}}
.pv-script-head,.pv-bar{
  display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--pv-line);font-size:12px;
}
.pv-bar{border-top:1px solid var(--pv-line);border-bottom:0}
.pv-src{
  flex:1;min-height:180px;width:100%;box-sizing:border-box;border:0;outline:none;resize:none;
  padding:10px 12px;background:transparent;color:inherit;
  font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
.pv-err{padding:6px 12px 10px;color:#c2410c;font-size:12px}
.pv-icon{border:0;border-radius:7px;padding:4px;background:transparent;color:var(--dsw-label-2);cursor:pointer}
.pv-icon:hover:not(:disabled){background:var(--dsw-hover);color:var(--pv-ink)}
.pv-time{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--pv-mute)}
.pv-rail{position:relative;height:56px;margin:8px 10px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-sidebar) 80%,#000)}
.pv-clip{
  position:absolute;border-radius:6px;overflow:hidden;
  border:1px solid color-mix(in srgb,#fff 18%,transparent);font:10px/1.2 ui-sans-serif,system-ui,sans-serif;
  color:#fff;padding:6px 7px;box-sizing:border-box;pointer-events:none;
}
.pv-playhead{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none}
.pv-hint{padding:0 12px 10px;color:var(--pv-mute);font-size:11px}
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

function MediaEl({
  clip,
  time,
  playing,
}: {
  clip: Clip
  time: number
  playing: boolean
}) {
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = Math.max(0, time - clip.start)
  const alpha = clipAlpha(clip, time)
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
    } else if (!el.paused) {
      el.pause()
    }
  }, [active, local, movie, playing])

  const fit = { objectFit: clip.fit, opacity: active ? alpha : 0, transform: `translateX(${shift}px)` } as const
  if (movie) {
    return (
      <video
        ref={video}
        className="pv-media"
        src={url}
        muted
        playsInline
        preload="auto"
        style={{ ...fit, pointerEvents: 'none' }}
      />
    )
  }
  return <img className="pv-media" src={url} alt="" style={fit} />
}

function Frame({
  project,
  time,
  playing,
}: {
  project: Project
  time: number
  playing: boolean
}) {
  const active = clipsAt(project, time)
  const bases = active.filter((clip) => clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'media')
  const captions = active.filter((clip) => clip.kind === 'caption')
  const media = project.clips.filter((clip) => clip.kind === 'media')
  const bg = [...bases].reverse().find((clip) => clip.kind !== 'media')?.bg ?? '#0b0b0b'

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
                opacity: clipAlpha(clip, time),
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
        <div key={clip.id} className="pv-caption" style={{ color: clip.ink, opacity: clipAlpha(clip, time) }}>
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
  useEffect(() => setLiveScript(parsed.script), [parsed.script])
  const compiled = useMemo(() => compileSafe(liveScript || parsed.script), [liveScript, parsed.script])
  const project = compiled.ok ? compiled.project : parsed
  const duration = Math.max(0.2, projectDuration(project))
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
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
    if (!result.ok) {
      update({ script })
      return
    }
    update({ ...result.project, script })
  }

  const seek = (event: { currentTarget: HTMLElement; clientX: number }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(1, rect.width)
    setTime(Math.min(1, Math.max(0, x)) * duration)
  }

  const expand = () => {
    const el = rootRef.current
    if (!el) return
    void el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)
    if (time >= duration - 0.05) setTime(0)
    setPlaying(true)
  }

  return (
    <div className="pv" data-testid="page-video-editor" ref={rootRef}>
      <div className="pv-top">
        <Frame project={project} time={time} playing={playing} />
        <div className="pv-script">
          <div className="pv-script-head">
            <span style={{ fontWeight: 700 }}>script</span>
            <span className="pv-time">
              {project.width}×{project.height} · live
            </span>
          </div>
          <ScriptField
            value={parsed.script || SAMPLE_SCRIPT}
            onCommit={commitScript}
            onLive={setLiveScript}
            readOnly={!writable}
          />
          {!compiled.ok ? (
            <div className="pv-err">{compiled.error}</div>
          ) : (
            <div className="pv-hint">&lt;video&gt; &lt;media&gt; &lt;zoom at cx cy depth /&gt; · compositor</div>
          )}
        </div>
      </div>
      <div className="pv-bar">
        <button
          type="button"
          className="pv-icon"
          aria-label={playing ? '暂停' : '播放'}
          onClick={() => {
            if (time >= duration - 0.05) setTime(0)
            setPlaying((v) => !v)
          }}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3.5" y="3" width="3.2" height="10" rx="0.8" />
              <rect x="9.3" y="3" width="3.2" height="10" rx="0.8" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4.4 2.7v10.6L13.2 8z" />
            </svg>
          )}
        </button>
        <button type="button" className="pv-icon" data-page-block-expand="" aria-label="放大放映" onClick={expand}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M3 3h4v1.5H4.5V7H3V3zm6 0h4v4h-1.5V4.5H9V3zM3 9h1.5v2.5H7V13H3V9zm6 2.5H12.5V9H14v4H9v-1.5z" />
          </svg>
        </button>
        <span className="pv-time">
          {fmtClock(time)} / {fmtClock(duration)}
        </span>
      </div>
      <div className="pv-rail" data-testid="page-video-rail" onClick={seek}>
        {project.clips.map((clip) => (
          <ClipBar key={clip.id} clip={clip} duration={duration} />
        ))}
        <div className="pv-playhead" style={{ left: `${(time / duration) * 100}%` }} />
      </div>
    </div>
  )
}

function ClipBar({ clip, duration }: { clip: Clip; duration: number }) {
  const left = (clip.start / duration) * 100
  const width = (clip.duration / duration) * 100
  const overlay = clip.kind === 'caption' || clip.kind === 'zoom'
  return (
    <div
      className="pv-clip"
      title={`${clip.kind} ${clip.id}`}
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 3)}%`,
        top: overlay ? 28 : 8,
        bottom: overlay ? 8 : 22,
        background: clip.kind === 'zoom' ? 'color-mix(in srgb,#60a5fa 55%,transparent)' : overlay ? 'color-mix(in srgb,#fff 22%,transparent)' : clip.bg,
      }}
    >
      {clip.kind}
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
    hint: '标签时间轴，前端实时合成播放',
    aliases: ['video', 'timeline', 'remotion', 'openscreen', '影片'],
    defaults: (() => {
      const result = compileSafe(SAMPLE_SCRIPT)
      return result.ok ? result.project : { script: SAMPLE_SCRIPT }
    })(),
    View: Editor,
  })
}
