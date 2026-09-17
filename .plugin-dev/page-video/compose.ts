import { mixPose, MOTION_REST, motionCss, parseMotion, sampleMotion, type MotionPose } from './motion.ts'

export type ClipKind =
  | 'title'
  | 'scene'
  | 'caption'
  | 'media'
  | 'zoom'
  | 'text'
  | 'arrow'
  | 'blur'
  | 'cursor'
  | 'pip'
  | 'image'
  | 'audio'
  | 'speed'
  | 'trim'
  | 'box'
  | 'spotlight'
  | 'stamp'
  | 'gap'
  | 'solid'

export type Transition = 'cut' | 'fade' | 'slide' | 'dissolve'
export type Align = 'left' | 'center' | 'right'
export type Valign = 'top' | 'middle' | 'bottom'
export type BlurMode = 'blur' | 'mosaic'
export type DiagLevel = 'error' | 'warn' | 'info'

export type Diagnostic = { level: DiagLevel; message: string }

export type Clip = {
  id: string
  name: string
  track: string
  layer: number
  kind: ClipKind
  start: number
  duration: number
  text: string
  description: string
  bg: string
  ink: string
  src: string
  fit: 'cover' | 'contain'
  trans: Transition
  cx: number
  cy: number
  depth: number
  x: number
  y: number
  x2: number
  y2: number
  w: number
  h: number
  size: number
  amount: number
  speed: number
  click: number
  color: string
  anim: 'none' | 'fade' | 'rise' | 'pop' | 'slide-left' | 'typewriter' | 'pulse' | 'wave' | 'blur-in'
  shape: 'rectangle' | 'rounded' | 'circle'
  crop: [number, number, number, number]
  sourceIn: number
  available: number
  volume: number
  align: Align
  valign: Valign
  weight: 'normal' | 'bold'
  italic: boolean
  underline: boolean
  pad: number
  rx: number
  ry: number
  rz: number
  mode: BlurMode
  follow: string
  scale: number
  rotate: number
  opacity: number
  unit: 'none' | 'char' | 'word' | 'line'
  stagger: number
  staggerFrom: 'start' | 'end' | 'center' | 'random'
  enter: string
  exit: string
  ease: string
  motionDur: number
  animates: AnimCurve[]
  mask: Mask | null
}

export type AnimKey = { at: number; v: number; ease: string }
export type AnimCurve = { prop: string; keys: AnimKey[] }
export type Mask = { shape: 'rectangle' | 'ellipse' | 'rounded'; x: number; y: number; w: number; h: number }

export type Lane = {
  id: string
  name: string
  layer: number
  kind: 'video' | 'audio' | 'auto'
  clips: Clip[]
}

export type Project = {
  fps: number
  width: number
  height: number
  script: string
  clips: Clip[]
  tracks: Lane[]
  diagnostics: Diagnostic[]
  background: string
  wallpaper: string
  padding: number
  radius: number
  shadow: number
  description: string
  bgBlur: number
}

export type Camera = { scale: number; cx: number; cy: number; rx: number; ry: number; rz: number }

export const SAMPLE_SCRIPT = `<timeline fps=30 size=1920x1080 background=#191919 description="视频块介绍：标签时间轴，Agent 写剪辑">
  <track name=main>
    <title id=open dur=2.8s bg=#191919 ink=#f6f2ea enter="fadeUp" align=center valign=middle desc="Biu Agent OS">视频块</title>
    <transition enter="move(x:+100%)" exit="move(x:-100%)" dur=0.45s ease="easeInOut" desc="左推" />
    <title dur=3.2s bg=#191919 ink=#f6f2ea align=center valign=middle desc="声明式剪辑">Agent 写标签，页面实时合成。</title>
    <transition kind=dissolve dur=0.5s />
    <scene id=fs dur=3.4s bg=#111111 ink=#ece7dc desc="一切皆文件">视频也是路径上的一块。</scene>
    <transition enter="fade" exit="fade" dur=0.4s />
    <title id=end dur=3.4s bg=#191919 ink=#f6f2ea enter="pop" align=center valign=middle desc="同一套动词">I am Biu.</title>
  </track>
  <track name=cam layer=2>
    <zoom at=0.9s dur=0.85s cx=0.5 cy=0.48 depth=1.22 desc="推近开场" />
    <zoom at=9.6s dur=0.9s cx=0.5 cy=0.5 depth=1.18 desc="收束" />
  </track>
  <track name=copy layer=4>
    <text at=0.45s dur=2.1s x=.5 y=.18 w=.82 h=.1 size=18 align=center enter="fade+move(y:+16)" unit=word stagger=0.08s>page · plugin · path</text>
    <text at=3.5s dur=2.7s x=.5 y=.76 w=.86 h=.12 size=22 align=center enter="fade+move(y:+20)" unit=char stagger=0.045s ease="backOut">&lt;timeline&gt; 轨内串行 · 轨间并行</text>
    <caption follow=fs offset="0.2s,-0.6s">不是调色台。是 db_content 里的一块。</caption>
    <caption follow=end offset="0.35s,-0.15s">人和 Agent，同一套动词。</caption>
  </track>
  <track name=fx layer=5>
    <cursor at="fs.start + 0.35s" dur=2s x=.16 y=.78 x2=.52 y2=.5 click=0.9s size=28 desc="点进页面" />
    <arrow at="fs.start + 0.55s" dur=1.6s x=.2 y=.72 x2=.46 y2=.52 color=#2b7de6 width=4 desc="指向文案" />
    <box at="fs.start + 0.7s" dur=1.4s x=.5 y=.5 w=.56 h=.22 color=#2b7de6 desc="框选标题" />
  </track>
</timeline>
`

const CLIP_KINDS = new Set<ClipKind>([
  'title',
  'scene',
  'caption',
  'media',
  'zoom',
  'text',
  'arrow',
  'blur',
  'cursor',
  'pip',
  'image',
  'audio',
  'speed',
  'trim',
  'box',
  'spotlight',
  'stamp',
  'gap',
  'solid',
])
const VISUAL = new Set<ClipKind>(['title', 'scene', 'media', 'solid'])
const TRANS: Transition[] = ['cut', 'fade', 'slide', 'dissolve']
const CONTAINERS = new Set(['timeline', 'track', 'composition'])
const ITEM_ALIAS: Record<string, ClipKind | 'transition'> = {
  clip: 'media',
  media: 'media',
  title: 'title',
  scene: 'scene',
  caption: 'caption',
  zoom: 'zoom',
  text: 'text',
  arrow: 'arrow',
  blur: 'blur',
  cursor: 'cursor',
  pip: 'pip',
  image: 'image',
  audio: 'audio',
  speed: 'speed',
  trim: 'trim',
  box: 'box',
  spotlight: 'spotlight',
  stamp: 'stamp',
  gap: 'gap',
  solid: 'solid',
  bars: 'solid',
  gradient: 'solid',
  transition: 'transition',
}

export function emptyProject(script = SAMPLE_SCRIPT): Project {
  return {
    fps: 30,
    width: 1280,
    height: 720,
    script,
    clips: [],
    tracks: [],
    diagnostics: [],
    background: '#e9e7e2',
    wallpaper: '',
    padding: 0,
    radius: 0,
    shadow: 0,
    description: '',
    bgBlur: 0,
  }
}

export function clipEnd(clip: { start: number; duration: number }) {
  return clip.start + clip.duration
}

export function projectDuration(project: Project) {
  return project.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}

export function clipsAt(project: Project, time: number) {
  return project.clips.filter((clip) => clip.kind !== 'gap' && time >= clip.start && time < clipEnd(clip) - 1e-9)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function uid(prefix: string, i: number) {
  return `${prefix}${i}`
}

function unescapeText(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function snapTime(seconds: number, fps: number) {
  const rate = Math.max(1, fps)
  return Math.round(seconds * rate) / rate
}

function parseClock(raw: string | undefined, fps: number, fallback: number) {
  if (raw == null || raw === '') return snapTime(fallback, fps)
  const m = String(raw)
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(s|ms|f)?$/i)
  if (!m) return snapTime(fallback, fps)
  const n = Number(m[1])
  if (!Number.isFinite(n)) return snapTime(fallback, fps)
  const unit = (m[2] || 's').toLowerCase()
  const sec = unit === 'ms' ? n / 1000 : unit === 'f' ? n / fps : n
  return snapTime(sec, fps)
}

function parseSize(raw: string | undefined) {
  const m = String(raw ?? '').trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

function parseColor(raw: string | undefined, fallback: string) {
  const v = String(raw ?? '').trim()
  if (!v) return fallback
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v
  if (/^[a-z]+$/i.test(v)) return v
  return fallback
}

function parseFit(raw: string | undefined): 'cover' | 'contain' {
  return raw === 'contain' ? 'contain' : 'cover'
}

function parseTrans(raw: string | undefined): Transition {
  if (raw === 'dissolve') return 'dissolve'
  return TRANS.includes(raw as Transition) ? (raw as Transition) : 'cut'
}

function parseUnit(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return clamp(n, min, max)
}

function parseCrop(raw: string | undefined): [number, number, number, number] {
  const parts = String(raw ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return [0, 0, 1, 1]
  const x = clamp(parts[0]!, 0, 1)
  const y = clamp(parts[1]!, 0, 1)
  return [x, y, clamp(parts[2]!, 0.01, 1 - x), clamp(parts[3]!, 0.01, 1 - y)]
}

function parseAnimation(raw: string | undefined): Clip['anim'] {
  const v = String(raw ?? '').trim()
  if (v === 'fadeUp' || v === 'rise') return 'rise'
  if (v === 'slideIn' || v === 'slide-left') return 'slide-left'
  if (v === 'fade' || v === 'pop' || v === 'typewriter' || v === 'pulse' || v === 'wave' || v === 'blur-in' || v === 'blurIn') {
    return v === 'blurIn' ? 'blur-in' : v
  }
  return 'none'
}

function resolveEnter(attrs: Attrs): string {
  const enter = String(attrs.enter ?? '').trim()
  if (enter) return enter
  const anim = parseAnimation(attrs.anim)
  if (anim === 'fade') return 'fade'
  if (anim === 'rise') return 'fadeUp'
  if (anim === 'pop') return 'pop'
  if (anim === 'slide-left') return 'slideIn'
  if (anim === 'typewriter') return 'typewriter'
  if (anim === 'blur-in') return 'blurIn'
  if (anim === 'wave') return 'move(y:+8)'
  if (anim === 'pulse') return 'fade'
  return ''
}

function parseShape(raw: string | undefined): Clip['shape'] {
  return raw === 'circle' || raw === 'rounded' ? raw : 'rectangle'
}

function parseAlign(raw: string | undefined): Align {
  return raw === 'left' || raw === 'right' ? raw : 'center'
}

function parseValign(raw: string | undefined): Valign {
  return raw === 'top' || raw === 'bottom' ? raw : 'middle'
}

function parseBlurMode(raw: string | undefined): BlurMode {
  return raw === 'mosaic' ? 'mosaic' : 'blur'
}

function parseDir(raw: string | undefined): { x: number; y: number } | null {
  const table: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -0.18 },
    down: { x: 0, y: 0.18 },
    left: { x: -0.18, y: 0 },
    right: { x: 0.18, y: 0 },
    'up-right': { x: 0.14, y: -0.14 },
    'up-left': { x: -0.14, y: -0.14 },
    'down-right': { x: 0.14, y: 0.14 },
    'down-left': { x: -0.14, y: 0.14 },
  }
  return table[String(raw ?? '').trim()] ?? null
}

function parseStaggerFrom(raw: string | undefined): Clip['staggerFrom'] {
  return raw === 'end' || raw === 'center' || raw === 'random' ? raw : 'start'
}

function parseUnitKind(unit: string | undefined, stagger: string | undefined): Clip['unit'] {
  if (unit === 'char' || unit === 'word' || unit === 'line') return unit
  if (stagger && String(stagger).trim()) return 'char'
  return 'none'
}

function parseRamp(raw: string | undefined): number[] | null {
  const s = String(raw ?? '').trim()
  if (!s.includes('→') && !s.includes('->')) return null
  const parts = s.split(/→|->/).map((part) => Number(part.trim()))
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null
  return parts
}

function rampCurve(prop: string, values: number[], duration: number, ease = 'ease-inOut'): AnimCurve {
  const n = Math.max(1, values.length - 1)
  return {
    prop,
    keys: values.map((v, i) => ({ at: (duration * i) / n, v, ease })),
  }
}

function parseEase(raw: string | undefined) {
  const v = String(raw ?? 'ease-inOut').trim()
  if (v === 'inOut' || v === 'easeInOut') return 'ease-inOut'
  if (v === 'in') return 'ease-in'
  if (v === 'out') return 'ease-out'
  return v || 'ease-inOut'
}

function attachMotion(clip: Clip, el: El, fps: number) {
  const zoom = parseRamp(el.attrs.zoom)
  if (zoom) clip.animates.push(rampCurve('scale', zoom, clip.duration))
  const speed = parseRamp(el.attrs.speed)
  if (speed) clip.animates.push(rampCurve('speed', speed, clip.duration))
  for (const child of el.children) {
    if (child.name === 'mask') {
      clip.mask = {
        shape: child.attrs.shape === 'ellipse' || child.attrs.shape === 'circle' ? 'ellipse' : child.attrs.shape === 'rounded' ? 'rounded' : 'rectangle',
        x: parseUnit(child.attrs.x, 0.5, 0, 1),
        y: parseUnit(child.attrs.y, 0.5, 0, 1),
        w: parseUnit(child.attrs.w, 1, 0.01, 1),
        h: parseUnit(child.attrs.h, 1, 0.01, 1),
      }
      continue
    }
    if (child.name === 'animate') {
      const delay = parseClock(child.attrs.delay, fps, 0)
      const dur = parseClock(child.attrs.dur, fps, clip.duration)
      const from = Number(child.attrs.from)
      const to = Number(child.attrs.to)
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue
      clip.animates.push({
        prop: String(child.attrs.prop ?? 'opacity'),
        keys: [
          { at: delay, v: from, ease: parseEase(child.attrs.ease) },
          { at: delay + dur, v: to, ease: parseEase(child.attrs.ease) },
        ],
      })
      continue
    }
    if (child.name === 'keyframes') {
      const prop = String(child.attrs.prop ?? 'opacity')
      const keys = child.children
        .filter((node) => node.name === 'k')
        .map((node) => ({
          at: parseClock(node.attrs.at, fps, 0),
          v: Number(node.attrs.v),
          ease: parseEase(node.attrs.ease),
        }))
        .filter((key) => Number.isFinite(key.v))
      if (keys.length) clip.animates.push({ prop, keys })
    }
  }
}

function parseFlag(raw: string | undefined) {
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function parseDescription(attrs: Attrs) {
  return String(attrs.description ?? attrs.desc ?? attrs.dsc ?? attrs.d ?? '').trim()
}

function parseOffsetPair(raw: string | undefined, fps: number): [number, number] {
  if (!raw) return [0, 0]
  const parts = String(raw).split(',')
  return [parseClock(parts[0], fps, 0), parseClock(parts[1], fps, 0)]
}

type Attrs = Record<string, string>

function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {}
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>'"]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return attrs
}

type Node =
  | { type: 'open'; name: string; attrs: Attrs; self: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string }

type El = { name: string; attrs: Attrs; children: El[]; text: string }

function tokenize(source: string): Node[] {
  const nodes: Node[] = []
  const re = /<\/([A-Za-z_][\w-]*)\s*>|<([A-Za-z_][\w-]*)([^>]*?)\s*(\/?)\s*>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m[1]) {
      nodes.push({ type: 'close', name: m[1].toLowerCase() })
      continue
    }
    if (m[2]) {
      nodes.push({
        type: 'open',
        name: m[2].toLowerCase(),
        attrs: parseAttrs(m[3] ?? ''),
        self: m[4] === '/',
      })
      continue
    }
    const text = (m[5] ?? '').replace(/\s+/g, ' ').trim()
    if (text) nodes.push({ type: 'text', text: unescapeText(text) })
  }
  return nodes
}

function parseBody(nodes: Node[], start: number, stop: string): { els: El[]; text: string; i: number } {
  const els: El[] = []
  let text = ''
  let i = start
  while (i < nodes.length) {
    const node = nodes[i]
    if (node.type === 'close') {
      if (node.name === stop) return { els, text, i: i + 1 }
      throw new ScriptError(node.name, `unexpected </${node.name}>`)
    }
    if (node.type === 'text') {
      text += (text ? ' ' : '') + node.text
      i += 1
      continue
    }
    i += 1
    if (node.self) {
      els.push({ name: node.name, attrs: node.attrs, children: [], text: String(node.attrs.text ?? '') })
      continue
    }
    const inner = parseBody(nodes, i, node.name)
    i = inner.i
    els.push({ name: node.name, attrs: node.attrs, children: inner.els, text: inner.text.trim() })
  }
  throw new ScriptError(stop, `missing </${stop}>`)
}

export class ScriptError extends Error {
  constructor(
    readonly at: string,
    message: string,
  ) {
    super(message)
  }
}

function clipFrom(kind: ClipKind, attrs: Attrs, text: string, start: number, id: string, fps: number, track: string, layer: number): Clip {
  const fallbackDur = kind === 'zoom' ? 0.8 : kind === 'caption' || kind === 'speed' || kind === 'trim' || kind === 'gap' ? 1 : 3
  const x = parseUnit(attrs.x, 0.5, 0, 1)
  const y = parseUnit(attrs.y, 0.5, 0, 1)
  const dir = parseDir(attrs.dir)
  const name = String(attrs.id ?? '').trim()
  let bg = parseColor(attrs.bg, kind === 'title' ? '#111111' : '#191919')
  if (kind === 'solid') bg = parseColor(attrs.color ?? attrs.from ?? attrs.bg, '#000000')
  return {
    id: name || id,
    name,
    track,
    layer,
    kind,
    start,
    duration: Math.max(kind === 'gap' ? 0 : 1 / fps, parseClock(attrs.dur ?? attrs.duration, fps, fallbackDur)),
    text,
    description: parseDescription(attrs),
    bg,
    ink: parseColor(attrs.ink ?? attrs.to, '#f6f2ea'),
    src: String(attrs.src ?? '').trim(),
    fit: parseFit(attrs.fit),
    trans: parseTrans(attrs.trans),
    cx: parseUnit(attrs.cx, 0.5, 0, 1),
    cy: parseUnit(attrs.cy, 0.5, 0, 1),
    depth: parseUnit(attrs.depth, kind === 'zoom' ? 1.6 : 1, 1, 5),
    x,
    y,
    x2: parseUnit(attrs.x2, dir ? clamp(x + dir.x, 0, 1) : x, 0, 1),
    y2: parseUnit(attrs.y2, dir ? clamp(y + dir.y, 0, 1) : y, 0, 1),
    w: parseUnit(attrs.w, kind === 'pip' ? 0.24 : kind === 'text' || kind === 'stamp' ? 0.56 : 0.25, 0.01, 1),
    h: parseUnit(attrs.h, kind === 'pip' ? 0.3 : kind === 'text' || kind === 'stamp' ? 0.16 : 0.2, 0.01, 1),
    size: parseUnit(attrs.size, kind === 'cursor' ? 28 : 32, 8, 160),
    amount: parseUnit(attrs.amount ?? attrs.width, kind === 'spotlight' ? 18 : 12, 1, 40),
    speed: parseUnit(attrs.speed, 1, 0.1, 16),
    click: attrs.click == null ? -1 : Math.max(0, parseClock(attrs.click, fps, -1)),
    color: parseColor(attrs.color, '#ffffff'),
    anim: parseAnimation(attrs.anim),
    shape: parseShape(attrs.shape),
    crop: parseCrop(attrs.crop),
    sourceIn: Math.max(0, parseClock(attrs.in, fps, 0)),
    available: Math.max(0, parseClock(attrs.available, fps, 0)),
    volume: parseUnit(attrs.volume, 1, 0, 1),
    align: parseAlign(attrs.align),
    valign: parseValign(attrs.valign),
    weight: attrs.weight === 'normal' ? 'normal' : 'bold',
    italic: parseFlag(attrs.italic),
    underline: parseFlag(attrs.underline),
    pad: parseUnit(attrs.pad, kind === 'text' || kind === 'stamp' ? 10 : 0, 0, 48),
    rx: parseUnit(attrs.rx, 0, -40, 40),
    ry: parseUnit(attrs.ry, 0, -40, 40),
    rz: parseUnit(attrs.rz, 0, -40, 40),
    mode: parseBlurMode(attrs.mode ?? attrs.type),
    follow: String(attrs.follow ?? '').trim(),
    scale: parseUnit(attrs.scale, 1, 0.05, 8),
    rotate: parseUnit(attrs.rotate, 0, -720, 720),
    opacity: parseUnit(attrs.opacity, 1, 0, 1),
    unit: parseUnitKind(attrs.unit, attrs.stagger),
    stagger: Math.max(0, parseClock(attrs.stagger, fps, 0)),
    staggerFrom: parseStaggerFrom(attrs['stagger-from'] ?? attrs.staggerFrom),
    enter: resolveEnter(attrs),
    exit: String(attrs.exit ?? '').trim(),
    ease: String(attrs.ease ?? '').trim(),
    motionDur: Math.max(0, parseClock(attrs['motion-dur'], fps, 0.45)),
    animates: [],
    mask: null,
  }
}

function fieldOf(clip: Clip, field: string) {
  if (field === 'start') return clip.start
  if (field === 'dur' || field === 'duration') return clip.duration
  return clipEnd(clip)
}

function evalExpr(raw: string, fps: number, named: Map<string, Clip>): number | null {
  const s = String(raw).trim()
  if (!s) return null
  const ref = s.match(/^([A-Za-z_][\w-]*)\.(start|end|dur|duration)(?:\s*([+-])\s*(.+))?$/i)
  if (ref) {
    const clip = named.get(ref[1]!)
    if (!clip) return null
    const base = fieldOf(clip, ref[2]!.toLowerCase())
    if (!ref[3]) return snapTime(base, fps)
    const delta = Math.abs(parseClock(ref[4], fps, 0))
    return snapTime(ref[3] === '-' ? base - delta : base + delta, fps)
  }
  const clock = parseClock(s, fps, Number.NaN)
  return Number.isFinite(clock) ? clock : null
}

function applyFollow(clip: Clip, target: Clip, fps: number, offsetRaw: string | undefined) {
  const [lead, trail] = parseOffsetPair(offsetRaw, fps)
  clip.start = snapTime(target.start + lead, fps)
  clip.duration = Math.max(1 / fps, snapTime(target.duration - lead + trail, fps))
}

function diagnose(project: Project): Diagnostic[] {
  const out: Diagnostic[] = []
  const duration = projectDuration(project)
  const live = project.clips.filter((clip) => clip.kind !== 'gap')
  out.push({
    level: 'info',
    message: `编译通过 · ${duration.toFixed(2)}s · ${project.tracks.length} 轨 ${live.length} 片段`,
  })
  for (const lane of project.tracks) {
    const items = lane.clips.filter((clip) => clip.kind !== 'gap').sort((a, b) => a.start - b.start)
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!
      const next = items[i]!
      const overlap = clipEnd(prev) - next.start
      if (overlap > 1 / project.fps) {
        out.push({
          level: 'warn',
          message: `${lane.name} ${next.start.toFixed(1)}s: 两个 <${next.kind}> 重叠 ${overlap.toFixed(2)}s`,
        })
      }
    }
  }
  const visuals = live.filter((clip) => VISUAL.has(clip.kind)).sort((a, b) => a.start - b.start)
  if (visuals.length) {
    let covered = 0
    for (const clip of visuals) {
      if (clip.start > covered + 1 / project.fps) {
        out.push({
          level: 'warn',
          message: `${covered.toFixed(1)}–${clip.start.toFixed(1)}s: 无视觉内容 ${(clip.start - covered).toFixed(1)}s`,
        })
      }
      covered = Math.max(covered, clipEnd(clip))
    }
    if (duration > covered + 1 / project.fps) {
      out.push({
        level: 'warn',
        message: `${covered.toFixed(1)}–${duration.toFixed(1)}s: 无视觉内容 ${(duration - covered).toFixed(1)}s`,
      })
    }
  }
  const audio = live.filter((clip) => clip.kind === 'audio')
  if (audio.length && duration > 0) {
    const union: [number, number][] = []
    for (const clip of [...audio].sort((a, b) => a.start - b.start)) {
      const last = union[union.length - 1]
      if (!last || clip.start > last[1]) union.push([clip.start, clipEnd(clip)])
      else last[1] = Math.max(last[1], clipEnd(clip))
    }
    const covered = union.reduce((sum, [a, b]) => sum + (b - a), 0)
    out.push({
      level: 'info',
      message: `人声覆盖 ${Math.round((covered / duration) * 100)}%，静默 ${(duration - covered).toFixed(1)}s`,
    })
  }
  for (const clip of live) {
    if (!clip.follow) continue
    const target = live.find((item) => item.name === clip.follow || item.id === clip.follow)
    if (!target) {
      out.push({ level: 'warn', message: `<${clip.kind}> follow=${clip.follow} 找不到目标` })
      continue
    }
    if (clip.start + 0.5 < target.start - 0.05) {
      out.push({
        level: 'warn',
        message: `<${clip.kind}>「${clip.text || clip.description || clip.id}」比 follow 目标早 ${(target.start - clip.start).toFixed(2)}s（绑定失效？）`,
      })
    }
  }
  for (const clip of live) {
    if ((clip.kind === 'media' || clip.kind === 'pip' || clip.kind === 'image' || clip.kind === 'audio') && !clip.src) {
      out.push({ level: 'warn', message: `素材缺失: <${clip.kind} id=${clip.id}>` })
    }
  }
  const captions = live.filter((clip) => clip.kind === 'caption').sort((a, b) => a.start - b.start)
  for (let i = 1; i < captions.length; i++) {
    const prev = captions[i - 1]!
    const next = captions[i]!
    const overlap = clipEnd(prev) - next.start
    if (overlap > 1 / project.fps) {
      out.push({
        level: 'warn',
        message: `字幕重叠 ${overlap.toFixed(2)}s：「${prev.text}」与「${next.text}」`,
      })
    }
  }
  return out
}

export function formatReport(project: Project) {
  return project.diagnostics
    .map((item) => {
      const mark = item.level === 'warn' ? '⚠️' : item.level === 'error' ? '⛔' : item.level === 'info' && item.message.startsWith('编译通过') ? '✅' : 'ℹ️'
      return `${mark} ${item.message}`
    })
    .join('\n')
}

type Draft = {
  el: El
  kind: ClipKind
  clip: Clip
  atRaw: string
  follow: string
  offset: string
  placed: boolean
}

function needsSrc(kind: ClipKind) {
  return kind === 'media' || kind === 'pip' || kind === 'image' || kind === 'audio'
}

export function compileScript(source: string): Project {
  const script = source.trim() || SAMPLE_SCRIPT
  const nodes = tokenize(script)
  const project = emptyProject(script)
  if (!nodes.length) throw new ScriptError('timeline', 'script must start with <timeline>')
  const first = nodes[0]
  if (!first || first.type !== 'open') throw new ScriptError('timeline', 'script must start with <timeline>')
  if (first.name === 'video') throw new ScriptError('video', 'old <video> grammar is gone; use <timeline> with <track>')
  if (first.name !== 'timeline') throw new ScriptError(first.name, 'script must start with <timeline>')
  const tree = first.self ? { els: [] as El[], text: '', i: 1 } : parseBody(nodes, 1, 'timeline')
  const size = parseSize(first.attrs.size)
  project.fps = clamp(parseClock(first.attrs.fps, 30, project.fps), 8, 60)
  project.width = clamp(Number(first.attrs.w ?? size?.width ?? project.width), 320, 3840)
  project.height = clamp(Number(first.attrs.h ?? size?.height ?? project.height), 180, 2160)
  project.background = parseColor(first.attrs.background ?? first.attrs.bg, project.background)
  project.wallpaper = String(first.attrs.wallpaper ?? '').trim()
  project.padding = parseUnit(first.attrs.padding, 0, 0, 30)
  project.radius = parseUnit(first.attrs.radius, 0, 0, 64)
  project.shadow = parseUnit(first.attrs.shadow, 0, 0, 64)
  project.description = parseDescription(first.attrs)
  project.bgBlur = parseUnit(first.attrs.blur ?? first.attrs.bgblur, 0, 0, 40)

  const compositions = new Map<string, El>()
  const trackEls: El[] = []
  for (const el of tree.els) {
    if (el.name === 'composition') {
      const id = String(el.attrs.id ?? '').trim()
      if (!id) throw new ScriptError('composition', '<composition> needs id')
      compositions.set(id, el)
      continue
    }
    if (el.name === 'track') {
      trackEls.push(el)
      continue
    }
    throw new ScriptError(el.name, `<timeline> only accepts <track> or <composition>, not <${el.name}>`)
  }
  if (!trackEls.length) throw new ScriptError('timeline', '<timeline> needs at least one <track>')

  let clipIndex = 0
  const named = new Map<string, Clip>()
  const drafts: Draft[] = []
  const lanes: Lane[] = []

  const makeClip = (kind: ClipKind, attrs: Attrs, text: string, track: string, layer: number) => {
    clipIndex += 1
    const clip = clipFrom(kind, attrs, text, Number.NaN, uid('c', clipIndex), project.fps, track, layer)
    if (needsSrc(kind) && !clip.src && !attrs.use) throw new ScriptError(kind, `<${kind}> needs src`)
    if (clip.name) {
      if (named.has(clip.name)) throw new ScriptError(clip.name, `duplicate id ${clip.name}`)
      named.set(clip.name, clip)
    }
    return clip
  }

  const expandUse = (attrs: Attrs, extra: El[]) => {
    const use = String(attrs.use ?? '').trim()
    if (!use) return extra
    const comp = compositions.get(use)
    if (!comp) throw new ScriptError('clip', `unknown composition ${use}`)
    const innerTracks = comp.children.filter((child) => child.name === 'track')
    return innerTracks.length ? innerTracks.flatMap((inner) => inner.children) : extra
  }

  const fadeOf = (kind: Transition): Transition => (kind === 'dissolve' ? 'fade' : kind)
  const laneDrafts = new Map<Lane, Draft[]>()
  type PendingTrans = { dur: number; kind: Transition; enter: string; exit: string; ease: string }

  trackEls.forEach((trackEl, trackIndex) => {
    const name = String(trackEl.attrs.name ?? trackEl.attrs.id ?? `track-${trackIndex + 1}`).trim()
    const layer = parseUnit(trackEl.attrs.layer, trackIndex + 1, 0, 64)
    const kind = trackEl.attrs.kind === 'audio' || trackEl.attrs.kind === 'video' ? trackEl.attrs.kind : 'auto'
    const lane: Lane = { id: name, name, layer, kind, clips: [] }
    const local: Draft[] = []
    const pushItem = (el: El) => {
      if (el.name === 'cut') return
      const alias = ITEM_ALIAS[el.name]
      if (!alias) throw new ScriptError(el.name, `unknown tag <${el.name}>`)
      if (alias === 'transition') {
        const marker = makeClip('gap', { dur: el.attrs.dur ?? '0.5s' }, '', name, layer)
        local.push({
          el,
          kind: 'gap',
          clip: marker,
          atRaw: '',
          follow: '',
          offset: '',
          placed: true,
        })
        return
      }
      const text = el.text || (el.name === 'bars' ? 'COLOR BARS' : '')
      const clip = makeClip(alias, el.attrs, text, name, layer)
      attachMotion(clip, el, project.fps)
      const draft: Draft = {
        el,
        kind: alias,
        clip,
        atRaw: String(el.attrs.at ?? el.attrs.start ?? ''),
        follow: clip.follow,
        offset: String(el.attrs.offset ?? ''),
        placed: false,
      }
      local.push(draft)
      drafts.push(draft)
      lane.clips.push(clip)
    }
    for (const el of trackEl.children) {
      if ((el.name === 'clip' || el.name === 'media') && el.attrs.use) {
        for (const child of expandUse(el.attrs, el.children)) pushItem(child)
        continue
      }
      if (CONTAINERS.has(el.name)) throw new ScriptError(el.name, `<track> cannot nest <${el.name}>`)
      pushItem(el)
    }
    lanes.push(lane)
    laneDrafts.set(lane, local)
  })

  for (const lane of lanes) {
    const local = laneDrafts.get(lane) ?? []
    let cursor = 0
    let pending: PendingTrans | null = null
    for (const draft of local) {
      if (draft.el.name === 'transition') {
        pending = {
          dur: parseClock(draft.el.attrs.dur, project.fps, 0.5),
          kind: parseTrans(draft.el.attrs.kind ?? draft.el.attrs.trans),
          enter: String(draft.el.attrs.enter ?? '').trim(),
          exit: String(draft.el.attrs.exit ?? '').trim(),
          ease: String(draft.el.attrs.ease ?? '').trim(),
        }
        continue
      }
      if (draft.follow) continue
      if (draft.atRaw) {
        const start = evalExpr(draft.atRaw, project.fps, named)
        if (start == null) continue
        draft.clip.start = start
        draft.placed = true
        cursor = snapTime(Math.max(cursor, clipEnd(draft.clip)), project.fps)
        pending = null
        continue
      }
      if (pending) {
        const prev = [...local].reverse().find((item) => item.placed && item.el.name !== 'transition')
        draft.clip.start = snapTime(Math.max(0, cursor - pending.dur), project.fps)
        draft.clip.trans = fadeOf(pending.kind)
        if (pending.enter) draft.clip.enter = pending.enter
        if (pending.ease) draft.clip.ease = pending.ease
        draft.clip.motionDur = pending.dur
        if (prev) {
          prev.clip.trans = fadeOf(pending.kind)
          if (pending.exit) prev.clip.exit = pending.exit
          if (pending.ease) prev.clip.ease = pending.ease
          prev.clip.motionDur = pending.dur
        }
        pending = null
      } else {
        draft.clip.start = cursor
      }
      draft.placed = true
      cursor = snapTime(clipEnd(draft.clip), project.fps)
    }
  }

  for (let pass = 0; pass < 8; pass++) {
    let progress = false
    for (const draft of drafts) {
      if (draft.placed) continue
      if (draft.follow) {
        const target = named.get(draft.follow)
        if (!target || !Number.isFinite(target.start)) continue
        applyFollow(draft.clip, target, project.fps, draft.offset)
        draft.placed = true
        progress = true
        continue
      }
      if (draft.atRaw) {
        const start = evalExpr(draft.atRaw, project.fps, named)
        if (start == null) continue
        draft.clip.start = start
        draft.placed = true
        progress = true
      }
    }
    if (!progress) break
  }

  for (const draft of drafts) {
    if (draft.placed && Number.isFinite(draft.clip.start)) continue
    if (draft.follow && !named.get(draft.follow)) {
      draft.clip.start = 0
      draft.placed = true
      continue
    }
    if (draft.atRaw) throw new ScriptError(draft.clip.kind, `cannot resolve at=${draft.atRaw}`)
    draft.clip.start = Number.isFinite(draft.clip.start) ? draft.clip.start : 0
    draft.placed = true
  }

  project.tracks = lanes
  project.clips = lanes.flatMap((lane) => lane.clips)
  if (!project.clips.length) throw new ScriptError('timeline', '<timeline> needs at least one clip')
  project.script = script
  project.diagnostics = diagnose(project)
  return project
}

function fmtTime(n: number) {
  const rounded = Math.round(n * 100) / 100
  return `${rounded}s`
}

function attr(key: string, value: string | number | undefined, skip?: string | number) {
  if (value == null || value === '' || value === skip) return ''
  const raw = String(value)
  return /\s/.test(raw) ? ` ${key}="${raw}"` : ` ${key}=${raw}`
}

function dumpClip(clip: Clip, serialStart: number) {
  const needAt = Math.abs(clip.start - serialStart) > 0.001
  const kind = clip.kind === 'media' ? 'clip' : clip.kind
  const common =
    attr('id', clip.name) +
    attr('dur', fmtTime(clip.duration)) +
    (needAt ? attr('at', fmtTime(clip.start)) : '') +
    attr('follow', clip.follow) +
    attr('bg', clip.kind === 'zoom' || clip.kind === 'media' ? undefined : clip.bg) +
    attr('ink', clip.kind === 'zoom' || clip.kind === 'media' ? undefined : clip.ink) +
    attr('trans', clip.trans, 'cut') +
    attr('enter', clip.enter) +
    attr('exit', clip.exit) +
    attr('ease', clip.ease) +
    attr('src', clip.src) +
    attr('fit', clip.fit, 'cover') +
    attr('cx', clip.kind === 'zoom' ? clip.cx : undefined, 0.5) +
    attr('cy', clip.kind === 'zoom' ? clip.cy : undefined, 0.5) +
    attr('depth', clip.kind === 'zoom' ? clip.depth : undefined, 1) +
    attr('x', clip.kind !== 'zoom' && clip.kind !== 'media' && clip.kind !== 'title' && clip.kind !== 'scene' && clip.kind !== 'solid' ? clip.x : undefined, 0.5) +
    attr('y', clip.kind !== 'zoom' && clip.kind !== 'media' && clip.kind !== 'title' && clip.kind !== 'scene' && clip.kind !== 'solid' ? clip.y : undefined, 0.5) +
    attr('x2', clip.kind === 'arrow' || clip.kind === 'cursor' ? clip.x2 : undefined, clip.x) +
    attr('y2', clip.kind === 'arrow' || clip.kind === 'cursor' ? clip.y2 : undefined, clip.y) +
    attr('w', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'box' || clip.kind === 'spotlight' || clip.kind === 'stamp' ? clip.w : undefined) +
    attr('h', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'box' || clip.kind === 'spotlight' || clip.kind === 'stamp' ? clip.h : undefined) +
    attr('size', clip.kind === 'text' || clip.kind === 'cursor' || clip.kind === 'stamp' ? clip.size : undefined) +
    attr('amount', clip.kind === 'blur' || clip.kind === 'spotlight' || clip.kind === 'box' ? clip.amount : undefined) +
    attr('speed', clip.kind === 'media' || clip.kind === 'pip' || clip.kind === 'speed' ? clip.speed : undefined, 1) +
    attr('click', clip.kind === 'cursor' && clip.click >= 0 ? fmtTime(clip.click) : undefined) +
    attr('color', clip.kind === 'text' || clip.kind === 'arrow' || clip.kind === 'cursor' || clip.kind === 'box' || clip.kind === 'solid' ? clip.color : undefined) +
    attr('anim', clip.kind === 'text' || clip.kind === 'image' ? clip.anim : undefined, 'none') +
    attr('shape', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' ? clip.shape : undefined, 'rectangle') +
    attr('in', clip.kind === 'media' || clip.kind === 'pip' || clip.kind === 'audio' ? fmtTime(clip.sourceIn) : undefined, '0s') +
    attr('available', clip.available || undefined, 0) +
    attr('volume', clip.kind === 'audio' ? clip.volume : undefined, 1) +
    attr('align', clip.kind === 'text' || clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'stamp' || clip.kind === 'caption' ? clip.align : undefined, 'center') +
    attr('valign', clip.kind === 'text' || clip.kind === 'title' || clip.kind === 'scene' || clip.kind === 'stamp' ? clip.valign : undefined, 'middle') +
    attr('weight', clip.kind === 'text' || clip.kind === 'stamp' ? clip.weight : undefined, 'bold') +
    attr('italic', clip.italic ? 'true' : undefined) +
    attr('underline', clip.underline ? 'true' : undefined) +
    attr('pad', clip.kind === 'text' || clip.kind === 'stamp' ? clip.pad : undefined, 10) +
    attr('rx', clip.kind === 'zoom' ? clip.rx : undefined, 0) +
    attr('ry', clip.kind === 'zoom' ? clip.ry : undefined, 0) +
    attr('rz', clip.kind === 'zoom' ? clip.rz : undefined, 0) +
    attr('mode', clip.kind === 'blur' ? clip.mode : undefined, 'blur') +
    attr('desc', clip.description) +
    attr(
      'crop',
      clip.kind === 'media' && clip.crop.some((value, index) => value !== [0, 0, 1, 1][index]) ? clip.crop.join(',') : undefined,
    )
  const voidish =
    clip.kind === 'media' ||
    clip.kind === 'zoom' ||
    clip.kind === 'arrow' ||
    clip.kind === 'blur' ||
    clip.kind === 'cursor' ||
    clip.kind === 'pip' ||
    clip.kind === 'image' ||
    clip.kind === 'audio' ||
    clip.kind === 'speed' ||
    clip.kind === 'trim' ||
    clip.kind === 'box' ||
    clip.kind === 'spotlight' ||
    clip.kind === 'gap'
  return voidish ? `    <${kind}${common} />` : `    <${kind}${common}>${escapeText(clip.text)}</${kind}>`
}

export function dumpScript(project: Project): string {
  const root =
    `<timeline fps=${project.fps} size=${project.width}x${project.height}` +
    attr('background', project.background, '#e9e7e2') +
    attr('wallpaper', project.wallpaper) +
    attr('padding', project.padding, 0) +
    attr('radius', project.radius, 0) +
    attr('shadow', project.shadow, 0) +
    attr('blur', project.bgBlur, 0) +
    attr('description', project.description) +
    '>'
  const lines = [root]
  const lanes = project.tracks.length
    ? project.tracks
    : [{ id: 'main', name: 'main', layer: 1, kind: 'auto' as const, clips: project.clips }]
  for (const lane of lanes) {
    lines.push(`  <track name=${lane.name}${lane.layer !== 1 ? attr('layer', lane.layer) : ''}>`)
    let cursor = 0
    for (const clip of lane.clips) {
      lines.push(dumpClip(clip, cursor))
      cursor = clipEnd(clip)
    }
    lines.push('  </track>')
  }
  lines.push('</timeline>')
  return lines.join('\n')
}

export function parseProject(raw: unknown): Project {
  if (typeof raw === 'string') return compileScript(raw)
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (typeof o.script === 'string' && o.script.trim()) {
    try {
      return compileScript(o.script)
    } catch {
      /* fall through */
    }
  }
  const project = emptyProject(typeof o.script === 'string' ? o.script : SAMPLE_SCRIPT)
  if (typeof o.script === 'string' && o.script.trim()) return project
  return project
}

export function compileSafe(script: string): { ok: true; project: Project } | { ok: false; error: string } {
  try {
    return { ok: true, project: compileScript(script) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function easeInOut(t: number) {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}

export function easeApply(name: string, t: number) {
  const x = clamp(t, 0, 1)
  if (name === 'linear') return x
  if (name === 'ease-in' || name === 'easeIn') return x * x
  if (name === 'ease-out' || name === 'easeOut') return 1 - (1 - x) * (1 - x)
  if (name === 'spring') return 1 - Math.exp(-6 * x) * Math.cos(x * Math.PI * 3)
  const cubic = name.match(/^cubic\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/)
  if (cubic) {
    const y1 = Number(cubic[2])
    const y2 = Number(cubic[4])
    return (1 - x) * (1 - x) * (1 - x) * 0 + 3 * (1 - x) * (1 - x) * x * y1 + 3 * (1 - x) * x * x * y2 + x * x * x
  }
  return easeInOut(x)
}

function fallbackProp(clip: Clip, prop: string) {
  if (prop === 'scale') return clip.scale
  if (prop === 'rotate') return clip.rotate
  if (prop === 'opacity') return clip.opacity
  if (prop === 'x') return clip.x
  if (prop === 'y') return clip.y
  if (prop === 'speed') return clip.speed
  if (prop === 'volume') return clip.volume
  if (prop === 'amount') return clip.amount
  return 0
}

export function propAt(clip: Clip, prop: string, time: number, fallback?: number) {
  const local = time - clip.start
  const curve = clip.animates.find((item) => item.prop === prop)
  const base = fallback ?? fallbackProp(clip, prop)
  if (!curve || !curve.keys.length) return base
  const keys = [...curve.keys].sort((a, b) => a.at - b.at)
  if (local <= keys[0]!.at) return keys[0]!.v
  for (let i = 1; i < keys.length; i++) {
    const next = keys[i]!
    const prev = keys[i - 1]!
    if (local <= next.at) {
      const t = easeApply(prev.ease, (local - prev.at) / Math.max(1e-6, next.at - prev.at))
      return prev.v + (next.v - prev.v) * t
    }
  }
  return keys[keys.length - 1]!.v
}

export function clipTransform(clip: Clip, time: number) {
  return {
    x: propAt(clip, 'x', time),
    y: propAt(clip, 'y', time),
    scale: propAt(clip, 'scale', time),
    rotate: propAt(clip, 'rotate', time),
    opacity: propAt(clip, 'opacity', time),
  }
}

export function splitTextUnits(text: string, unit: Clip['unit']) {
  if (unit === 'word') return text.split(/(\s+)/).filter((part) => part.length)
  if (unit === 'line') return text.split(/\n+/)
  return Array.from(text)
}

export function staggerDelay(index: number, count: number, stagger: number, from: Clip['staggerFrom']) {
  if (count <= 1) return 0
  if (from === 'end') return (count - 1 - index) * stagger
  if (from === 'center') return Math.abs(index - (count - 1) / 2) * stagger
  if (from === 'random') return ((index * 17) % count) * stagger * 0.35
  return index * stagger
}

export function maskCss(mask: Mask | null) {
  if (!mask) return undefined
  const x = (mask.x - mask.w / 2) * 100
  const y = (mask.y - mask.h / 2) * 100
  if (mask.shape === 'ellipse') return `ellipse(${mask.w * 50}% ${mask.h * 50}% at ${mask.x * 100}% ${mask.y * 100}%)`
  if (mask.shape === 'rounded') return `inset(${y}% ${100 - x - mask.w * 100}% ${100 - y - mask.h * 100}% ${x}% round 18px)`
  return `inset(${y}% ${100 - x - mask.w * 100}% ${100 - y - mask.h * 100}% ${x}%)`
}

export function cameraAt(project: Project, time: number): Camera {
  let cam: Camera = { scale: 1, cx: 0.5, cy: 0.5, rx: 0, ry: 0, rz: 0 }
  const zooms = project.clips.filter((clip) => clip.kind === 'zoom').sort((a, b) => a.start - b.start)
  for (const zoom of zooms) {
    if (time < zoom.start) break
    const t = easeInOut((time - zoom.start) / Math.max(0.001, zoom.duration))
    const target = { scale: zoom.depth, cx: zoom.cx, cy: zoom.cy, rx: zoom.rx, ry: zoom.ry, rz: zoom.rz }
    cam = {
      scale: cam.scale + (target.scale - cam.scale) * t,
      cx: cam.cx + (target.cx - cam.cx) * t,
      cy: cam.cy + (target.cy - cam.cy) * t,
      rx: cam.rx + (target.rx - cam.rx) * t,
      ry: cam.ry + (target.ry - cam.ry) * t,
      rz: cam.rz + (target.rz - cam.rz) * t,
    }
    if (time < clipEnd(zoom)) break
  }
  return cam
}

export function speedAt(project: Project, time: number, fallback = 1) {
  const region = [...project.clips]
    .reverse()
    .find((clip) => clip.kind === 'speed' && time >= clip.start && time < clipEnd(clip))
  return region?.speed ?? fallback
}

export function motionEdge(clip: Clip) {
  const named = clip.motionDur > 0 ? clip.motionDur : 0.45
  return Math.max(0.04, Math.min(named, clip.duration / 2.5))
}

export function poseAt(clip: Clip, time: number, delay = 0): MotionPose {
  const local = time - clip.start - delay
  const edge = motionEdge(clip)
  const enter = parseMotion(clip.enter)
  const exit = parseMotion(clip.exit)
  let pose = { ...MOTION_REST }
  if (enter.steps.length) pose = mixPose(pose, sampleMotion(enter, clamp((local + 1e-6) / edge, 0, 1), 'enter', clip.ease || undefined))
  if (exit.steps.length) {
    const t = clamp((local - (clip.duration - delay - edge)) / edge, 0, 1)
    if (t > 0) pose = mixPose(pose, sampleMotion(exit, t, 'exit', clip.ease || undefined))
  }
  return pose
}

export function poseStyle(clip: Clip, time: number, delay = 0) {
  return motionCss(poseAt(clip, time, delay))
}

export function clipAlpha(clip: Clip, time: number) {
  if (clip.enter || clip.exit) return 1
  if (clip.trans === 'cut') return 1
  const local = time - clip.start
  const edge = Math.min(0.32, clip.duration / 3)
  const inn = clamp(local / edge, 0, 1)
  const out = clamp((clip.duration - local) / edge, 0, 1)
  return Math.min(inn, out)
}

export function clipShift(clip: Clip, time: number) {
  if (clip.enter || clip.exit) return 0
  if (clip.trans !== 'slide') return 0
  const local = time - clip.start
  const edge = Math.min(0.32, clip.duration / 3)
  const inn = easeInOut(clamp(local / edge, 0, 1))
  return (1 - inn) * 48
}

export function isVideoSrc(src: string) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(src)
}

export type AnnotationMotion = {
  opacity: number
  scale: number
  translateX: number
  translateY: number
  reveal: number
}

export function annotationMotion(clip: Clip, time: number): AnnotationMotion {
  if (clip.enter || clip.exit) {
    const pose = poseAt(clip, time)
    return {
      opacity: pose.opacity,
      scale: pose.scale,
      translateX: pose.x + pose.xPct,
      translateY: pose.y + pose.yPct,
      reveal: pose.clipPath ? 1 : pose.opacity,
    }
  }
  const progress = clamp((time - clip.start) / Math.min(0.7, clip.duration), 0, 1)
  const eased = 1 - (1 - progress) ** 3
  if (clip.anim === 'fade') return { opacity: eased, scale: 1, translateX: 0, translateY: 0, reveal: 1 }
  if (clip.anim === 'rise') {
    return { opacity: eased, scale: 1, translateX: 0, translateY: (1 - eased) * 18, reveal: 1 }
  }
  if (clip.anim === 'pop') {
    const back = 1 + 2.70158 * (progress - 1) ** 3 + 1.70158 * (progress - 1) ** 2
    return { opacity: eased, scale: Math.max(0.72, back), translateX: 0, translateY: 0, reveal: 1 }
  }
  if (clip.anim === 'slide-left') {
    return { opacity: eased, scale: 1, translateX: (1 - eased) * -28, translateY: 0, reveal: 1 }
  }
  if (clip.anim === 'typewriter') {
    return { opacity: 1, scale: 1, translateX: 0, translateY: 0, reveal: progress }
  }
  if (clip.anim === 'wave') {
    return { opacity: 1, scale: 1, translateX: 0, translateY: Math.sin(progress * Math.PI) * 10, reveal: 1 }
  }
  if (clip.anim === 'blur-in') {
    return { opacity: eased, scale: 1.04 - eased * 0.04, translateX: 0, translateY: 0, reveal: 1 }
  }
  return { opacity: 1, scale: 1, translateX: 0, translateY: 0, reveal: 1 }
}

export function cursorAt(clip: Clip, time: number) {
  const progress = easeInOut(clamp((time - clip.start) / Math.max(0.001, clip.duration), 0, 1))
  const clickDistance = clip.click < 0 ? Infinity : Math.abs(time - (clip.start + clip.click))
  const clickProgress = clamp(1 - clickDistance / 0.22, 0, 1)
  return {
    x: clip.x + (clip.x2 - clip.x) * progress,
    y: clip.y + (clip.y2 - clip.y) * progress,
    click: clickProgress,
  }
}
