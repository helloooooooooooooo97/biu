import { createPortal } from 'react-dom'
import {
  annotationMotion,
  cameraAt,
  clipAlpha,
  clipEnd,
  clipShift,
  clipsAt,
  compileSafe,
  cursorAt,
  formatReport,
  isVideoSrc,
  parseProject,
  projectDuration,
  SAMPLE_SCRIPT,
  speedAt,
  type Clip,
  type Project,
} from './compose.ts'

const React = globalThis.React
const { useEffect, useId, useMemo, useRef, useState } = React

export const name = 'page-video'
export const inject = ['pageEditor']

const STYLE_ID = 'pv-style-v5'
const STYLE_CSS = `
.pv{
  --pv-ink: var(--dsw-label, #37352f);
  --pv-mute: var(--dsw-label-3, #787774);
  --pv-line: var(--dsw-border, #e9e9e7);
  --pv-hover: var(--dsw-hover, rgba(55,53,47,.06));
  --pv-blue:#2383e2;
  position:relative;
  color:var(--pv-ink);
  font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;
}
.pv-embed{
  position:relative;
  overflow:hidden;
  border:1px solid var(--pv-line);
  border-radius:10px;
  background:var(--dsw-bg, #fff);
  box-shadow:0 1px 2px rgba(15,15,15,.025);
  transition:border-color .16s ease,box-shadow .16s ease;
}
.pv-embed:hover{border-color:color-mix(in srgb,var(--pv-ink) 22%,var(--pv-line));box-shadow:0 2px 8px rgba(15,15,15,.045)}
.pv-stage{
  position:relative;aspect-ratio:16/9;background:#191919;overflow:hidden;
}
.pv-screen{position:absolute;overflow:hidden;isolation:isolate;perspective:1400px}
.pv-cam{position:absolute;inset:0;transform-origin:center center;will-change:transform;transform-style:preserve-3d}
.pv-layer{position:absolute;inset:0}
.pv-frame{position:absolute;inset:0;display:flex;flex-direction:column;padding:9% 10%;box-sizing:border-box}
.pv-kicker{position:absolute;top:9%;left:10%;right:10%;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.55}
.pv-title{font-size:clamp(22px,4.4vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.15;width:100%}
.pv-caption{
  position:absolute;left:8%;right:8%;bottom:10%;z-index:3;
  text-align:center;font-size:clamp(14px,2.1vw,20px);font-weight:600;
  text-shadow:0 1px 10px rgba(0,0,0,.4);
}
.pv-media{position:absolute;inset:0;width:100%;height:100%;background:#111}
.pv-effect{position:absolute;z-index:5;pointer-events:none;box-sizing:border-box}
.pv-text{white-space:pre-wrap;line-height:1.2;box-sizing:border-box;text-shadow:0 2px 12px rgba(0,0,0,.3)}
.pv-arrow{overflow:visible}
.pv-blur{transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06)}
.pv-mosaic{image-rendering:pixelated;background:repeating-conic-gradient(#c8c8c8 0% 25%,#8a8a8a 0% 50%) 0 0/12px 12px}
.pv-box{transform:translate(-50%,-50%);border:2px solid currentColor;background:color-mix(in srgb,currentColor 12%,transparent)}
.pv-spotlight{transform:translate(-50%,-50%);box-shadow:0 0 0 200vmax rgba(0,0,0,.55)}
.pv-stamp{display:flex;transform:translate(-50%,-50%);border-radius:999px;font-weight:700;letter-spacing:.02em}
.pv-trim{position:absolute;inset:0;z-index:6;pointer-events:none}
.pv-trim i{display:block;background:#050505}
.pv-cursor{transform:translate(-8%,-8%);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transform-origin:8% 8%}
.pv-click{position:absolute;left:0;top:0;width:100%;height:100%;border:2px solid currentColor;border-radius:50%;transform:scale(1.7);opacity:.75}
.pv-pip{transform:translate(-50%,-50%);overflow:hidden;border:2px solid rgba(255,255,255,.9);box-shadow:0 8px 28px rgba(0,0,0,.24);background:#111}
.pv-pip .pv-media{position:absolute}
.pv-image{transform:translate(-50%,-50%);object-fit:contain;filter:drop-shadow(0 6px 16px rgba(0,0,0,.2))}
.pv-rail{
  --pv-track-h:28px;
  position:relative;margin:0;background:color-mix(in srgb,var(--dsw-sidebar,#f7f6f3) 88%,transparent);
  border-top:1px solid var(--pv-line);
  display:grid;grid-template-columns:74px minmax(0,1fr);overflow:hidden;
}
.pv-track-labels{border-right:1px solid var(--pv-line);background:color-mix(in srgb,var(--dsw-sidebar,#f7f6f3) 92%,#fff)}
.pv-track-label{
  height:var(--pv-track-h);box-sizing:border-box;padding:0 7px;display:flex;align-items:center;gap:5px;
  border-bottom:1px solid var(--pv-line);
  color:var(--pv-mute);font:10px/1 ui-sans-serif,system-ui,sans-serif;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
}
.pv-track-label svg{width:12px;height:12px;flex:none;color:var(--pv-ink);opacity:.68}
.pv-lanes{position:relative;min-width:0;cursor:pointer;outline:none}
.pv-lanes:before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    repeating-linear-gradient(to bottom,rgba(255,255,255,.28) 0,rgba(255,255,255,.28) calc(var(--pv-track-h) - 1px),var(--pv-line) calc(var(--pv-track-h) - 1px),var(--pv-line) var(--pv-track-h)),
    repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),rgba(55,53,47,.055) calc(10% - 1px),rgba(55,53,47,.055) 10%);
}
.pv-clip{
  position:absolute;height:18px;border:1px solid var(--pv-line);border-radius:4px;
  font:10px/1 ui-sans-serif,system-ui,sans-serif;color:var(--pv-mute);
  padding:0 6px;display:flex;align-items:center;box-sizing:border-box;pointer-events:none;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  background:color-mix(in srgb,var(--dsw-sidebar,#f7f6f3) 86%,#fff);
}
.pv-clip[data-tone="effect"]{background:#e9eff5;border-color:#d8e2ec;color:#52677a}
.pv-clip[data-tone="audio"]{background:#e9f1eb;border-color:#d8e6dc;color:#55705d}
.pv-playhead{position:absolute;top:0;bottom:0;width:1px;background:var(--pv-blue);pointer-events:none;z-index:3}
.pv-playhead:before{content:"";position:absolute;left:-3px;top:0;width:7px;height:7px;border-radius:1px 1px 50% 50%;background:var(--pv-blue)}
.pv-player-controls{
  height:38px;padding:0 7px;display:flex;align-items:center;gap:3px;
  border-top:1px solid var(--pv-line);background:var(--dsw-bg,#fff);
}
.pv-player-time{margin-left:3px;color:var(--pv-mute);font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.pv-player-spacer{flex:1}
.pv-audio-only{border-radius:8px}
.pv-audio-only .pv-player-controls{border-top:0}
.pv-audio-scrub{min-width:72px;flex:1;height:3px;margin:0 8px;accent-color:var(--pv-blue);cursor:pointer}
.pv-track-toggle{width:auto;padding:0 7px;gap:4px;font-size:11px}
.pv-track-toggle svg{transition:transform .16s ease}
.pv-track-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
.pv-embed-timeline{border-top:1px solid var(--pv-line)}
.pv-embed-timeline .pv-rail{border-top:0}
.pv-icon{
  width:26px;height:26px;border:0;border-radius:4px;background:transparent;
  color:#787774;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  transition:background .1s ease,color .1s ease,transform .08s ease;
}
.pv-icon:hover{background:var(--pv-hover);color:var(--pv-ink)}
.pv-icon:active{background:color-mix(in srgb,var(--pv-ink) 10%,transparent);transform:scale(.96)}
.pv-icon:focus-visible,.pv-lanes:focus-visible{outline:2px solid rgba(35,131,226,.55);outline-offset:-2px}
.pv-studio{
  --studio-line:#e7e7e5;
  --studio-panel:#f7f7f5;
  --script-w:420px;
  --foot-h:208px;
  position:fixed;inset:0;z-index:2147483646;
  display:grid;grid-template-rows:48px minmax(0,1fr) 6px var(--foot-h);
  background:#f7f7f5;color:#37352f;
}
.pv-studio[data-resize="col"]{cursor:col-resize}
.pv-studio[data-resize="col"] *{cursor:col-resize !important;user-select:none}
.pv-studio[data-resize="row"]{cursor:row-resize}
.pv-studio[data-resize="row"] *{cursor:row-resize !important;user-select:none}
.pv-studio:fullscreen,.pv-studio:-webkit-full-screen{width:100%;height:100%}
.pv-studio-bar{
  position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  padding:0 14px;border-bottom:1px solid var(--studio-line);background:#fff;font-size:12px;
}
.pv-brand{display:flex;align-items:center;gap:9px;min-width:0}
.pv-brand-mark{width:22px;height:22px;border-radius:5px;background:#37352f;color:#fff;display:grid;place-items:center;font:700 9px/1 ui-monospace,monospace;letter-spacing:-.05em}
.pv-studio-name{font-weight:600;white-space:nowrap}
.pv-studio-sub{color:#9b9a97;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-studio-actions{justify-self:end;display:flex;align-items:center;gap:4px}
.pv-transport{display:flex;align-items:center;gap:4px;padding:3px;border:1px solid var(--studio-line);border-radius:7px;background:#fff;box-shadow:0 1px 2px rgba(15,15,15,.035)}
.pv-timecode{min-width:96px;text-align:center;color:#5f5e5b;font:11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.pv-live{display:flex;align-items:center;gap:6px;color:#787774;font-size:11px;margin-right:8px}
.pv-live-dot{width:6px;height:6px;border-radius:50%;background:#36a269;box-shadow:0 0 0 3px rgba(54,162,105,.1)}
.pv-studio-body{display:grid;grid-template-columns:minmax(240px,1fr) 6px var(--script-w);min-height:0;min-width:0}
.pv-split{
  width:6px;cursor:col-resize;background:transparent;position:relative;z-index:2;touch-action:none;
}
.pv-split:hover,.pv-split.is-drag{background:color-mix(in srgb,var(--pv-blue) 42%,transparent)}
.pv-split:before{content:"";position:absolute;inset:0 -5px}
.pv-foot-split{
  height:6px;cursor:row-resize;background:transparent;position:relative;z-index:2;touch-action:none;
}
.pv-foot-split:hover,.pv-foot-split.is-drag{background:color-mix(in srgb,var(--pv-blue) 42%,transparent)}
.pv-foot-split:before{content:"";position:absolute;inset:-4px 0}
.pv-canvas{
  container-type:size;min-width:0;min-height:0;padding:18px 20px;
  display:grid;place-items:center;
  background:#efefed;
  background-image:radial-gradient(circle,rgba(55,53,47,.13) .65px,transparent .75px);
  background-size:14px 14px;
}
.pv-canvas-frame{
  position:relative;width:min(100cqw,calc(100cqh * 16 / 9));aspect-ratio:16/9;height:auto;
  background:#191919;border-radius:6px;overflow:hidden;
  box-shadow:0 16px 48px rgba(15,15,15,.16),0 0 0 1px rgba(15,15,15,.12);
}
.pv-canvas-frame .pv-stage{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.pv-script{
  display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;border-left:1px solid var(--studio-line);background:#fff;
}
.pv-script-head{
  flex:none;display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;
  border-bottom:1px solid var(--studio-line);font-size:11px;color:#787774;
}
.pv-code-mark{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#37352f}
.pv-valid{margin-left:auto;display:flex;align-items:center;gap:5px;color:#36a269}
.pv-invalid{margin-left:auto;color:#c4554d}
.pv-line-no{
  flex:none;width:32px;padding:14px 0 14px 10px;box-sizing:border-box;
  color:#c2c1be;background:#fbfbfa;text-align:right;white-space:pre;
  font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none;overflow:hidden;
}
.pv-code-wrap{display:flex;flex:1;min-height:0}
.pv-code-wrap .pv-src{
  white-space:pre;tab-size:2;
}
.pv-src{
  flex:1;min-height:0;width:100%;box-sizing:border-box;border:0;outline:none;resize:none;
  padding:14px 16px 14px 10px;background:#fbfbfa;color:#37352f;
  font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
.pv-src:focus{background:#fff;box-shadow:inset 2px 0 #37352f}
.pv-err,.pv-hint{
  flex:0 0 32px;box-sizing:border-box;display:flex;align-items:center;
  padding:0 12px;border-top:1px solid var(--studio-line);font-size:11px;
}
.pv-err{color:#9f3f3a;background:#fff8f7}
.pv-hint{color:#9b9a97;background:#fff}
.pv-studio-foot{
  min-height:0;border-top:1px solid var(--studio-line);background:#fff;
  display:grid;grid-template-rows:32px minmax(0,1fr);overflow:hidden;
}
.pv-timeline-head{display:flex;align-items:center;padding:0 12px;border-bottom:1px solid var(--studio-line);font-size:11px;color:#787774}
.pv-timeline-head strong{color:#37352f;font-weight:600;margin-right:8px}
.pv-duration{margin-left:auto;font-variant-numeric:tabular-nums}
.pv-studio-foot .pv-rail{border-top:0;margin:0 12px 12px;border:1px solid var(--studio-line);background:#fbfbfa;overflow:auto}
.pv-studio-foot .pv-clip{height:18px;border-radius:4px;padding:0 8px}
@media (max-width:720px){
  .pv-studio{grid-template-rows:48px minmax(0,1fr) 110px}
  .pv-studio-body{grid-template-columns:1fr;grid-template-rows:minmax(220px,1fr) minmax(160px,1fr)}
  .pv-split,.pv-foot-split{display:none}
  .pv-canvas{padding:14px;min-height:220px}
  .pv-script{border-left:0;border-top:1px solid #e9e9e7;min-height:160px}
  .pv-studio-sub,.pv-live{display:none}
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
  return `translate(${x}%, ${y}%) scale(${cam.scale}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) rotateZ(${cam.rz}deg)`
}

function alphaAt(clip: Clip, time: number) {
  if (time < 0.05 && clip.start <= 0.05) return 1
  return clipAlpha(clip, time)
}

function MediaEl({ clip, time, playing, rate = 1 }: { clip: Clip; time: number; playing: boolean; rate?: number }) {
  const playback = Math.max(0.1, clip.speed * rate)
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = clip.sourceIn + Math.max(0, time - clip.start) * playback
  const alpha = alphaAt(clip, time)
  const shift = clipShift(clip, time)
  const video = useRef<HTMLVideoElement | null>(null)
  const url = assetUrl(clip.src)
  const movie = isVideoSrc(clip.src)
  useEffect(() => {
    const el = video.current
    if (!el || !movie) return
    el.playbackRate = playback
    const drift = Math.abs((el.currentTime || 0) - local)
    if (!active) {
      el.pause()
      return
    }
    if (drift > 0.12) el.currentTime = local
    if (playing) {
      if (el.paused) void el.play().catch(() => undefined)
    } else if (!el.paused) el.pause()
  }, [active, playback, local, movie, playing])
  const [cropX, cropY, cropW, cropH] = clip.crop
  const fit = {
    objectFit: clip.fit,
    opacity: active ? alpha : 0,
    transform: `translateX(${shift}px)`,
    width: `${100 / cropW}%`,
    height: `${100 / cropH}%`,
    left: `${(-cropX / cropW) * 100}%`,
    top: `${(-cropY / cropH) * 100}%`,
    zIndex: clip.layer,
  } as const
  if (movie) {
    return <video ref={video} className="pv-media" src={url} muted playsInline preload="auto" style={{ ...fit, pointerEvents: 'none' }} />
  }
  return <img className="pv-media" src={url} alt="" style={fit} />
}

function TextEffect({ clip, time }: { clip: Clip; time: number }) {
  const motion = annotationMotion(clip, time)
  const count = Math.ceil(Array.from(clip.text).length * motion.reveal)
  const text = clip.anim === 'typewriter' ? Array.from(clip.text).slice(0, count).join('') : clip.text
  const valign = clip.valign === 'top' ? 'flex-start' : clip.valign === 'bottom' ? 'flex-end' : 'center'
  const halign = clip.align === 'left' ? 'flex-start' : clip.align === 'right' ? 'flex-end' : 'center'
  return (
    <div
      className="pv-effect pv-text"
      style={{
        left: `${(clip.x - clip.w / 2) * 100}%`,
        top: `${(clip.y - clip.h / 2) * 100}%`,
        width: `${clip.w * 100}%`,
        height: `${clip.h * 100}%`,
        color: clip.color,
        fontSize: clip.size,
        fontWeight: clip.weight,
        fontStyle: clip.italic ? 'italic' : undefined,
        textDecoration: clip.underline ? 'underline' : undefined,
        padding: clip.pad,
        display: 'flex',
        alignItems: valign,
        justifyContent: halign,
        textAlign: clip.align,
        opacity: motion.opacity,
        transform: `translate(${motion.translateX}px, ${motion.translateY}px) scale(${motion.scale})`,
      }}
    >
      {text}
    </div>
  )
}

function ArrowEffect({ clip }: { clip: Clip }) {
  const x1 = clip.x * 100
  const y1 = clip.y * 100
  const x2 = clip.x2 * 100
  const y2 = clip.y2 * 100
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.min(4, 1.2 + clip.amount * 0.35)
  return (
    <svg className="pv-effect pv-arrow" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ inset: 0, width: '100%', height: '100%' }}>
      <path
        d={`M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${x2 - Math.cos(angle - 0.55) * head} ${y2 - Math.sin(angle - 0.55) * head} M ${x2} ${y2} L ${x2 - Math.cos(angle + 0.55) * head} ${y2 - Math.sin(angle + 0.55) * head}`}
        fill="none"
        stroke={clip.color}
        strokeWidth={clip.amount / 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function CursorEffect({ clip, time }: { clip: Clip; time: number }) {
  const cursor = cursorAt(clip, time)
  return (
    <div
      className="pv-effect pv-cursor"
      style={{
        left: `${cursor.x * 100}%`,
        top: `${cursor.y * 100}%`,
        width: clip.size,
        height: clip.size,
        color: clip.color,
        transform: `translate(-8%,-8%) scale(${1 - cursor.click * 0.15})`,
      }}
    >
      <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden>
        <path d="M5 2.8 26 18l-9.3 1.5-5.1 8.2z" fill={clip.color} stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {cursor.click > 0 ? <i className="pv-click" style={{ opacity: cursor.click * 0.75 }} /> : null}
    </div>
  )
}

function OverlayEffect({ clip, time, playing }: { clip: Clip; time: number; playing: boolean }) {
  if (clip.kind === 'text') return <TextEffect clip={clip} time={time} />
  if (clip.kind === 'arrow') return <ArrowEffect clip={clip} />
  if (clip.kind === 'cursor') return <CursorEffect clip={clip} time={time} />
  if (clip.kind === 'blur') {
    return (
      <div
        className={`pv-effect ${clip.mode === 'mosaic' ? 'pv-mosaic' : 'pv-blur'}`}
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          width: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          borderRadius: clip.shape === 'circle' ? '50%' : clip.shape === 'rounded' ? 14 : 2,
          backdropFilter: clip.mode === 'mosaic' ? 'none' : `blur(${clip.amount}px)`,
        }}
      />
    )
  }
  if (clip.kind === 'box') {
    return (
      <div
        className="pv-effect pv-box"
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          width: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          color: clip.color,
          borderRadius: clip.shape === 'circle' ? '50%' : clip.shape === 'rounded' ? 14 : 2,
          borderWidth: Math.max(1, clip.amount / 4),
        }}
      />
    )
  }
  if (clip.kind === 'spotlight') {
    return (
      <div
        className="pv-effect pv-spotlight"
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          width: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          borderRadius: clip.shape === 'rectangle' ? 6 : '50%',
        }}
      />
    )
  }
  if (clip.kind === 'stamp') {
    return (
      <div
        className="pv-effect pv-stamp"
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          minWidth: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          color: clip.ink,
          background: clip.bg,
          fontSize: clip.size,
          padding: `0 ${clip.pad}px`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {clip.text || 'REC'}
      </div>
    )
  }
  if (clip.kind === 'trim') {
    const left = clip.x * 100
    const top = clip.y * 100
    const right = Math.max(0, (1 - clip.x - clip.w) * 100)
    const bottom = Math.max(0, (1 - clip.y - clip.h) * 100)
    return (
      <div className="pv-trim" aria-hidden>
        <i style={{ position: 'absolute', inset: `0 auto 0 0`, width: `${left}%` }} />
        <i style={{ position: 'absolute', inset: `0 0 0 auto`, width: `${right}%` }} />
        <i style={{ position: 'absolute', inset: `0 ${right}% auto ${left}%`, height: `${top}%` }} />
        <i style={{ position: 'absolute', inset: `auto ${right}% 0 ${left}%`, height: `${bottom}%` }} />
      </div>
    )
  }
  if (clip.kind === 'pip') {
    return (
      <div
        className="pv-effect pv-pip"
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          width: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          borderRadius: clip.shape === 'circle' ? '50%' : clip.shape === 'rounded' ? 16 : 4,
        }}
      >
        <MediaEl clip={clip} time={time} playing={playing} rate={1} />
      </div>
    )
  }
  if (clip.kind === 'image') {
    const motion = annotationMotion(clip, time)
    return (
      <img
        className="pv-effect pv-image"
        src={assetUrl(clip.src)}
        alt=""
        style={{
          left: `${clip.x * 100}%`,
          top: `${clip.y * 100}%`,
          width: `${clip.w * 100}%`,
          height: `${clip.h * 100}%`,
          borderRadius: clip.shape === 'circle' ? '50%' : clip.shape === 'rounded' ? 14 : 0,
          opacity: motion.opacity,
          transform: `translate(calc(-50% + ${motion.translateX}px),calc(-50% + ${motion.translateY}px)) scale(${motion.scale})`,
        }}
      />
    )
  }
  return null
}

function AudioEffect({ clip, time, playing }: { clip: Clip; time: number; playing: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = clip.sourceIn + Math.max(0, time - clip.start) * clip.speed
  useEffect(() => {
    const el = audio.current
    if (!el) return
    el.volume = clip.volume
    el.playbackRate = clip.speed
    if (!active) {
      el.pause()
      return
    }
    if (Math.abs(el.currentTime - local) > 0.12) el.currentTime = local
    if (playing) void el.play().catch(() => undefined)
    else el.pause()
  }, [active, clip.speed, clip.volume, local, playing])
  return <audio ref={audio} src={assetUrl(clip.src)} preload="auto" />
}

function Stage({ project, time, playing }: { project: Project; time: number; playing: boolean }) {
  const active = clipsAt(project, time)
  const bases = active.filter((clip) => clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'media' || clip.kind === 'solid')
  const captions = active.filter((clip) => clip.kind === 'caption')
  const effects = active.filter((clip) =>
    clip.kind === 'text' ||
    clip.kind === 'arrow' ||
    clip.kind === 'blur' ||
    clip.kind === 'cursor' ||
    clip.kind === 'pip' ||
    clip.kind === 'image' ||
    clip.kind === 'box' ||
    clip.kind === 'spotlight' ||
    clip.kind === 'stamp' ||
    clip.kind === 'trim',
  )
  const audio = project.clips.filter((clip) => clip.kind === 'audio')
  const media = project.clips.filter((clip) => clip.kind === 'media')
  const bg = [...bases].reverse().find((clip) => clip.kind !== 'media')?.bg ?? '#191919'
  const zoom = active.find((clip) => clip.kind === 'zoom')
  const zoomProgress = zoom ? Math.max(0, Math.min(1, (time - zoom.start) / zoom.duration)) : 0
  const motionBlur = zoom ? Math.sin(zoomProgress * Math.PI) * Math.min(4, (zoom.depth - 1) * 3) : 0
  const wallpaper = project.wallpaper ? `url("${assetUrl(project.wallpaper)}")` : undefined
  const inset = `${project.padding}%`
  return (
    <div
      className="pv-stage"
      data-testid="page-video-stage"
      style={{
        backgroundColor: project.background,
        backgroundImage: wallpaper,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="pv-screen"
        style={{
          inset,
          borderRadius: project.radius,
          boxShadow: project.shadow ? `0 ${project.shadow / 3}px ${project.shadow}px rgba(15,15,15,.32)` : undefined,
          background: bg,
        }}
      >
        <div
          className="pv-cam"
          data-testid="page-video-cam"
          style={{ transform: cameraCss(project, time), filter: motionBlur > 0.1 ? `blur(${motionBlur}px)` : undefined }}
        >
          {media.map((clip) => (
            <MediaEl key={clip.id} clip={clip} time={time} playing={playing} rate={speedAt(project, time)} />
          ))}
          {bases
            .filter((clip) => clip.kind !== 'media' && clip.kind !== 'gap')
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
                <div
                  className="pv-frame"
                  style={{
                    justifyContent: clip.valign === 'top' ? 'flex-start' : clip.valign === 'bottom' ? 'flex-end' : 'center',
                    alignItems: clip.align === 'left' ? 'flex-start' : clip.align === 'right' ? 'flex-end' : 'center',
                    textAlign: clip.align,
                  }}
                >
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
        {effects.map((clip) => (
          <OverlayEffect key={clip.id} clip={clip} time={time} playing={playing} />
        ))}
      </div>
      {audio.map((clip) => (
        <AudioEffect key={clip.id} clip={clip} time={time} playing={playing} />
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
  const lineCount = Math.max(1, draft.split('\n').length)
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
    <div className="pv-code-wrap">
      <div className="pv-line-no" aria-hidden>{Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}</div>
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
    </div>
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

function IconChevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

type TimelineTrack = {
  id: string
  kind: Clip['kind']
  label: string
  clips: Clip[]
}

const TRACK_ORDER: Clip['kind'][] = ['title', 'scene', 'solid', 'media', 'zoom', 'text', 'caption', 'arrow', 'blur', 'box', 'spotlight', 'stamp', 'cursor', 'pip', 'image', 'speed', 'trim', 'gap', 'audio']
const TRACK_HEIGHT = 28
const TRACK_ICON_PATH: Record<Clip['kind'], string> = {
  title: 'M3 3.5h10M8 3.5v9M5.5 12.5h5',
  scene: 'M2.5 3.5h11v9h-11zM5 3.5v9M11 3.5v9',
  solid: 'M2.5 3.5h11v9h-11z',
  media: 'M2.5 4h7.5v8H2.5zM10 6.5l3.5-2v7L10 9.5',
  zoom: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm3.2-1.3 3.3 3.3M7 4.5v5M4.5 7h5',
  text: 'M3 4V2.5h10V4M8 2.5v11M5.5 13.5h5',
  caption: 'M2.5 3.5h11v7.5h-6l-3 2v-2h-2zM5 6.5h6M5 8.5h4',
  arrow: 'M2.5 12.5 13 3m-5 .5h5v5',
  blur: 'M8 2.5c2.2 3 3.5 4.8 3.5 6.7A3.5 3.5 0 0 1 8 12.7a3.5 3.5 0 0 1-3.5-3.5C4.5 7.3 5.8 5.5 8 2.5z',
  box: 'M3 3.5h10v9H3z',
  spotlight: 'M8 2.5v2.2M8 13.5v-2.2M2.5 8h2.2M13.5 8h-2.2M5 5l1.6 1.5M11 5 9.4 6.5M5 11l1.6-1.5M11 11 9.4 9.5',
  stamp: 'M3.5 7h9v6h-9zM5.2 7V5.4a2.8 2.8 0 0 1 5.6 0V7',
  cursor: 'M3 2.5 12.5 9 8 10l-2 3.5z',
  pip: 'M2.5 3.5h11v9h-11zM8 7.5h4v3H8z',
  image: 'M2.5 3.5h11v9h-11zM3 11l3.3-3.5 2.2 2 1.5-1.3 3 2.8M10.8 6.3h.1',
  speed: 'M3 8h3.2l.9-3 1.6 6L10 8h3',
  trim: 'M4.5 3v10M11.5 3v10M4.5 8h7',
  gap: 'M3 8h10',
  audio: 'M2.5 7h2.8L9 4v8l-3.7-3H2.5zM11 6c1.2 1.1 1.2 2.9 0 4M12.7 4.5c2.1 2 2.1 5 0 7',
}

function TrackIcon({ kind }: { kind: Clip['kind'] }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={TRACK_ICON_PATH[kind]} />
    </svg>
  )
}

function timelineTracks(project: Project): TimelineTrack[] {
  if (project.tracks.length) {
    return project.tracks.map((lane) => ({
      id: lane.id,
      kind: lane.clips[0]?.kind ?? 'scene',
      label: lane.name,
      clips: lane.clips,
    }))
  }
  const tracks: TimelineTrack[] = []
  for (const kind of TRACK_ORDER) {
    const sameKind = project.clips.filter((clip) => clip.kind === kind).sort((a, b) => a.start - b.start || a.duration - b.duration)
    const lanes: Clip[][] = []
    for (const clip of sameKind) {
      const lane = lanes.find((items) => {
        const previous = items[items.length - 1]
        return !previous || previous.start + previous.duration <= clip.start
      })
      if (lane) lane.push(clip)
      else lanes.push([clip])
    }
    lanes.forEach((items, index) => {
      const suffix = lanes.length > 1 ? ` ${index + 1}` : ''
      tracks.push({ id: `${kind}-${index}`, kind, label: `${kind[0].toUpperCase()}${kind.slice(1)}${suffix}`, clips: items })
    })
  }
  return tracks
}

function Timeline({ project, duration, time, onSeek }: { project: Project; duration: number; time: number; onSeek: (t: number) => void }) {
  const seekBy = (delta: number) => onSeek(Math.min(duration, Math.max(0, time + delta)))
  const tracks = timelineTracks(project)
  const railHeight = `${Math.max(1, tracks.length) * TRACK_HEIGHT}px`
  return (
    <div className="pv-rail" data-testid="page-video-rail" style={{ height: railHeight }}>
      <div className="pv-track-labels" aria-hidden>
        {tracks.map((track) => (
          <div className="pv-track-label" key={track.id} title={track.label}>
            <TrackIcon kind={track.kind} />
            <span>{track.label}</span>
          </div>
        ))}
      </div>
      <div
        className="pv-lanes"
        role="slider"
        tabIndex={0}
        aria-label="视频时间轴"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.min(duration, time)}
        aria-valuetext={`${fmtClock(time)} / ${fmtClock(duration)}`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - rect.left) / Math.max(1, rect.width)
          onSeek(Math.min(1, Math.max(0, x)) * duration)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            event.stopPropagation()
            const frame = 1 / Math.max(1, project.fps)
            seekBy(event.key === 'ArrowLeft' ? -frame : frame)
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            event.stopPropagation()
            onSeek(event.key === 'Home' ? 0 : duration)
          }
        }}
      >
        {tracks.flatMap((track, row) => track.clips.map((clip) => (
          <ClipBar key={clip.id} clip={clip} duration={duration} row={row} />
        )))}
        <div className="pv-playhead" style={{ left: `${(time / duration) * 100}%` }} />
      </div>
    </div>
  )
}

function ClipBar({ clip, duration, row }: { clip: Clip; duration: number; row: number }) {
  const tone = clip.kind === 'audio' ? 'audio' : clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'media' ? 'video' : 'effect'
  return (
    <div
      className="pv-clip"
      data-tone={tone}
      title={`${clip.kind} · ${fmtClock(clip.start)}–${fmtClock(clip.start + clip.duration)}`}
      style={{
        left: `${(clip.start / duration) * 100}%`,
        top: `${row * TRACK_HEIGHT + 5}px`,
        width: `${Math.max((clip.duration / duration) * 100, 2.4)}%`,
      }}
    >
      {clip.kind}
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
  const [scriptW, setScriptW] = useState(420)
  const [footH, setFootH] = useState(208)
  const [resize, setResize] = useState<'col' | 'row' | null>(null)
  const resizeRef = useRef<'col' | 'row' | null>(null)
  closeRef.current = onClose
  const setMode = (mode: 'col' | 'row' | null) => {
    resizeRef.current = mode
    setResize(mode)
  }
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
  const dragCol = (event: { currentTarget: HTMLElement; pointerId: number; preventDefault: () => void }) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setMode('col')
  }
  const dragRow = (event: { currentTarget: HTMLElement; pointerId: number; preventDefault: () => void }) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setMode('row')
  }
  const onSplitMove = (event: { currentTarget: HTMLElement; pointerId: number; clientX: number; clientY: number }) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (resizeRef.current === 'col') {
      const next = rect.right - event.clientX
      setScriptW(Math.round(Math.max(240, Math.min(rect.width - 280, next))))
    } else if (resizeRef.current === 'row') {
      const next = rect.bottom - event.clientY
      setFootH(Math.round(Math.max(120, Math.min(rect.height - 180, next))))
    }
  }
  const endDrag = () => setMode(null)
  return createPortal(
    <div
      ref={rootRef}
      className="pv-studio"
      data-testid="page-video-studio"
      data-page-block-capture=""
      data-resize={resize ?? undefined}
      style={{ ['--script-w' as string]: `${scriptW}px`, ['--foot-h' as string]: `${footH}px` }}
    >
      <div className="pv-studio-bar">
        <div className="pv-brand">
          <span className="pv-brand-mark">&lt;/&gt;</span>
          <span className="pv-studio-name">Video composition</span>
          <span className="pv-studio-sub">/ Untitled</span>
        </div>
        <div className="pv-transport">
          <button type="button" className="pv-icon" aria-label={playing ? '暂停' : '播放'} onClick={onPlay}>
            <IconPlay running={playing} />
          </button>
          <span className="pv-timecode">{fmtClock(time)} / {fmtClock(duration)}</span>
        </div>
        <div className="pv-studio-actions">
          <span className="pv-live"><i className="pv-live-dot" />Live preview</span>
          <button type="button" className="pv-icon" data-page-block-expand="" aria-label="退出全屏" onClick={onClose}>
            <IconExpand />
          </button>
        </div>
      </div>
      <div className="pv-studio-body">
        <div className="pv-canvas">
          <div className="pv-canvas-frame">
            <Stage project={project} time={time} playing={playing} />
          </div>
        </div>
        <div
          className={`pv-split${resize === 'col' ? ' is-drag' : ''}`}
          data-testid="page-video-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整预览与源码宽度"
          onPointerDown={dragCol}
          onPointerMove={onSplitMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="pv-script">
          <div className="pv-script-head">
            <span className="pv-code-mark">&lt;&gt;</span>
            Composition source
            {compiledOk ? <span className="pv-valid">● Valid</span> : <span className="pv-invalid">Invalid</span>}
          </div>
          <ScriptField value={script} onCommit={onCommit} onLive={onLive} readOnly={!writable} />
          {compiledOk ? <div className="pv-hint">{formatReport(project).split('\n')[0]}</div> : <div className="pv-err">{error}</div>}
        </div>
      </div>
      <div
        className={`pv-foot-split${resize === 'row' ? ' is-drag' : ''}`}
        data-testid="page-video-foot-split"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整时间轴高度"
        onPointerDown={dragRow}
        onPointerMove={onSplitMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="pv-studio-foot">
        <div className="pv-timeline-head">
          <strong>Timeline</strong>
          {project.tracks.length} tracks
          <span style={{ marginLeft: 8 }}>· {project.clips.filter((clip) => clip.kind !== 'gap').length} clips</span>
          <span className="pv-duration">{duration.toFixed(1)}s · {project.fps} fps · {project.width}×{project.height}</span>
        </div>
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
  const [tracksOpen, setTracksOpen] = useState(false)
  const timelineId = useId()
  useEffect(() => setLiveScript(parsed.script), [parsed.script])
  const compiled = useMemo(() => compileSafe(liveScript || parsed.script), [liveScript, parsed.script])
  const project = compiled.ok ? compiled.project : parsed
  const duration = Math.max(0.2, projectDuration(project))
  const audioOnly = project.clips.filter((clip) => clip.kind !== 'gap').length > 0 && project.clips.filter((clip) => clip.kind !== 'gap').every((clip) => clip.kind === 'audio')
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
      <div className={`pv-embed${audioOnly ? ' pv-audio-only' : ''}`}>
        {audioOnly
          ? project.clips.map((clip) => <AudioEffect key={clip.id} clip={clip} time={time} playing={playing} />)
          : <Stage project={project} time={time} playing={playing} />}
        <div className="pv-player-controls">
          <button type="button" className="pv-icon" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay}>
            <IconPlay running={playing} />
          </button>
          {audioOnly ? (
            <input
              className="pv-audio-scrub"
              type="range"
              min={0}
              max={duration}
              step={1 / Math.max(1, project.fps)}
              value={Math.min(duration, time)}
              aria-label="音频进度"
              onChange={(event) => setTime(Number(event.currentTarget.value))}
            />
          ) : null}
          <span className="pv-player-time">{fmtClock(time)} / {fmtClock(duration)}</span>
          {!audioOnly ? <span className="pv-player-spacer" /> : null}
          {!audioOnly ? (
            <button
              type="button"
              className="pv-icon pv-track-toggle"
              aria-expanded={tracksOpen}
              aria-controls={timelineId}
              onClick={() => setTracksOpen((value) => !value)}
            >
              轨道
              <IconChevron />
            </button>
          ) : null}
          <button type="button" className="pv-icon" data-page-block-expand="" aria-label="全屏编辑" onClick={() => setOpen(true)}>
            <IconExpand />
          </button>
        </div>
        {!audioOnly && tracksOpen ? (
          <div id={timelineId} className="pv-embed-timeline">
            <Timeline project={project} duration={duration} time={time} onSeek={setTime} />
          </div>
        ) : null}
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
