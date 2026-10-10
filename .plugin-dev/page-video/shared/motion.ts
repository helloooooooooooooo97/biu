export type AtomName = 'fade' | 'move' | 'scale' | 'rotate' | 'blur' | 'wipe' | 'clip' | 'flash' | 'glitch'

export type Atom = { name: AtomName; params: Record<string, string> }
export type MotionStep = { atoms: Atom[] }
export type MotionProgram = { src: string; steps: MotionStep[] }

export type MotionPose = {
  opacity: number
  x: number
  y: number
  xPct: number
  yPct: number
  scale: number
  rotateX: number
  rotateY: number
  rotateZ: number
  blur: number
  clipPath?: string
  flash?: number
  glitch: number
}

export const MOTION_REST: MotionPose = {
  opacity: 1,
  x: 0,
  y: 0,
  xPct: 0,
  yPct: 0,
  scale: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  blur: 0,
  flash: 0,
  glitch: 0,
}

export const MOTION_ALIASES: Record<string, string> = {
  fadeUp: 'fade+move(y:+24)',
  fadeDown: 'fade+move(y:-24)',
  slideIn: 'move(x:-40)+fade',
  pop: 'scale(0.8→1)',
  typewriter: 'clip(shape:sweep-x)',
  blurIn: 'blur(24→0)+fade',
  scaleIn: 'scale(0.8→1)',
}

const ATOMS = new Set<AtomName>(['fade', 'move', 'scale', 'rotate', 'blur', 'wipe', 'clip', 'flash', 'glitch'])

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function easeMotion(name: string | undefined, t: number) {
  const x = clamp(t, 0, 1)
  const n = String(name ?? 'easeOut').trim()
  if (n === 'linear') return x
  if (n === 'easeIn' || n === 'ease-in' || n === 'in') return x * x
  if (n === 'easeOut' || n === 'ease-out' || n === 'out') return 1 - (1 - x) * (1 - x)
  if (n === 'easeInOut' || n === 'ease-inOut' || n === 'inOut') return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
  if (n === 'circIn') return 1 - Math.sqrt(1 - x * x)
  if (n === 'circOut') return Math.sqrt(1 - (x - 1) * (x - 1))
  if (n === 'circInOut') return x < 0.5 ? (1 - Math.sqrt(1 - 2 * x * x)) / 2 : (Math.sqrt(1 - (-2 * x + 2) ** 2) + 1) / 2
  if (n === 'backIn') return 2.7 * x * x * x - 1.7 * x * x
  if (n === 'backOut') return 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2
  if (n === 'backInOut') return x < 0.5 ? (Math.pow(2 * x, 2) * (3.6 * 2 * x - 2.6)) / 2 : (Math.pow(2 * x - 2, 2) * (3.6 * (2 * x - 2) + 2.6) + 2) / 2
  if (n === 'anticipate') return x * x * (4 * x - 3)
  const spring = n.match(/^spring\(([^,]+),([^)]+)\)$/)
  if (spring) {
    const stiff = Number(spring[1]) || 200
    const damp = Number(spring[2]) || 20
    return 1 - Math.exp((-damp / 12) * x) * Math.cos(x * Math.sqrt(stiff))
  }
  const cubic = n.match(/^cubic\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/)
  if (cubic) {
    const y1 = Number(cubic[2])
    const y2 = Number(cubic[4])
    return 3 * (1 - x) * (1 - x) * x * y1 + 3 * (1 - x) * x * x * y2 + x * x * x
  }
  return 1 - (1 - x) * (1 - x)
}

function unwrapParens(src: string) {
  let out = src.trim()
  while (out.startsWith('(') && out.endsWith(')')) {
    let depth = 0
    let wrapped = true
    for (let i = 0; i < out.length; i++) {
      if (out[i] === '(') depth += 1
      if (out[i] === ')') depth -= 1
      if (depth === 0 && i < out.length - 1) {
        wrapped = false
        break
      }
    }
    if (!wrapped || depth !== 0) break
    out = out.slice(1, -1).trim()
  }
  return out
}

function expandAliases(src: string, depth = 0): string {
  let out = src.trim()
  if (!out || depth > 6) return out
  for (const [name, body] of Object.entries(MOTION_ALIASES)) {
    if (out === name) return expandAliases(body, depth + 1)
    const re = new RegExp(`(^|[+;])${name}(?![A-Za-z(])`, 'g')
    out = out.replace(re, (_, prefix: string) => `${prefix}(${body})`)
  }
  return unwrapParens(out)
}

function splitTop(src: string, sep: string) {
  const out: string[] = []
  let buf = ''
  let depth = 0
  for (const ch of src) {
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function parseParams(raw: string) {
  const params: Record<string, string> = {}
  if (!raw.trim()) return params
  for (const part of splitTop(raw, ',')) {
    const colon = part.indexOf(':')
    if (colon === -1) {
      if (!params.value) params.value = part.trim()
      continue
    }
    params[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
  }
  return params
}

function parseAtom(token: string): Atom | null {
  const m = token.trim().match(/^([A-Za-z]+)(?:\((.*)\))?$/)
  if (!m) return null
  let name = m[1]!
  if (name === 'fadeUp' || name === 'fadeDown' || name === 'slideIn' || name === 'pop' || name === 'typewriter' || name === 'blurIn' || name === 'scaleIn') {
    return null
  }
  if (!ATOMS.has(name as AtomName)) return null
  return { name: name as AtomName, params: parseParams(m[2] ?? '') }
}

export function parseMotion(raw: string | undefined): MotionProgram {
  const src = expandAliases(String(raw ?? '').trim())
  if (!src) return { src: '', steps: [] }
  const steps: MotionStep[] = []
  for (const seq of splitTop(src, ';')) {
    const atoms: Atom[] = []
    for (const token of splitTop(unwrapParens(seq), '+')) {
      const expanded = expandAliases(token)
      const nestedPlus = splitTop(unwrapParens(expanded), '+')
      const nestedSeq = splitTop(expanded, ';')
      if (nestedSeq.length > 1 || nestedPlus.length > 1) {
        const nested = parseMotion(expanded)
        for (const step of nested.steps) atoms.push(...step.atoms)
        continue
      }
      const atom = parseAtom(unwrapParens(expanded))
      if (atom) atoms.push(atom)
    }
    if (atoms.length) steps.push({ atoms })
  }
  return { src, steps }
}

function num(raw: string | undefined, fallback: number) {
  if (raw == null || raw === '') return fallback
  const m = String(raw).trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%?)$/)
  if (!m) return fallback
  return Number(m[1])
}

function isPct(raw: string | undefined) {
  return String(raw ?? '').includes('%')
}

function range(raw: string | undefined, from: number, to: number, t: number) {
  if (!raw) return from + (to - from) * t
  const parts = String(raw).split(/→|->/)
  if (parts.length < 2) return from + (to - from) * t
  const a = num(parts[0], from)
  const b = num(parts[1], to)
  return a + (b - a) * t
}

export function mixPose(a: MotionPose, b: MotionPose): MotionPose {
  return {
    opacity: a.opacity * b.opacity,
    x: a.x + b.x,
    y: a.y + b.y,
    xPct: a.xPct + b.xPct,
    yPct: a.yPct + b.yPct,
    scale: a.scale * b.scale,
    rotateX: a.rotateX + b.rotateX,
    rotateY: a.rotateY + b.rotateY,
    rotateZ: a.rotateZ + b.rotateZ,
    blur: Math.max(a.blur, b.blur),
    clipPath: b.clipPath ?? a.clipPath,
    flash: Math.max(a.flash ?? 0, b.flash ?? 0),
    glitch: Math.max(a.glitch, b.glitch),
  }
}

function atomPose(atom: Atom, t: number, mode: 'enter' | 'exit'): MotionPose {
  const p = { ...MOTION_REST }
  const u = mode === 'enter' ? 1 - t : t
  if (atom.name === 'fade') {
    p.opacity = range(atom.params.value ?? atom.params.to, 0, 1, t)
    if (atom.params.from != null || atom.params.to != null) {
      p.opacity = range(`${atom.params.from ?? 0}→${atom.params.to ?? 1}`, 0, 1, t)
    } else if (mode === 'exit') p.opacity = 1 - t
    else p.opacity = t
  }
  if (atom.name === 'move') {
    const xRaw = atom.params.x
    const yRaw = atom.params.y
    const arc = num(atom.params.arc, 0)
    const xAmt = num(xRaw, 0)
    const yAmt = num(yRaw, 0)
    const travel = mode === 'enter' ? 1 - t : t
    if (isPct(xRaw)) p.xPct = xAmt * travel
    else p.x = xAmt * travel
    if (isPct(yRaw)) p.yPct = yAmt * travel
    else p.y = yAmt * travel
    if (arc) p.y += Math.sin(t * Math.PI) * arc * 40
  }
  if (atom.name === 'scale') {
    p.scale = range(atom.params.value ?? `${atom.params.from ?? 0.8}→${atom.params.to ?? 1}`, 0.8, 1, t)
  }
  if (atom.name === 'rotate') {
    p.rotateZ = num(atom.params.z ?? atom.params.value, 0) * u
    p.rotateY = num(atom.params.y, 0) * u
    p.rotateX = num(atom.params.x, 0) * u
  }
  if (atom.name === 'blur') {
    p.blur = range(atom.params.value ?? `${atom.params.from ?? 24}→${atom.params.to ?? 0}`, 24, 0, t)
  }
  if (atom.name === 'wipe') {
    const dir = atom.params.dir ?? 'right'
    const shown = mode === 'enter' ? t : 1 - t
    const rest = (1 - shown) * 100
    if (dir === 'left') p.clipPath = `inset(0 0 0 ${rest}%)`
    else if (dir === 'up') p.clipPath = `inset(${rest}% 0 0 0)`
    else if (dir === 'down') p.clipPath = `inset(0 0 ${rest}% 0)`
    else p.clipPath = `inset(0 ${rest}% 0 0)`
  }
  if (atom.name === 'clip') {
    const shown = mode === 'enter' ? t : 1 - t
    const rest = (1 - shown) * 100
    const shape = atom.params.shape ?? 'sweep-x'
    if (shape === 'sweep-x') p.clipPath = `inset(0 ${rest}% 0 0)`
    else if (shape === 'circle') p.clipPath = `circle(${shown * 80}% at 50% 50%)`
    else p.clipPath = `inset(${rest / 2}% ${rest / 2}% ${rest / 2}% ${rest / 2}%)`
  }
  if (atom.name === 'flash') p.flash = (1 - Math.abs(t * 2 - 1)) * num(atom.params.amount, 1)
  if (atom.name === 'glitch') p.glitch = (1 - t) * num(atom.params.amount, 0.6)
  void u
  return p
}

export function sampleMotion(program: MotionProgram, t: number, mode: 'enter' | 'exit', ease?: string): MotionPose {
  if (!program.steps.length) return { ...MOTION_REST }
  const x = clamp(t, 0, 1)
  const n = program.steps.length
  const slot = Math.min(n - 1, Math.max(0, Math.floor(x * n - 1e-9)))
  const local = n === 1 ? x : clamp(x * n - slot, 0, 1)
  const eased = easeMotion(ease, local)
  let pose = { ...MOTION_REST }
  for (const atom of program.steps[slot]!.atoms) pose = mixPose(pose, atomPose(atom, eased, mode))
  return pose
}

export function motionCss(pose: MotionPose): Record<string, string | number | undefined> {
  const tx = pose.x + (pose.glitch ? Math.sin(pose.glitch * 40) * 6 * pose.glitch : 0)
  return {
    opacity: pose.opacity,
    transform: `translate(${tx}px, ${pose.y}px) translate(${pose.xPct}%, ${pose.yPct}%) scale(${pose.scale}) rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg)`,
    filter: pose.blur > 0.2 ? `blur(${pose.blur}px)` : pose.flash ? `brightness(${1 + pose.flash})` : undefined,
    clipPath: pose.clipPath,
  }
}

export const EMPTY_MOTION: MotionProgram = { src: '', steps: [] }
