export type ClipKind = 'title' | 'scene' | 'caption' | 'media'

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
}

export type Project = {
  fps: number
  width: number
  height: number
  script: string
  clips: Clip[]
}

export const SAMPLE_SCRIPT = `<video fps=30 size=1280x720>
  <title dur=2.4s bg=#111111 ink=#f6f2ea trans=fade>Biu</title>
  <scene dur=3.2s bg=#1a1a2e ink=#ece7dc>Compose with tags, not prose.</scene>
  <caption at=3.0s dur=2.0s>structured · timeline</caption>
  <media src=demo.mp4 dur=2.8s fit=cover />
</video>
`

const CLIP_KINDS = new Set<ClipKind>(['title', 'scene', 'caption', 'media'])
const TRANS: Transition[] = ['cut', 'fade', 'slide']

export function emptyProject(script = SAMPLE_SCRIPT): Project {
  return { fps: 30, width: 1280, height: 720, script, clips: [] }
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
  const m = String(raw).trim().match(/^([+-]?\d+(?:\.\d+)?)(s|ms)?$/i)
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
    const duration = Math.max(0.2, parseTime(attrs.dur ?? attrs.duration, kind === 'caption' ? 2 : 3))
    const explicit = attrs.at ?? attrs.start
    const start = explicit != null && explicit !== '' ? Math.max(0, parseTime(explicit, cursor)) : cursor
    clipIndex += 1
    const clip: Clip = {
      id: uid('c', clipIndex),
      kind,
      start,
      duration,
      text,
      bg: parseColor(attrs.bg, kind === 'title' ? '#111111' : '#191919'),
      ink: parseColor(attrs.ink, '#f6f2ea'),
      src: String(attrs.src ?? '').trim(),
      fit: parseFit(attrs.fit),
      trans: parseTrans(attrs.trans),
    }
    if (kind === 'media' && !clip.src) throw new ScriptError('media', '<media> needs src')
    project.clips.push(clip)
    if (kind !== 'caption') cursor = Math.max(cursor, clipEnd(clip))
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
  const lines = [`<video fps=${project.fps} size=${project.width}x${project.height}>`]
  let cursor = 0
  for (const clip of project.clips) {
    const needAt = clip.kind === 'caption' || Math.abs(clip.start - cursor) > 0.001
    const common =
      attr('dur', fmtTime(clip.duration)) +
      (needAt ? attr('at', fmtTime(clip.start)) : '') +
      attr('bg', clip.bg) +
      attr('ink', clip.ink) +
      attr('trans', clip.trans, 'cut') +
      attr('src', clip.src) +
      attr('fit', clip.fit, 'cover')
    if (clip.kind === 'media') {
      lines.push(`  <media${common} />`)
    } else {
      lines.push(`  <${clip.kind}${common}>${escapeText(clip.text)}</${clip.kind}>`)
    }
    if (clip.kind !== 'caption') cursor = Math.max(cursor, clipEnd(clip))
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
  if (Array.isArray(o.clips)) {
    project.clips = o.clips
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null
        const c = item as Record<string, unknown>
        const kind = CLIP_KINDS.has(c.kind as ClipKind) ? (c.kind as ClipKind) : 'scene'
        return {
          id: String(c.id ?? uid('c', index + 1)),
          kind,
          start: Math.max(0, Number(c.start) || 0),
          duration: Math.max(0.2, Number(c.duration) || 3),
          text: String(c.text ?? ''),
          bg: parseColor(String(c.bg ?? ''), '#191919'),
          ink: parseColor(String(c.ink ?? ''), '#f6f2ea'),
          src: String(c.src ?? ''),
          fit: parseFit(String(c.fit ?? '')),
          trans: parseTrans(String(c.trans ?? '')),
        } satisfies Clip
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
