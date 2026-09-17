import { createPortal } from 'react-dom'
import type { ComponentType, DragEvent } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { xml } from '@codemirror/lang-xml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import {
  ArrowUpRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Bars3BottomLeftIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  CodeBracketIcon,
  CubeIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  MagnifyingGlassPlusIcon,
  MinusIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  QueueListIcon,
  RectangleGroupIcon,
  RectangleStackIcon,
  ScissorsIcon,
  SpeakerWaveIcon,
  Squares2X2Icon,
  StopIcon,
  SwatchIcon,
  VideoCameraIcon,
  ViewfinderCircleIcon,
  WindowIcon,
} from '@heroicons/react/16/solid'
import {
  cameraAt,
  clipAlpha,
  clipEnd,
  clipShift,
  clipsAt,
  clipTransform,
  compileSafe,
  cursorAt,
  dumpScript,
  isVideoSrc,
  maskCss,
  moveClip,
  parseProject,
  poseStyle,
  projectDuration,
  propAt,
  resizeClip,
  SAMPLE_SCRIPT,
  speedAt,
  splitTextUnits,
  staggerDelay,
  type Clip,
  type Project,
} from './compose.ts'
import { DEFAULT_AD_SCENE_SOURCE, DEFAULT_AD_TRANSITION_SOURCE } from './default-ad.ts'
import { compileComponentSource, interpolate, makeAbsoluteFill, spring, type FrameProps } from './runtime.ts'

const React = globalThis.React
const { useEffect, useId, useMemo, useRef, useState } = React

export const name = 'page-video'
export const inject = ['pageEditor']

const STYLE_ID = 'pv-style-v20'
const STYLE_CSS = `
.pv{
  --pv-ink:var(--dsw-label,#37352f);
  --pv-mute:var(--dsw-label-3,#787774);
  --pv-line:var(--dsw-border,#e9e9e7);
  --pv-hover: var(--dsw-hover, rgba(55,53,47,.06));
  --pv-bg:var(--dsw-bg,#fff);
  --pv-panel:var(--dsw-sidebar,#f7f7f5);
  --pv-surface:var(--dsw-surface,#fff);
  --pv-blue:var(--dsw-pick,#2b7de6);
  --pv-ok:var(--dsw-ok,#1f8a65);
  --pv-danger:var(--dsw-danger,#cf2d56);
  --pv-danger-soft:var(--dsw-danger-soft,rgba(207,45,86,.1));
  position:relative;
  color:var(--pv-ink);
  font-family:var(--font-sans);
  font-size:13px;
  line-height:1.45;
}
.pv-embed{
  position:relative;
  overflow:hidden;
  border:0;
  border-radius:0;
  background:var(--pv-bg);
}
.pv-stage{
  display:block;position:relative;width:100%;margin:0;overflow:hidden;background:transparent;
}
.pv-stage-fit{
  position:absolute;top:0;left:0;transform-origin:top left;
}
.pv-embed .pv-stage,.pv-embed .pv-screen,.pv-embed .pv-cam,.pv-embed .pv-stage-fit{border-radius:0}
.pv-screen{position:absolute;inset:0;overflow:hidden;isolation:isolate;perspective:1400px}
.pv-cam{position:absolute;inset:0;transform-origin:center center;will-change:transform;transform-style:preserve-3d}
.pv-layer{position:absolute;inset:0}
.pv-frame{position:absolute;inset:0;display:flex;flex-direction:column;padding:9% 10%;box-sizing:border-box}
.pv-title{font-size:64px;font-weight:700;letter-spacing:-.03em;line-height:1.15;width:100%}
.pv-caption{
  position:absolute;left:8%;right:8%;bottom:10%;z-index:3;
  text-align:center;font-size:32px;font-weight:600;
  text-shadow:0 1px 10px rgba(0,0,0,.4);
}
.pv-fill,.pv-component{
  position:absolute;inset:0;width:100%;height:100%;z-index:4;
  display:flex;flex-direction:column;pointer-events:none;background:transparent;
}
.pv-component-error{
  margin:auto;padding:8px 12px;max-width:80%;
  color:var(--pv-danger);font-size:12px;line-height:1.4;text-align:center;
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
  --pv-track-h:32px;
  position:relative;margin:0;background:var(--pv-surface);
  border-top:1px solid var(--pv-line);
  display:grid;grid-template-columns:36px minmax(0,1fr);overflow:hidden;
}
.pv-track-labels{border-right:1px solid var(--pv-line);background:var(--pv-surface)}
.pv-track-label{
  height:var(--pv-track-h);box-sizing:border-box;display:grid;place-items:center;
  border-bottom:1px solid var(--pv-line);
  color:var(--pv-mute);
}
.pv-track-label svg{width:16px;height:16px;color:currentColor}
.pv-track-label:hover{color:var(--pv-ink);background:var(--pv-hover)}
.pv-lanes{position:relative;min-width:0;cursor:pointer;outline:none;background:var(--pv-bg)}
.pv-lanes.is-drop-target{background:var(--pv-hover)}
.pv-lanes:before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--pv-track-h) - 1px),var(--pv-line) calc(var(--pv-track-h) - 1px),var(--pv-line) var(--pv-track-h)),
    repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),color-mix(in srgb,var(--pv-ink) 7%,transparent) calc(10% - 1px),color-mix(in srgb,var(--pv-ink) 7%,transparent) 10%);
}
.pv-clip{
  position:absolute;height:22px;border:0;border-radius:4px;
  font-family:var(--font-sans);font-size:11px;line-height:1;color:var(--dsw-tag-ink,var(--pv-ink));
  padding:0 7px;display:flex;align-items:center;gap:5px;box-sizing:border-box;pointer-events:none;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  background:color-mix(in srgb,var(--pv-ink) 13%,var(--pv-surface));
  transition:filter .1s ease,opacity .1s ease,transform .1s ease;
}
.pv-clip[data-editable="true"]{pointer-events:auto;cursor:grab}
.pv-clip[data-editable="true"]:hover{filter:brightness(.96)}
.pv-clip[data-editable="true"]:active{cursor:grabbing}
.pv-clip.is-dragging{opacity:.45;transform:scale(.985);z-index:4}
.pv-clip.is-resizing{z-index:4;transition:none;opacity:1;transform:none}
.pv-clip-handle{
  position:absolute;top:0;bottom:0;width:8px;z-index:2;cursor:ew-resize;touch-action:none;
  background:transparent;
}
.pv-clip-handle[data-edge="start"]{left:0}
.pv-clip-handle[data-edge="end"]{right:0}
.pv-clip-handle:hover{background:color-mix(in srgb,currentColor 18%,transparent)}
.pv-clip svg{width:12px;height:12px;flex:none}
.pv-clip[data-tone="effect"]{background:color-mix(in srgb,var(--pv-blue) 24%,var(--pv-surface));color:color-mix(in srgb,var(--pv-blue) 72%,var(--pv-ink))}
.pv-clip[data-tone="audio"]{background:color-mix(in srgb,var(--pv-ok) 24%,var(--pv-surface));color:color-mix(in srgb,var(--pv-ok) 70%,var(--pv-ink))}
.pv-playhead{position:absolute;top:0;bottom:0;width:1px;background:var(--pv-blue);pointer-events:none;z-index:3}
.pv-playhead:before{content:"";position:absolute;left:-3px;top:0;width:7px;height:7px;border-radius:1px 1px 50% 50%;background:var(--pv-blue)}
.pv-player-controls{
  height:38px;padding:0 7px;display:flex;align-items:center;gap:3px;
  border:0;background:var(--dsw-sidebar,#202020);
}
.pv-player-time{margin-left:3px;color:var(--pv-mute);font-family:var(--font-mono);font-size:10px;line-height:1.2;font-variant-numeric:tabular-nums}
.pv-player-spacer{flex:1}
.pv-audio-only{border-radius:0}
.pv-audio-scrub{
  appearance:none;-webkit-appearance:none;min-width:72px;flex:1;height:5px;margin:0 8px;
  border:0;border-radius:999px;outline:0;cursor:pointer;
  background:linear-gradient(90deg,var(--pv-blue) 0 var(--pv-progress,0%),color-mix(in srgb,var(--pv-mute) 32%,var(--pv-surface)) var(--pv-progress,0%) 100%);
}
.pv-audio-scrub::-webkit-slider-runnable-track{height:5px;border:0;border-radius:999px;background:transparent}
.pv-audio-scrub::-webkit-slider-thumb{
  -webkit-appearance:none;width:13px;height:13px;margin-top:-4px;border:2px solid var(--pv-surface);
  border-radius:50%;background:var(--pv-blue);box-shadow:var(--dsw-shadow-lv1,0 1px 3px rgba(0,0,0,.22));
}
.pv-audio-scrub::-moz-range-track{height:5px;border:0;border-radius:999px;background:color-mix(in srgb,var(--pv-mute) 32%,var(--pv-surface))}
.pv-audio-scrub::-moz-range-progress{height:5px;border:0;border-radius:999px;background:var(--pv-blue)}
.pv-audio-scrub::-moz-range-thumb{width:13px;height:13px;border:2px solid var(--pv-surface);border-radius:50%;background:var(--pv-blue);box-shadow:var(--dsw-shadow-lv1,0 1px 3px rgba(0,0,0,.22))}
.pv-audio-scrub:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--pv-blue) 32%,transparent)}
.pv-track-toggle{padding:0}
.pv-embed-timeline{border-top:1px solid var(--pv-line)}
.pv-embed-timeline .pv-rail{border-top:0}
.pv-embed-script{border-top:1px solid var(--pv-line);max-height:240px;display:flex;flex-direction:column;min-height:0;background:var(--pv-panel)}
.pv-embed-script .pv-code-wrap{min-height:168px}
.pv-embed-script .pv-err,.pv-embed-script .pv-hint{border-top:1px solid var(--pv-line)}
.pv-icon{
  width:28px;height:28px;border:0;border-radius:5px;background:transparent;
  color:var(--pv-mute);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  transition:background .1s ease,color .1s ease,transform .08s ease;
}
.pv-icon:hover{background:var(--pv-hover);color:var(--pv-ink)}
.pv-icon:active{background:color-mix(in srgb,var(--pv-ink) 10%,transparent);transform:scale(.96)}
.pv-icon:focus-visible,.pv-lanes:focus-visible{outline:2px solid var(--dsw-pick-stroke,var(--pv-blue));outline-offset:-2px}
.pv-player-controls .pv-icon:focus-visible{outline:0;background:var(--pv-hover);color:var(--pv-ink)}
.pv-studio{
  --pv-ink:var(--dsw-label,#37352f);
  --pv-mute:var(--dsw-label-3,#787774);
  --pv-line:var(--dsw-border,#e9e9e7);
  --pv-hover:var(--dsw-hover,rgba(55,53,47,.06));
  --pv-bg:var(--dsw-bg,#fff);
  --pv-panel:var(--dsw-sidebar,#f7f7f5);
  --pv-surface:var(--dsw-surface,#fff);
  --pv-blue:var(--dsw-pick,#2b7de6);
  --pv-ok:var(--dsw-ok,#1f8a65);
  --pv-danger:var(--dsw-danger,#cf2d56);
  --pv-danger-soft:var(--dsw-danger-soft,rgba(207,45,86,.1));
  --studio-line:var(--pv-line);
  --studio-panel:var(--pv-panel);
  --script-w:420px;
  --foot-h:208px;
  position:fixed;inset:0;z-index:2147483646;
  display:grid;grid-template-rows:48px minmax(0,1fr) 6px var(--foot-h);
  background:var(--pv-panel);color:var(--pv-ink);
  font-family:var(--font-sans);
}
.pv-studio[data-resize="col"]{cursor:col-resize}
.pv-studio[data-resize="col"] *{cursor:col-resize !important;user-select:none}
.pv-studio[data-resize="row"]{cursor:row-resize}
.pv-studio[data-resize="row"] *{cursor:row-resize !important;user-select:none}
.pv-studio:fullscreen,.pv-studio:-webkit-full-screen{width:100%;height:100%}
.pv-studio-bar{
  position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  padding:0 12px;border-bottom:1px solid var(--studio-line);background:var(--pv-bg);font-size:12px;
}
.pv-brand{display:flex;align-items:center;gap:8px;min-width:0}
.pv-brand-mark{width:26px;height:26px;border-radius:5px;color:var(--pv-ink);display:grid;place-items:center}
.pv-brand-mark svg,.pv-panel-icon svg{width:16px;height:16px}
.pv-studio-name{font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.pv-studio-sub{color:var(--pv-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-studio-actions{justify-self:end;display:flex;align-items:center;gap:4px}
.pv-studio-bar .pv-brand{grid-column:1}
.pv-studio-bar .pv-studio-actions{grid-column:3}
.pv-live{display:flex;align-items:center;gap:6px;color:var(--pv-mute);font-size:11px;margin-right:6px}
.pv-live-dot{width:6px;height:6px;border-radius:50%;background:var(--pv-ok)}
.pv-studio-body{display:grid;grid-template-columns:minmax(240px,1fr) 6px var(--script-w);min-height:0;min-width:0}
.pv-split{
  width:6px;cursor:col-resize;background:transparent;position:relative;z-index:2;touch-action:none;
}
.pv-split:before{content:"";position:absolute;inset:0 -5px}
.pv-split:after{content:"";position:absolute;top:0;bottom:0;left:2px;width:1px;background:var(--studio-line)}
.pv-foot-split{
  height:6px;cursor:row-resize;background:transparent;position:relative;z-index:2;touch-action:none;
}
.pv-foot-split:before{content:"";position:absolute;inset:-4px 0}
.pv-foot-split:after{content:"";position:absolute;left:0;right:0;top:2px;height:1px;background:var(--studio-line)}
.pv-canvas{
  container-type:size;min-width:0;min-height:0;padding:24px;
  display:grid;place-items:center;
  background:var(--pv-panel);
  background-image:radial-gradient(circle,color-mix(in srgb,var(--pv-ink) 13%,transparent) .6px,transparent .75px);
  background-size:16px 16px;
}
.pv-preview{
  display:flex;flex-direction:column;min-width:0;min-height:0;
  width:min(100cqw,calc((100cqh - 38px) * var(--pv-ar, 1.77778)));
}
.pv-canvas-frame{
  position:relative;width:100%;aspect-ratio:var(--pv-ar, 1.77778);height:auto;
  background:#191919;border-radius:5px 5px 0 0;overflow:hidden;
  box-shadow:var(--dsw-shadow-lv2,0 8px 24px color-mix(in srgb,var(--pv-ink) 12%,transparent));
}
.pv-canvas-frame .pv-stage{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.pv-preview .pv-player-controls{border-radius:0 0 5px 5px}
.pv-script{
  display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;border-left:1px solid var(--studio-line);background:var(--pv-bg);
}
.pv-script-head{
  flex:none;display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;
  border-bottom:1px solid var(--studio-line);font-size:11px;color:var(--pv-mute);
}
.pv-panel-icon{width:16px;height:16px;color:var(--pv-mute);flex:none;display:inline-flex}
.pv-valid{margin-left:auto;display:flex;align-items:center;gap:5px;color:var(--pv-ok)}
.pv-valid svg,.pv-invalid svg{width:13px;height:13px}
.pv-invalid{margin-left:auto;display:flex;align-items:center;gap:5px;color:var(--pv-danger)}
.pv-code-wrap{flex:1;min-height:0;overflow:hidden;background:var(--pv-panel)}
.pv-code-wrap .cm-editor{height:100%}
.pv-err,.pv-hint{
  flex:0 0 32px;box-sizing:border-box;display:flex;align-items:center;gap:6px;
  padding:0 12px;border-top:1px solid var(--studio-line);font-size:11px;
}
.pv-err{color:var(--pv-danger);background:var(--pv-danger-soft)}
.pv-hint{color:var(--pv-mute);background:var(--pv-bg)}
.pv-hint svg{width:13px;height:13px;flex:none;color:var(--pv-ok)}
.pv-err svg{width:13px;height:13px;flex:none}
.pv-studio-foot{
  min-height:0;border-top:1px solid var(--studio-line);background:var(--pv-bg);
  display:grid;grid-template-rows:32px minmax(0,1fr);overflow:hidden;
}
.pv-timeline-head{display:flex;align-items:center;gap:6px;padding:0 12px;border-bottom:1px solid var(--studio-line);font-size:11px;color:var(--pv-mute)}
.pv-timeline-head strong{color:var(--pv-ink);font-weight:600;margin-right:4px}
.pv-timeline-stat{display:inline-flex;align-items:center;gap:4px}
.pv-timeline-stat svg{width:12px;height:12px}
.pv-duration{margin-left:auto;font-variant-numeric:tabular-nums}
.pv-studio-foot .pv-rail{border-top:0;margin:8px 12px 12px;border:1px solid var(--studio-line);border-radius:8px;background:var(--pv-surface);overflow:auto;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.04))}
.pv-studio-foot .pv-clip{height:22px;border-radius:4px;padding:0 8px}
@media (max-width:720px){
  .pv-studio{grid-template-rows:48px minmax(0,1fr) 110px}
  .pv-studio-body{grid-template-columns:1fr;grid-template-rows:minmax(220px,1fr) minmax(160px,1fr)}
  .pv-split,.pv-foot-split{display:none}
  .pv-canvas{padding:14px;min-height:220px}
  .pv-script{border-left:0;border-top:1px solid var(--studio-line);min-height:160px}
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
  const file = src.replace(/^assets\//, '').replace(/^\/api\/page-video\/assets\//, '')
  if (!file) return ''
  if (/^https?:/i.test(src) || (src.startsWith('/') && !src.startsWith('/api/page-video/assets/'))) return src
  if (file === 'bgm.mp3') return `/api/page-video/assets/${encodeURIComponent(file)}`
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
  const playback = Math.max(0.1, propAt(clip, 'speed', time, clip.speed) * rate)
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = clip.sourceIn + Math.max(0, time - clip.start) * playback
  const alpha = alphaAt(clip, time) * propAt(clip, 'opacity', time, clip.opacity)
  const shift = clipShift(clip, time)
  const xf = clipTransform(clip, time)
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
  const pose = poseStyle(clip, time)
  const [cropX, cropY, cropW, cropH] = clip.crop
  const fit = {
    objectFit: clip.fit,
    opacity: active ? alpha * Number(pose.opacity ?? 1) : 0,
    transform: `translateX(${shift}px) translate(${(xf.x - 0.5) * 100}%, ${(xf.y - 0.5) * 100}%) ${pose.transform ?? ''} scale(${xf.scale}) rotate(${xf.rotate}deg)`,
    width: `${100 / cropW}%`,
    height: `${100 / cropH}%`,
    left: `${(-cropX / cropW) * 100}%`,
    top: `${(-cropY / cropH) * 100}%`,
    zIndex: clip.layer,
    clipPath: pose.clipPath ?? maskCss(clip.mask),
    filter: pose.filter,
  } as const
  if (movie) {
    return <video ref={video} className="pv-media" src={url} muted playsInline preload="auto" style={{ ...fit, pointerEvents: 'none' }} />
  }
  return <img className="pv-media" src={url} alt="" style={fit} />
}

function TextEffect({ clip, time }: { clip: Clip; time: number }) {
  const xf = clipTransform(clip, time)
  const valign = clip.valign === 'top' ? 'flex-start' : clip.valign === 'bottom' ? 'flex-end' : 'center'
  const halign = clip.align === 'left' ? 'flex-start' : clip.align === 'right' ? 'flex-end' : 'center'
  const box = {
    left: `${(xf.x - clip.w / 2) * 100}%`,
    top: `${(xf.y - clip.h / 2) * 100}%`,
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
    flexWrap: 'wrap' as const,
    clipPath: maskCss(clip.mask),
  }
  if (clip.unit !== 'none' && clip.stagger > 0) {
    const parts = splitTextUnits(clip.text, clip.unit)
    return (
      <div className="pv-effect pv-text" style={box}>
        {parts.map((part, index) => {
          const delay = staggerDelay(index, parts.length, clip.stagger, clip.staggerFrom)
          const pose = poseStyle(clip, time, delay)
          return (
            <span
              key={`${index}-${part}`}
              style={{
                display: clip.unit === 'line' ? 'block' : 'inline-block',
                opacity: Number(pose.opacity ?? 1) * xf.opacity,
                transform: `${pose.transform ?? ''} scale(${xf.scale}) rotate(${xf.rotate}deg)`,
                filter: pose.filter,
                clipPath: pose.clipPath,
              }}
            >
              {part}
            </span>
          )
        })}
      </div>
    )
  }
  const pose = poseStyle(clip, time)
  return (
    <div
      className="pv-effect pv-text"
      style={{
        ...box,
        opacity: Number(pose.opacity ?? 1) * xf.opacity,
        transform: `${pose.transform ?? ''} scale(${xf.scale}) rotate(${xf.rotate}deg)`,
        filter: pose.filter,
        clipPath: pose.clipPath ?? box.clipPath,
      }}
    >
      {clip.text}
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
    const pose = poseStyle(clip, time)
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
          opacity: pose.opacity,
          transform: `translate(-50%,-50%) ${pose.transform ?? ''}`,
          filter: pose.filter,
          clipPath: pose.clipPath,
        }}
      />
    )
  }
  return null
}

function AudioEffect({ clip, time, playing }: { clip: Clip; time: number; playing: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const lastTick = useRef(time)
  const speed = Math.max(0.1, propAt(clip, 'speed', time, clip.speed))
  const active = time >= clip.start && time < clip.start + clip.duration
  const local = clip.sourceIn + Math.max(0, time - clip.start) * speed
  const volume = clamp01(propAt(clip, 'volume', time, clip.volume))
  const localRef = useRef(local)
  localRef.current = local
  useEffect(() => {
    const el = audio.current
    if (!el) return
    el.volume = volume
    if (Math.abs(el.playbackRate - speed) > 0.01) el.playbackRate = speed
  }, [volume, speed])
  useEffect(() => {
    const el = audio.current
    if (!el) return
    if (!active || !playing) {
      if (!el.paused) el.pause()
      if (active) el.currentTime = localRef.current
      return
    }
    el.currentTime = localRef.current
    if (el.paused) void el.play().catch(() => undefined)
  }, [active, playing])
  useEffect(() => {
    const el = audio.current
    const jumped = time + 0.04 < lastTick.current || time - lastTick.current > 0.28
    lastTick.current = time
    if (!el) return
    if (!active) return
    if (!playing) {
      if (Math.abs(el.currentTime - local) > 0.04) el.currentTime = local
      return
    }
    if (jumped && Math.abs(el.currentTime - local) > 0.28) el.currentTime = local
  }, [time, playing, active, local])
  return <audio ref={audio} src={assetUrl(clip.src)} preload="auto" playsInline />
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function FillLayer({ clip, time }: { clip: Clip; time: number }) {
  const pose = poseStyle(clip, time)
  return (
    <div
      className="pv-fill"
      data-pv-fill=""
      data-testid="page-video-fill"
      style={{
        background: clip.bg && clip.bg !== 'transparent' ? clip.bg : 'transparent',
        opacity: alphaAt(clip, time) * Number(pose.opacity ?? 1),
        transform: pose.transform,
        filter: pose.filter,
        clipPath: pose.clipPath,
      }}
    />
  )
}

class ComponentBoundary extends React.Component<{ children?: unknown }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  render() {
    if (this.state.error) return <div className="pv-component-error">{this.state.error}</div>
    return this.props.children
  }
}

function ComponentLayer({ clip, time, project }: { clip: Clip; time: number; project: Project }) {
  const [view, setView] = useState<((props: FrameProps) => unknown) | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stop = false
    let last = ''
    const load = async () => {
      try {
        let source = clip.text
        if (clip.src === 'builtin:ad-scene' || clip.src === 'builtin:biu-ad') {
          source = DEFAULT_AD_SCENE_SOURCE
        } else if (clip.src === 'builtin:ad-transition' || clip.src === 'builtin:ad-wipe') {
          source = DEFAULT_AD_TRANSITION_SOURCE
        } else if (clip.src) {
          const res = await fetch(assetUrl(clip.src), { cache: 'no-store' })
          if (!res.ok) throw new Error(`无法读取组件 ${clip.src}`)
          source = await res.text()
        }
        if (source === last) return
        last = source
        const compiled = compileComponentSource(source, React)
        if (!stop) {
          setView(() => compiled)
          setError('')
        }
      } catch (err) {
        if (!stop) {
          setView(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }
    void load()
    const tick = window.setInterval(() => {
      void load()
    }, 700)
    return () => {
      stop = true
      window.clearInterval(tick)
    }
  }, [clip.src, clip.text])
  const pose = poseStyle(clip, time)
  const local = Math.max(0, time - clip.start)
  const progress = clip.duration > 0 ? Math.min(1, local / clip.duration) : 0
  const durationInFrames = Math.max(1, Math.round(clip.duration * project.fps))
  const props: FrameProps = {
    frame: Math.round(local * project.fps),
    time: local,
    progress,
    durationInFrames,
    fps: project.fps,
    width: project.width,
    height: project.height,
    interpolate,
    spring,
    AbsoluteFill: makeAbsoluteFill(React.createElement.bind(React)),
    id: clip.name || clip.id,
    content: clip.text,
    description: clip.description,
    color: clip.color,
    background: clip.bg,
    variant: clip.variant,
    textMotion: clip.textMotion,
  }
  return (
    <div
      className="pv-component"
      data-testid="page-video-component"
      style={{
        opacity: alphaAt(clip, time) * Number(pose.opacity ?? 1),
        transform: pose.transform,
        filter: pose.filter,
        clipPath: pose.clipPath,
      }}
    >
      {error ? <div className="pv-component-error">{error}</div> : null}
      {!error && view ? (
        <ComponentBoundary>
          {view(props)}
        </ComponentBoundary>
      ) : null}
    </div>
  )
}

function Stage({ project, time, playing, chrome = 'embed' }: { project: Project; time: number; playing: boolean; chrome?: 'embed' | 'studio' }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const next = el.clientWidth / Math.max(1, project.width)
      setScale(Number.isFinite(next) && next > 0 ? next : 1)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [project.width])
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
  const fills = active.filter((clip) => clip.kind === 'fill')
  const components = active.filter((clip) => clip.kind === 'component')
  const audio = project.clips.filter((clip) => clip.kind === 'audio')
  const media = project.clips.filter((clip) => clip.kind === 'media')
  const bg = [...bases].reverse().find((clip) => clip.kind !== 'media')?.bg ?? '#191919'
  const zoom = active.find((clip) => clip.kind === 'zoom')
  const zoomProgress = zoom ? Math.max(0, Math.min(1, (time - zoom.start) / zoom.duration)) : 0
  const motionBlur = zoom ? Math.sin(zoomProgress * Math.PI) * Math.min(4, (zoom.depth - 1) * 3) : 0
  const wallpaper = project.wallpaper ? `url("${assetUrl(project.wallpaper)}")` : undefined
  return (
    <div
      ref={hostRef}
      className="pv-stage"
      data-testid="page-video-stage"
      style={{
        aspectRatio: `${project.width} / ${project.height}`,
        backgroundColor: project.background,
        backgroundImage: wallpaper,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="pv-stage-fit"
        style={{
          width: project.width,
          height: project.height,
          transform: `scale(${scale})`,
        }}
      >
      <div
        className="pv-screen"
        style={{
          inset: 0,
          borderRadius: chrome === 'studio' ? project.radius : 0,
          boxShadow: chrome === 'studio' && project.shadow ? `0 ${project.shadow / 3}px ${project.shadow}px rgba(15,15,15,.32)` : undefined,
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
            .map((clip) => {
              const xf = clipTransform(clip, time)
              const pose = poseStyle(clip, time)
              return (
              <div
                key={clip.id}
                className="pv-layer"
                style={{
                  background: clip.bg,
                  color: clip.ink,
                  opacity: alphaAt(clip, time) * xf.opacity * Number(pose.opacity ?? 1),
                  transform: `translateX(${clipShift(clip, time)}px) ${pose.transform ?? ''} scale(${xf.scale}) rotate(${xf.rotate}deg)`,
                  clipPath: pose.clipPath ?? maskCss(clip.mask),
                  filter: pose.filter,
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
                  <div className="pv-title">{clip.text || '·'}</div>
                </div>
              </div>
              )
            })}
          {fills.map((clip) => (
            <FillLayer key={clip.id} clip={clip} time={time} />
          ))}
          {components.map((clip) => (
            <ComponentLayer key={clip.id} clip={clip} time={time} project={project} />
          ))}
        </div>
        {captions.map((clip, index) => (
          <div
            key={clip.id}
            className="pv-caption"
            style={{
              color: clip.ink,
              opacity: alphaAt(clip, time) * propAt(clip, 'opacity', time, clip.opacity),
              bottom: `${10 + (captions.length - 1 - index) * 7}%`,
            }}
          >
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
    </div>
  )
}

const scriptHighlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--dsw-pick, var(--pv-blue))', fontWeight: '600' },
  { tag: tags.attributeName, color: 'var(--dsw-purple, #9065b0)' },
  { tag: tags.attributeValue, color: 'var(--dsw-ok, #1f8a65)' },
  { tag: tags.string, color: 'var(--dsw-ok, #1f8a65)' },
  { tag: tags.angleBracket, color: 'var(--pv-mute)' },
])

const scriptTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'transparent',
    color: 'var(--pv-ink)',
    fontSize: '12px',
  },
  '&.cm-editor': { outline: 'none', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-gutters': {
    background: 'var(--pv-panel)',
    border: 'none',
    color: 'color-mix(in srgb, var(--pv-mute) 55%, transparent)',
  },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--pv-ink)' },
  '.cm-content': {
    caretColor: 'var(--pv-ink)',
    padding: '14px 16px 14px 8px',
    minHeight: '100%',
  },
  '.cm-cursor': { borderLeftColor: 'var(--pv-ink)' },
  '.cm-content ::selection': {
    background: 'color-mix(in srgb, var(--pv-blue) 24%, transparent)',
    color: 'inherit',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--pv-blue) 24%, transparent)',
  },
})

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
  const host = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const focused = useRef(false)
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  const onLiveRef = useRef(onLive)
  valueRef.current = value
  onCommitRef.current = onCommit
  onLiveRef.current = onLive
  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          xml(),
          syntaxHighlighting(scriptHighlight),
          scriptTheme,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.domEventHandlers({
            keydown(event) {
              event.stopPropagation()
              return false
            },
            focus() {
              focused.current = true
            },
            blur() {
              focused.current = false
              const next = view.state.doc.toString()
              if (next !== valueRef.current) onCommitRef.current(next)
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            onLiveRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      const next = view.state.doc.toString()
      if (next !== valueRef.current) onCommitRef.current(next)
      view.destroy()
      viewRef.current = null
    }
  }, [readOnly])
  useEffect(() => {
    const view = viewRef.current
    if (!view || focused.current) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])
  return <div ref={host} className="pv-code-wrap" data-testid="page-video-script" data-page-block-capture="" />
}

type TimelineTrack = {
  id: string
  kind: Clip['kind']
  label: string
  clips: Clip[]
}

const TRACK_ORDER: Clip['kind'][] = ['title', 'scene', 'solid', 'media', 'fill', 'component', 'zoom', 'text', 'caption', 'arrow', 'blur', 'box', 'spotlight', 'stamp', 'cursor', 'pip', 'image', 'speed', 'trim', 'gap', 'audio']
const TRACK_HEIGHT = 32
const TRACK_ICONS: Record<Clip['kind'], ComponentType<{ className?: string }>> = {
  title: Bars3BottomLeftIcon,
  scene: RectangleStackIcon,
  solid: SwatchIcon,
  media: VideoCameraIcon,
  zoom: MagnifyingGlassPlusIcon,
  text: Bars3BottomLeftIcon,
  caption: ChatBubbleBottomCenterTextIcon,
  arrow: ArrowUpRightIcon,
  blur: Squares2X2Icon,
  box: StopIcon,
  spotlight: ViewfinderCircleIcon,
  stamp: RectangleGroupIcon,
  cursor: CursorArrowRaysIcon,
  pip: WindowIcon,
  image: PhotoIcon,
  speed: BoltIcon,
  trim: ScissorsIcon,
  gap: MinusIcon,
  audio: SpeakerWaveIcon,
  component: CubeIcon,
  fill: CubeIcon,
}

function TrackIcon({ kind }: { kind: Clip['kind'] }) {
  const Icon = TRACK_ICONS[kind] ?? QueueListIcon
  return <Icon className="size-4 shrink-0" />
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

function Timeline({
  project,
  duration,
  time,
  onSeek,
  onMove,
  onResize,
}: {
  project: Project
  duration: number
  time: number
  onSeek: (t: number) => void
  onMove?: (clipId: string, trackId: string, start: number) => void
  onResize?: (clipId: string, edge: 'start' | 'end', time: number) => void
}) {
  const lanesRef = useRef<HTMLDivElement | null>(null)
  const resizeRef = useRef<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [dragging, setDragging] = useState('')
  const [resizing, setResizing] = useState('')
  const [preview, setPreview] = useState<{ id: string; start: number; duration: number } | null>(null)
  const [dropTarget, setDropTarget] = useState(false)
  const seekBy = (delta: number) => onSeek(Math.min(duration, Math.max(0, time + delta)))
  const tracks = timelineTracks(project)
  const railHeight = `${Math.max(1, tracks.length) * TRACK_HEIGHT}px`
  const timeAt = (clientX: number) => {
    const rect = lanesRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / Math.max(1, rect.width)) * duration))
  }
  const applyResize = (clientX: number, commit: boolean) => {
    const job = resizeRef.current
    if (!job) return
    const at = timeAt(clientX)
    const next = resizeClip(project, job.id, job.edge, at)
    const clip = next.clips.find((item) => item.id === job.id)
    if (clip) setPreview({ id: clip.id, start: clip.start, duration: clip.duration })
    if (commit) onResize?.(job.id, job.edge, at)
  }
  return (
    <div className="pv-rail" data-testid="page-video-rail" style={{ height: railHeight }}>
      <div className="pv-track-labels">
        {tracks.map((track) => (
          <div className="pv-track-label" key={track.id} title={track.label} aria-label={track.label}>
            <TrackIcon kind={track.kind} />
          </div>
        ))}
      </div>
      <div
        ref={lanesRef}
        className={`pv-lanes${dropTarget ? ' is-drop-target' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="视频时间轴"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.min(duration, time)}
        aria-valuetext={`${fmtClock(time)} / ${fmtClock(duration)}`}
        onDragOver={(event) => {
          if (!onMove && !onResize) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false)
        }}
        onDrop={(event) => {
          if (!onMove) return
          event.preventDefault()
          const clipId = event.dataTransfer.getData('application/x-page-video-clip')
          const mode = event.dataTransfer.getData('application/x-page-video-mode')
          const offset = Number(event.dataTransfer.getData('application/x-page-video-offset')) || 0
          const rect = event.currentTarget.getBoundingClientRect()
          const row = Math.max(0, Math.min(tracks.length - 1, Math.floor((event.clientY - rect.top) / TRACK_HEIGHT)))
          const track = tracks[row]
          const cursorTime = ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration
          if (clipId && mode !== 'resize-start' && mode !== 'resize-end' && track) {
            onMove(clipId, track.id, Math.max(0, cursorTime - offset))
          }
          setDragging('')
          setDropTarget(false)
        }}
        onClick={(event) => {
          if (dragging) return
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
          <ClipBar
            key={clip.id}
            clip={clip}
            duration={duration}
            row={row}
            editable={Boolean(onMove || onResize)}
            dragging={dragging === clip.id}
            resizing={resizing === clip.id}
            preview={preview?.id === clip.id ? preview : null}
            onDragStart={(event) => {
              if (resizeRef.current) {
                event.preventDefault()
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              const offset = ((event.clientX - rect.left) / Math.max(1, rect.width)) * clip.duration
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-page-video-clip', clip.id)
              event.dataTransfer.setData('application/x-page-video-mode', 'move')
              event.dataTransfer.setData('application/x-page-video-offset', String(offset))
              setDragging(clip.id)
            }}
            onResizePointerDown={(edge, event) => {
              if (!onResize) return
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              resizeRef.current = { id: clip.id, edge }
              setResizing(clip.id)
            }}
            onResizePointerMove={(event) => {
              if (!resizeRef.current || resizeRef.current.id !== clip.id) return
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              event.preventDefault()
              applyResize(event.clientX, false)
            }}
            onResizePointerUp={(event) => {
              if (!resizeRef.current || resizeRef.current.id !== clip.id) return
              applyResize(event.clientX, true)
              resizeRef.current = null
              setResizing('')
              setPreview(null)
            }}
            onDragEnd={() => {
              setDragging('')
              setDropTarget(false)
            }}
          />
        )))}
        <div className="pv-playhead" style={{ left: `${(time / duration) * 100}%` }} />
      </div>
    </div>
  )
}

function ClipBar({
  clip,
  duration,
  row,
  editable,
  dragging,
  resizing,
  preview,
  onDragStart,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onDragEnd,
}: {
  clip: Clip
  duration: number
  row: number
  editable: boolean
  dragging: boolean
  resizing: boolean
  preview: { start: number; duration: number } | null
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onResizePointerDown: (edge: 'start' | 'end', event: React.PointerEvent<HTMLSpanElement>) => void
  onResizePointerMove: (event: React.PointerEvent<HTMLSpanElement>) => void
  onResizePointerUp: (event: React.PointerEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
}) {
  const tone = clip.kind === 'audio' ? 'audio' : clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'media' ? 'video' : 'effect'
  const start = preview?.start ?? clip.start
  const span = preview?.duration ?? clip.duration
  return (
    <div
      className={`pv-clip${dragging ? ' is-dragging' : ''}${resizing ? ' is-resizing' : ''}`}
      data-tone={tone}
      data-editable={editable ? 'true' : undefined}
      data-testid={`page-video-clip-${clip.id}`}
      draggable={editable && !resizing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => event.stopPropagation()}
      title={`${clip.kind} · ${fmtClock(start)}–${fmtClock(start + span)}`}
      style={{
        left: `${(start / duration) * 100}%`,
        top: `${row * TRACK_HEIGHT + (TRACK_HEIGHT - 22) / 2}px`,
        width: `${Math.max((span / duration) * 100, 2.4)}%`,
      }}
    >
      {editable ? (
        <span
          className="pv-clip-handle"
          data-edge="start"
          aria-label="调整片段开始时间"
          onPointerDown={(event) => onResizePointerDown('start', event)}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      ) : null}
      <TrackIcon kind={clip.kind} />
      {clip.description || clip.name ? <span>{clip.description || clip.name}</span> : null}
      {editable ? (
        <span
          className="pv-clip-handle"
          data-edge="end"
          aria-label="调整片段结束时间"
          onPointerDown={(event) => onResizePointerDown('end', event)}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      ) : null}
    </div>
  )
}

function PlayerBar({
  playing,
  time,
  duration,
  fps,
  onPlay,
  onSeek,
  extra,
}: {
  playing: boolean
  time: number
  duration: number
  fps: number
  onPlay: () => void
  onSeek: (t: number) => void
  extra?: unknown
}) {
  return (
    <div className="pv-player-controls">
      <button type="button" className="pv-icon" aria-label={playing ? '暂停' : '播放'} onClick={onPlay}>
        {playing ? <PauseIcon className="size-4 shrink-0" /> : <PlayIcon className="size-4 shrink-0" />}
      </button>
      <input
        className="pv-audio-scrub"
        type="range"
        min={0}
        max={duration}
        step={1 / Math.max(1, fps)}
        value={Math.min(duration, time)}
        style={{ ['--pv-progress' as string]: `${duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0}%` }}
        aria-label="进度"
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
      <span className="pv-player-time">{fmtClock(time)} / {fmtClock(duration)}</span>
      {extra}
    </div>
  )
}

function CompileLine({ ok, project, error }: { ok: boolean; project: Project; error?: string }) {
  if (!ok) {
    return (
      <div className="pv-err">
        <ExclamationTriangleIcon className="size-4 shrink-0" />
        {error}
      </div>
    )
  }
  return (
    <div className="pv-hint">
      <CheckIcon className="size-4 shrink-0" />
      {project.diagnostics[0]?.message || '编译通过'}
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
          <span className="pv-brand-mark"><FilmIcon className="size-4 shrink-0" /></span>
          <span className="pv-studio-name">视频工作台</span>
          <span className="pv-studio-sub">/ 未命名编排</span>
        </div>
        <div className="pv-studio-actions">
          <span className="pv-live"><i className="pv-live-dot" />实时预览</span>
          <button type="button" className="pv-icon" data-page-block-expand="" aria-label="退出全屏" onClick={onClose}>
            <ArrowsPointingInIcon className="size-4 shrink-0" />
          </button>
        </div>
      </div>
      <div className="pv-studio-body">
        <div className="pv-canvas">
          <div className="pv-preview" style={{ ['--pv-ar' as string]: String(project.width / Math.max(1, project.height)) }}>
            <div className="pv-canvas-frame">
              <Stage project={project} time={time} playing={playing} chrome="studio" />
            </div>
            <PlayerBar playing={playing} time={time} duration={duration} fps={project.fps} onPlay={onPlay} onSeek={onSeek} />
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
            <span className="pv-panel-icon"><CodeBracketIcon className="size-4 shrink-0" /></span>
            编排源码
            {compiledOk
              ? <span className="pv-valid"><CheckIcon className="size-4 shrink-0" />有效</span>
              : <span className="pv-invalid"><ExclamationTriangleIcon className="size-4 shrink-0" />有错误</span>}
          </div>
          <ScriptField value={script} onCommit={onCommit} onLive={onLive} readOnly={!writable} />
          <CompileLine ok={compiledOk} project={project} error={error} />
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
          <span className="pv-panel-icon"><QueueListIcon className="size-4 shrink-0" /></span>
          <strong>时间轴</strong>
          <span className="pv-timeline-stat"><RectangleStackIcon className="size-4 shrink-0" />{project.tracks.length}</span>
          <span className="pv-timeline-stat"><Squares2X2Icon className="size-4 shrink-0" />{project.clips.filter((clip) => clip.kind !== 'gap').length}</span>
          <span className="pv-duration">{duration.toFixed(1)}s · {project.fps} fps · {project.width}×{project.height}</span>
        </div>
        <Timeline
          project={project}
          duration={duration}
          time={time}
          onSeek={onSeek}
          onMove={writable
            ? (clipId, trackId, start) => {
                const next = dumpScript(moveClip(project, clipId, trackId, start))
                onLive(next)
                onCommit(next)
                onSeek(start)
              }
            : undefined}
          onResize={writable
            ? (clipId, edge, at) => {
                const resized = resizeClip(project, clipId, edge, at)
                const next = dumpScript(resized)
                onLive(next)
                onCommit(next)
              }
            : undefined}
        />
      </div>
    </div>,
    document.body,
  )
}

function isLegacySampleScript(value: unknown) {
  if (typeof value !== 'string') return false
  const shortFeatureList =
    value.includes('description="视频块功能介绍：逐项演示转场、逐字、镜头、光标、箭头、框选、字幕"') &&
    value.includes('<title id=cut') &&
    value.includes('>转场</title>') &&
    value.includes('>I am Biu.</title>')
  const multicolorNewcomerTour =
    value.includes('description="约一分钟的新手介绍：逐项讲解并演示 BIU 视频块"') &&
    (value.includes('bg=#202c3d') || value.includes('bg=#273449') || value.includes('bg=#111111'))
  const titleCardNewcomerTour =
    value.includes('description="约一分钟的新手介绍：逐项讲解并演示 BIU 视频块"') &&
    value.includes('<title id=open') &&
    value.includes('<title id=compile') &&
    !value.includes('src=builtin:biu-ad')
  const singleComponentAd =
    value.includes('description="BIU 动态广告片：React 逐帧文字与遮罩转场"') &&
    value.includes('src=builtin:biu-ad') &&
    !value.includes('src=builtin:ad-scene')
  const longTimelineAd =
    value.includes('description="BIU 动态广告片：React 逐帧文字与遮罩转场"') &&
    value.includes('src=builtin:ad-scene') &&
    value.includes('dur=7s')
  const genericTimelineOpening =
    value.includes('description="BIU 动态广告片：React 逐帧文字与遮罩转场"') &&
    value.includes('src=builtin:ad-scene') &&
    value.includes('一块内容|也能是一支片')
  const uniformTransitionAd =
    value.includes('description="BIU 动态广告片：React 逐帧文字与遮罩转场"') &&
    value.includes('src=builtin:ad-wipe') &&
    !value.includes('src=builtin:ad-transition')
  const oldBgmSrc =
    value.includes('description="BIU 动态广告片：React 逐帧文字与遮罩转场"') &&
    (value.includes('src=builtin:ad-beat') || value.includes('src=/api/page-video/assets/bgm.mp3'))
  return shortFeatureList || multicolorNewcomerTour || titleCardNewcomerTour || singleComponentAd || longTimelineAd || genericTimelineOpening || uniformTransitionAd || oldBgmSrc
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
  const migrateSample = isLegacySampleScript(data.script)
  const parsed = useMemo(
    () => parseProject(migrateSample ? { ...data, script: SAMPLE_SCRIPT } : data),
    [data, migrateSample],
  )
  const [liveScript, setLiveScript] = useState(parsed.script)
  const [open, setOpen] = useState(false)
  const [tracksOpen, setTracksOpen] = useState(false)
  const timelineId = useId()
  useEffect(() => {
    if (migrateSample && writable) update({ script: SAMPLE_SCRIPT })
  }, [migrateSample, writable, update])
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
          : <Stage project={project} time={time} playing={playing} chrome="embed" />}
        <PlayerBar
          playing={playing}
          time={time}
          duration={duration}
          fps={project.fps}
          onPlay={togglePlay}
          onSeek={setTime}
          extra={(
            <>
              {!audioOnly ? (
                <button
                  type="button"
                  className="pv-icon pv-track-toggle"
                  aria-label={tracksOpen ? '收起轨道' : '展开轨道'}
                  title={tracksOpen ? '收起轨道' : '展开轨道'}
                  aria-expanded={tracksOpen}
                  aria-controls={timelineId}
                  onClick={() => setTracksOpen((value) => !value)}
                >
                  <QueueListIcon className="size-4 shrink-0" />
                </button>
              ) : null}
              <button type="button" className="pv-icon" data-page-block-expand="" aria-label="全屏编辑" onClick={() => setOpen(true)}>
                <ArrowsPointingOutIcon className="size-4 shrink-0" />
              </button>
            </>
          )}
        />
        {!audioOnly && tracksOpen ? (
          <>
            <div id={timelineId} className="pv-embed-timeline">
              <Timeline project={project} duration={duration} time={time} onSeek={setTime} />
            </div>
            <div className="pv-embed-script">
              <ScriptField
                value={liveScript || SAMPLE_SCRIPT}
                onCommit={commitScript}
                onLive={setLiveScript}
                readOnly={!writable}
              />
              <CompileLine ok={compiled.ok} project={project} error={!compiled.ok ? compiled.error : undefined} />
            </div>
          </>
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
