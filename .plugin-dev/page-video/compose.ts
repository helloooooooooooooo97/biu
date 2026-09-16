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

export type Transition = 'cut' | 'fade' | 'slide'

export type Clip = {
  id: string
  kind: ClipKind
  start: number
  duration: number
  text: string
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
  anim: 'none' | 'fade' | 'rise' | 'pop' | 'slide-left' | 'typewriter' | 'pulse'
  shape: 'rectangle' | 'rounded' | 'circle'
  crop: [number, number, number, number]
  sourceIn: number
  volume: number
}

export type Project = {
  fps: number
  width: number
  height: number
  script: string
  clips: Clip[]
  background: string
  wallpaper: string
  padding: number
  radius: number
  shadow: number
}

export type Camera = { scale: number; cx: number; cy: number }

export const SAMPLE_SCRIPT = `<video fps=30 size=1280x720>
  <title dur=2.2s bg=#111111 ink=#f6f2ea trans=fade>Biu Studio</title>
  <scene dur=3.4s bg=#1a1a2e ink=#ece7dc trans=slide>Agent-directed video.</scene>
  <zoom at=2.4s dur=0.8s cx=0.46 cy=0.38 depth=1.7 />
  <text at=2.7s dur=2s x=.5 y=.82 size=28 anim=rise>Effects are syntax.</text>
  <arrow at=3s dur=1.8s x=.25 y=.65 x2=.44 y2=.45 color=#7dd3fc width=5 />
  <cursor at=2.3s dur=2.4s x=.18 y=.72 x2=.72 y2=.3 click=1.5s size=26 />
</video>
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
])
const OVERLAY = new Set<ClipKind>(['caption', 'zoom', 'text', 'arrow', 'blur', 'cursor', 'pip', 'image', 'audio'])
const TRANS: Transition[] = ['cut', 'fade', 'slide']

export function emptyProject(script = SAMPLE_SCRIPT): Project {
  return {
    fps: 30,
    width: 1280,
    height: 720,
    script,
    clips: [],
    background: '#e9e7e2',
    wallpaper: '',
    padding: 0,
    radius: 0,
    shadow: 0,
  }
}

export function clipEnd(clip: Clip) {
  return clip.start + clip.duration
}

export function projectDuration(project: Project) {
  return project.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}

export function clipsAt(project: Project, time: number) {
  return project.clips.filter((clip) => time >= clip.start && time < clipEnd(clip) - 1e-9)
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

function parseTime(raw: string | undefined, fallback: number) {
  if (raw == null || raw === '') return fallback
  const m = String(raw)
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(s|ms)?$/i)
  if (!m) return fallback
  const n = Number(m[1])
  if (!Number.isFinite(n)) return fallback
  return m[2]?.toLowerCase() === 'ms' ? n / 1000 : n
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
  return raw === 'fade' ||
    raw === 'rise' ||
    raw === 'pop' ||
    raw === 'slide-left' ||
    raw === 'typewriter' ||
    raw === 'pulse'
    ? raw
    : 'none'
}

function parseShape(raw: string | undefined): Clip['shape'] {
  return raw === 'circle' || raw === 'rounded' ? raw : 'rectangle'
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

export class ScriptError extends Error {
  constructor(
    readonly at: string,
    message: string,
  ) {
    super(message)
    this.name = 'ScriptError'
  }
}

function clipFrom(kind: ClipKind, attrs: Attrs, text: string, start: number, id: string): Clip {
  const fallbackDur = kind === 'zoom' ? 0.8 : kind === 'caption' ? 2 : 3
  return {
    id,
    kind,
    start,
    duration: Math.max(0.2, parseTime(attrs.dur ?? attrs.duration, fallbackDur)),
    text,
    bg: parseColor(attrs.bg, kind === 'title' ? '#111111' : '#191919'),
    ink: parseColor(attrs.ink, '#f6f2ea'),
    src: String(attrs.src ?? '').trim(),
    fit: parseFit(attrs.fit),
    trans: parseTrans(attrs.trans),
    cx: parseUnit(attrs.cx, 0.5, 0, 1),
    cy: parseUnit(attrs.cy, 0.5, 0, 1),
    depth: parseUnit(attrs.depth, kind === 'zoom' ? 1.6 : 1, 1, 4),
    x: parseUnit(attrs.x, 0.5, 0, 1),
    y: parseUnit(attrs.y, 0.5, 0, 1),
    x2: parseUnit(attrs.x2, parseUnit(attrs.x, 0.5, 0, 1), 0, 1),
    y2: parseUnit(attrs.y2, parseUnit(attrs.y, 0.5, 0, 1), 0, 1),
    w: parseUnit(attrs.w, kind === 'pip' ? 0.24 : 0.25, 0.01, 1),
    h: parseUnit(attrs.h, kind === 'pip' ? 0.3 : 0.2, 0.01, 1),
    size: parseUnit(attrs.size, kind === 'cursor' ? 28 : 32, 8, 160),
    amount: parseUnit(attrs.amount ?? attrs.width, 12, 1, 40),
    speed: parseUnit(attrs.speed, 1, 0.1, 16),
    click: attrs.click == null ? -1 : Math.max(0, parseTime(attrs.click, -1)),
    color: parseColor(attrs.color, '#ffffff'),
    anim: parseAnimation(attrs.anim),
    shape: parseShape(attrs.shape),
    crop: parseCrop(attrs.crop),
    sourceIn: Math.max(0, parseTime(attrs.in, 0)),
    volume: parseUnit(attrs.volume, 1, 0, 1),
  }
}

export function compileScript(source: string): Project {
  const script = source.trim() || SAMPLE_SCRIPT
  const nodes = tokenize(script)
  const project = emptyProject(script)
  let i = 0
  let foundVideo = false
  let cursor = 0
  let clipIndex = 0

  const takeBody = (name: string) => {
    let text = ''
    while (i < nodes.length) {
      const node = nodes[i]
      if (node.type === 'close' && node.name === name) {
        i += 1
        return text.trim()
      }
      if (node.type === 'open') throw new ScriptError(name, `<${name}> cannot nest <${node.name}>`)
      if (node.type === 'text') text += (text ? ' ' : '') + node.text
      i += 1
    }
    throw new ScriptError(name, `missing </${name}>`)
  }

  const pushClip = (kind: ClipKind, attrs: Attrs, text: string) => {
    const explicit = attrs.at ?? attrs.start
    const start = explicit != null && explicit !== '' ? Math.max(0, parseTime(explicit, cursor)) : cursor
    clipIndex += 1
    const clip = clipFrom(kind, attrs, text, start, uid('c', clipIndex))
    if ((kind === 'media' || kind === 'pip' || kind === 'image' || kind === 'audio') && !clip.src) {
      throw new ScriptError(kind, `<${kind}> needs src`)
    }
    project.clips.push(clip)
    if (!OVERLAY.has(kind)) cursor = Math.max(cursor, clipEnd(clip))
  }

  while (i < nodes.length) {
    const node = nodes[i]
    i += 1
    if (node.type === 'text') continue
    if (node.type === 'close') {
      if (node.name === 'video' && foundVideo) break
      throw new ScriptError(node.name, `unexpected </${node.name}>`)
    }
    if (node.name === 'video') {
      if (foundVideo) throw new ScriptError('video', 'only one <video> root')
      foundVideo = true
      const size = parseSize(node.attrs.size)
      project.fps = clamp(parseTime(node.attrs.fps, project.fps), 8, 60)
      project.width = clamp(Number(node.attrs.w ?? size?.width ?? project.width), 320, 3840)
      project.height = clamp(Number(node.attrs.h ?? size?.height ?? project.height), 180, 2160)
      project.background = parseColor(node.attrs.background ?? node.attrs.bg, project.background)
      project.wallpaper = String(node.attrs.wallpaper ?? '').trim()
      project.padding = parseUnit(node.attrs.padding, 0, 0, 30)
      project.radius = parseUnit(node.attrs.radius, 0, 0, 64)
      project.shadow = parseUnit(node.attrs.shadow, 0, 0, 64)
      if (node.self) break
      continue
    }
    if (!foundVideo) throw new ScriptError(node.name, 'script must start with <video>')
    if (node.name === 'cut') continue
    if (!CLIP_KINDS.has(node.name as ClipKind)) throw new ScriptError(node.name, `unknown tag <${node.name}>`)
    const kind = node.name as ClipKind
    const text = node.self ? String(node.attrs.text ?? '') : takeBody(kind)
    pushClip(kind, node.attrs, text)
  }

  if (!foundVideo) throw new ScriptError('video', 'script must start with <video>')
  if (!project.clips.length) throw new ScriptError('video', '<video> needs at least one clip')
  project.script = script
  return project
}

function fmtTime(n: number) {
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded}s`
}

function attr(key: string, value: string | number | undefined, skip?: string | number) {
  if (value == null || value === '' || value === skip) return ''
  const raw = String(value)
  return /\s/.test(raw) ? ` ${key}="${raw}"` : ` ${key}=${raw}`
}

export function dumpScript(project: Project): string {
  const root =
    `<video fps=${project.fps} size=${project.width}x${project.height}` +
    attr('background', project.background, '#e9e7e2') +
    attr('wallpaper', project.wallpaper) +
    attr('padding', project.padding, 0) +
    attr('radius', project.radius, 0) +
    attr('shadow', project.shadow, 0) +
    '>'
  const lines = [root]
  let cursor = 0
  for (const clip of project.clips) {
    const needAt = OVERLAY.has(clip.kind) || Math.abs(clip.start - cursor) > 0.001
    const common =
      attr('dur', fmtTime(clip.duration)) +
      (needAt ? attr('at', fmtTime(clip.start)) : '') +
      attr('bg', clip.kind === 'zoom' ? undefined : clip.bg) +
      attr('ink', clip.kind === 'zoom' || clip.kind === 'media' ? undefined : clip.ink) +
      attr('trans', clip.trans, 'cut') +
      attr('src', clip.src) +
      attr('fit', clip.fit, 'cover') +
      attr('cx', clip.kind === 'zoom' ? clip.cx : undefined, 0.5) +
      attr('cy', clip.kind === 'zoom' ? clip.cy : undefined, 0.5) +
      attr('depth', clip.kind === 'zoom' ? clip.depth : undefined, 1) +
      attr('x', OVERLAY.has(clip.kind) && clip.kind !== 'zoom' ? clip.x : undefined, 0.5) +
      attr('y', OVERLAY.has(clip.kind) && clip.kind !== 'zoom' ? clip.y : undefined, 0.5) +
      attr('x2', clip.kind === 'arrow' || clip.kind === 'cursor' ? clip.x2 : undefined, clip.x) +
      attr('y2', clip.kind === 'arrow' || clip.kind === 'cursor' ? clip.y2 : undefined, clip.y) +
      attr('w', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' ? clip.w : undefined) +
      attr('h', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' ? clip.h : undefined) +
      attr('size', clip.kind === 'text' || clip.kind === 'cursor' ? clip.size : undefined) +
      attr('amount', clip.kind === 'blur' ? clip.amount : undefined) +
      attr('speed', clip.kind === 'media' || clip.kind === 'pip' ? clip.speed : undefined, 1) +
      attr('click', clip.kind === 'cursor' && clip.click >= 0 ? fmtTime(clip.click) : undefined) +
      attr('color', clip.kind === 'text' || clip.kind === 'arrow' || clip.kind === 'cursor' ? clip.color : undefined) +
      attr('anim', clip.kind === 'text' || clip.kind === 'image' ? clip.anim : undefined, 'none') +
      attr('shape', clip.kind === 'blur' || clip.kind === 'pip' || clip.kind === 'image' ? clip.shape : undefined, 'rectangle') +
      attr('in', clip.kind === 'media' || clip.kind === 'pip' || clip.kind === 'audio' ? fmtTime(clip.sourceIn) : undefined, '0s') +
      attr('volume', clip.kind === 'audio' ? clip.volume : undefined, 1) +
      attr(
        'crop',
        clip.kind === 'media' && clip.crop.some((value, index) => value !== [0, 0, 1, 1][index])
          ? clip.crop.join(',')
          : undefined,
      )
    if (
      clip.kind === 'media' ||
      clip.kind === 'zoom' ||
      clip.kind === 'arrow' ||
      clip.kind === 'blur' ||
      clip.kind === 'cursor' ||
      clip.kind === 'pip' ||
      clip.kind === 'image' ||
      clip.kind === 'audio'
    ) {
      lines.push(`  <${clip.kind}${common} />`)
    } else {
      lines.push(`  <${clip.kind}${common}>${escapeText(clip.text)}</${clip.kind}>`)
    }
    if (!OVERLAY.has(clip.kind)) cursor = Math.max(cursor, clipEnd(clip))
  }
  lines.push('</video>')
  return lines.join('\n')
}

export function parseProject(raw: unknown): Project {
  if (typeof raw === 'string') return compileScript(raw)
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (typeof o.script === 'string' && o.script.trim()) {
    try {
      return compileScript(o.script)
    } catch {
      /* fall through to clips */
    }
  }
  const project = emptyProject(typeof o.script === 'string' ? o.script : SAMPLE_SCRIPT)
  project.fps = clamp(Number(o.fps) || 30, 8, 60)
  project.width = clamp(Number(o.width) || 1280, 320, 3840)
  project.height = clamp(Number(o.height) || 720, 180, 2160)
  project.background = parseColor(String(o.background ?? ''), project.background)
  project.wallpaper = String(o.wallpaper ?? '')
  project.padding = parseUnit(String(o.padding ?? ''), 0, 0, 30)
  project.radius = parseUnit(String(o.radius ?? ''), 0, 0, 64)
  project.shadow = parseUnit(String(o.shadow ?? ''), 0, 0, 64)
  if (Array.isArray(o.clips)) {
    project.clips = o.clips
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null
        const c = item as Record<string, unknown>
        const kind = CLIP_KINDS.has(c.kind as ClipKind) ? (c.kind as ClipKind) : 'scene'
        return clipFrom(
          kind,
          {
            dur: String(c.duration ?? ''),
            at: String(c.start ?? ''),
            bg: String(c.bg ?? ''),
            ink: String(c.ink ?? ''),
            src: String(c.src ?? ''),
            fit: String(c.fit ?? ''),
            trans: String(c.trans ?? ''),
            cx: String(c.cx ?? ''),
            cy: String(c.cy ?? ''),
            depth: String(c.depth ?? ''),
            x: String(c.x ?? ''),
            y: String(c.y ?? ''),
            x2: String(c.x2 ?? ''),
            y2: String(c.y2 ?? ''),
            w: String(c.w ?? ''),
            h: String(c.h ?? ''),
            size: String(c.size ?? ''),
            amount: String(c.amount ?? ''),
            speed: String(c.speed ?? ''),
            click: String(c.click ?? ''),
            color: String(c.color ?? ''),
            anim: String(c.anim ?? ''),
            shape: String(c.shape ?? ''),
            crop: Array.isArray(c.crop) ? c.crop.join(',') : '',
            in: String(c.sourceIn ?? ''),
            volume: String(c.volume ?? ''),
          },
          String(c.text ?? ''),
          Math.max(0, Number(c.start) || 0),
          String(c.id ?? uid('c', index + 1)),
        )
      })
      .filter((item): item is Clip => item != null)
  }
  if (!project.clips.length) {
    const result = compileSafe(project.script)
    return result.ok ? result.project : project
  }
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

export function cameraAt(project: Project, time: number): Camera {
  let cam: Camera = { scale: 1, cx: 0.5, cy: 0.5 }
  const zooms = project.clips.filter((clip) => clip.kind === 'zoom').sort((a, b) => a.start - b.start)
  for (const zoom of zooms) {
    if (time < zoom.start) break
    const t = easeInOut((time - zoom.start) / Math.max(0.001, zoom.duration))
    const target = { scale: zoom.depth, cx: zoom.cx, cy: zoom.cy }
    cam = {
      scale: cam.scale + (target.scale - cam.scale) * t,
      cx: cam.cx + (target.cx - cam.cx) * t,
      cy: cam.cy + (target.cy - cam.cy) * t,
    }
    if (time < clipEnd(zoom)) break
  }
  return cam
}

export function clipAlpha(clip: Clip, time: number) {
  if (clip.trans === 'cut') return 1
  const local = time - clip.start
  const edge = Math.min(0.32, clip.duration / 3)
  const inn = clamp(local / edge, 0, 1)
  const out = clamp((clip.duration - local) / edge, 0, 1)
  return Math.min(inn, out)
}

export function clipShift(clip: Clip, time: number) {
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
  if (clip.anim === 'pulse') {
    return { opacity: 1, scale: 1 + Math.sin(progress * Math.PI) * 0.06, translateX: 0, translateY: 0, reveal: 1 }
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
    click: Math.sin(clickProgress * Math.PI * 0.5),
  }
}
