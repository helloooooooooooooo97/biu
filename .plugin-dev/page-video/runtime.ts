import { easeMotion } from './motion.ts'

export type FrameProps = {
  frame: number
  time: number
  progress: number
  durationInFrames: number
  fps: number
  width: number
  height: number
  interpolate: typeof interpolate
  spring: typeof spring
  AbsoluteFill: (props?: Record<string, unknown>) => unknown
  id?: string
  content?: string
  description?: string
  color?: string
  background?: string
  variant?: string
  textMotion?: string
}

export const ABSOLUTE_FILL_STYLE: Record<string, string | number> = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}

export function makeAbsoluteFill(createElement: (type: string, props: unknown, ...children: unknown[]) => unknown) {
  return function AbsoluteFill(props: Record<string, unknown> = {}) {
    const { children, style, ...rest } = props
    return createElement(
      'div',
      { ...rest, 'data-pv-fill': '', style: { ...ABSOLUTE_FILL_STYLE, ...(style && typeof style === 'object' ? style : {}) } },
      children,
    )
  }
}

export type Extrapolate = 'extend' | 'clamp' | 'identity'

export function interpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: { extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate; easing?: (t: number) => number },
) {
  if (inputRange.length < 2 || inputRange.length !== outputRange.length) {
    throw new Error('interpolate() needs matching inputRange and outputRange')
  }
  const left = options?.extrapolateLeft ?? 'extend'
  const right = options?.extrapolateRight ?? 'extend'
  const easing = options?.easing
  if (input <= inputRange[0]!) {
    if (left === 'identity') return input
    if (left === 'clamp') return outputRange[0]!
  }
  if (input >= inputRange[inputRange.length - 1]!) {
    if (right === 'identity') return input
    if (right === 'clamp') return outputRange[outputRange.length - 1]!
  }
  let i = 0
  while (i < inputRange.length - 2 && input > inputRange[i + 1]!) i += 1
  const a = inputRange[i]!
  const b = inputRange[i + 1]!
  const span = b - a || 1
  let t = (input - a) / span
  t = easing ? easing(t) : t
  return outputRange[i]! + (outputRange[i + 1]! - outputRange[i]!) * t
}

export function spring(opts: {
  frame: number
  fps: number
  from?: number
  to?: number
  config?: { stiffness?: number; damping?: number; mass?: number }
  durationInFrames?: number
}) {
  const from = opts.from ?? 0
  const to = opts.to ?? 1
  const fps = Math.max(1, opts.fps)
  const duration = Math.max(1, opts.durationInFrames ?? Math.round(fps * 0.8))
  const t = Math.min(1, Math.max(0, opts.frame / duration))
  const stiffness = opts.config?.stiffness ?? 200
  const damping = opts.config?.damping ?? 20
  const eased = easeMotion(`spring(${stiffness},${damping})`, t)
  return from + (to - from) * eased
}

function stripReactImports(src: string) {
  return src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\{[^}]*AbsoluteFill[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/gim, '')
}

function hoistDefaultExport(src: string) {
  let out = src
  let defaultName = ''
  out = out.replace(/export\s+default\s+function\s+([A-Za-z_][\w]*)/g, (_match, name: string) => {
    defaultName = name
    return `function ${name}`
  })
  out = out.replace(/export\s+default\s+class\s+([A-Za-z_][\w]*)/g, (_match, name: string) => {
    defaultName = name
    return `class ${name}`
  })
  out = out.replace(/export\s+default\s+/g, 'const __Component = ')
  if (!/\bconst __Component\b/.test(out)) {
    const named = defaultName || out.match(/function\s+([A-Za-z_][\w]*)\s*\(/)?.[1]
    if (named) out += `\nconst __Component = ${named};`
  }
  return out
}

function transformJsx(src: string) {
  if (!src.includes('<')) return src
  let i = 0
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch)

  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i]!)) i += 1
  }

  const parseJsx = (): string => {
    if (src[i] !== '<') throw new Error(`expected JSX at ${i}`)
    i += 1
    skipWs()
    if (src.startsWith('>', i) || src.startsWith('/>', i)) {
      const tag = 'React.Fragment'
      if (src.startsWith('/>', i)) {
        i += 2
        return `React.createElement(${tag})`
      }
      i += 1
      const kids = parseChildren('fragment')
      return kids.length ? `React.createElement(${tag}, null, ${kids.join(', ')})` : `React.createElement(${tag})`
    }
    let name = ''
    while (i < src.length && isIdent(src[i]!)) {
      name += src[i]
      i += 1
    }
    if (src[i] === '.') {
      name += src[i]
      i += 1
      while (i < src.length && isIdent(src[i]!)) {
        name += src[i]
        i += 1
      }
    }
    const tag = /^[A-Z]/.test(name) || name.includes('.') ? name : JSON.stringify(name)
    const props: string[] = []
    while (true) {
      skipWs()
      if (src.startsWith('/>', i)) {
        i += 2
        return props.length ? `React.createElement(${tag}, { ${props.join(', ')} })` : `React.createElement(${tag})`
      }
      if (src[i] === '>') {
        i += 1
        const kids = parseChildren(name)
        const propsArg = props.length ? `{ ${props.join(', ')} }` : 'null'
        return kids.length ? `React.createElement(${tag}, ${propsArg}, ${kids.join(', ')})` : `React.createElement(${tag}, ${propsArg})`
      }
      if (src.startsWith('{...', i)) {
        i += 4
        const expr = parseExpr()
        if (src[i] === '}') i += 1
        props.push(`...(${expr})`)
        continue
      }
      let key = ''
      while (i < src.length && isIdent(src[i]!)) {
        key += src[i]
        i += 1
      }
      if (!key) throw new Error(`bad JSX prop at ${i}`)
      skipWs()
      if (src[i] === '=') {
        i += 1
        skipWs()
        if (src[i] === '"') {
          const q = readString('"')
          props.push(`${JSON.stringify(key)}: ${JSON.stringify(q)}`)
        } else if (src[i] === "'") {
          const q = readString("'")
          props.push(`${JSON.stringify(key)}: ${JSON.stringify(q)}`)
        } else if (src[i] === '{') {
          i += 1
          const expr = parseExpr()
          if (src[i] === '}') i += 1
          props.push(`${JSON.stringify(key)}: (${expr})`)
        } else {
          throw new Error(`bad JSX value at ${i}`)
        }
      } else {
        props.push(`${JSON.stringify(key)}: true`)
      }
    }
  }

  const parseChildren = (close: string) => {
    const kids: string[] = []
    while (i < src.length) {
      if (src.startsWith('</', i)) {
        i += 2
        skipWs()
        if (close === 'fragment') {
          if (src[i] === '>') i += 1
          else {
            while (i < src.length && src[i] !== '>') i += 1
            i += 1
          }
          return kids
        }
        let name = ''
        while (i < src.length && (isIdent(src[i]!) || src[i] === '.')) {
          name += src[i]
          i += 1
        }
        skipWs()
        if (src[i] === '>') i += 1
        if (name && name !== close) throw new Error(`mismatched </${name}>`)
        return kids
      }
      if (src[i] === '{') {
        i += 1
        const expr = parseExpr()
        if (src[i] === '}') i += 1
        kids.push(`(${expr})`)
        continue
      }
      if (src[i] === '<') {
        kids.push(parseJsx())
        continue
      }
      let text = ''
      while (i < src.length && src[i] !== '<' && src[i] !== '{') {
        text += src[i]
        i += 1
      }
      if (text.trim()) kids.push(JSON.stringify(text.replace(/\s+/g, ' ').trim()))
    }
    return kids
  }

  const readString = (quote: string) => {
    i += 1
    let out = ''
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        out += src[i]! + (src[i + 1] ?? '')
        i += 2
        continue
      }
      out += src[i]
      i += 1
    }
    i += 1
    return out
  }

  const parseExpr = () => {
    let depth = 1
    let start = i
    while (i < src.length && depth > 0) {
      const ch = src[i]!
      if (ch === '"' || ch === "'") {
        readString(ch)
        continue
      }
      if (ch === '`') {
        i += 1
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') i += 2
          else i += 1
        }
        i += 1
        continue
      }
      if (ch === '{') depth += 1
      if (ch === '}') {
        depth -= 1
        if (depth === 0) break
      }
      i += 1
    }
    return src.slice(start, i)
  }

  let out = ''
  let cursor = 0
  const looksLikeJsx = (at: number) => {
    const rest = src.slice(at)
    return /^<(?:[A-Za-z/!?]|[>]|\/)/.test(rest) && !/^<=/.test(rest)
  }
  while (cursor < src.length) {
    const lt = src.indexOf('<', cursor)
    if (lt < 0) {
      out += src.slice(cursor)
      break
    }
    out += src.slice(cursor, lt)
    const prev = src[lt - 1]
    if (prev && /[A-Za-z0-9_)\]"'`]/.test(prev) && !looksLikeJsx(lt)) {
      out += '<'
      cursor = lt + 1
      continue
    }
    if (!looksLikeJsx(lt)) {
      out += '<'
      cursor = lt + 1
      continue
    }
    i = lt
    try {
      out += parseJsx()
      cursor = i
    } catch {
      out += '<'
      cursor = lt + 1
    }
  }
  return out
}

export function compileComponentSource(
  source: string,
  React: { createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown },
): (props: FrameProps) => unknown {
  const trimmed = source.trim()
  if (!trimmed) throw new Error('empty component source')
  if (/\bimport\s*\(/m.test(trimmed) || /\brequire\s*\(/m.test(trimmed)) {
    throw new Error('component cannot import or require modules')
  }
  const prepared = hoistDefaultExport(stripReactImports(trimmed))
  const body = transformJsx(prepared)
  const AbsoluteFill = makeAbsoluteFill(React.createElement as (type: string, props: unknown, ...children: unknown[]) => unknown)
  const factory = new Function(
    'React',
    'interpolate',
    'spring',
    'AbsoluteFill',
    `"use strict";
     const exports = {};
     const module = { exports };
     ${body}
     const resolved = (typeof __Component === "function" && __Component)
       || (typeof exports.default === "function" && exports.default)
       || (typeof module.exports === "function" && module.exports)
       || (module.exports && typeof module.exports.default === "function" && module.exports.default);
     if (typeof resolved !== "function") throw new Error("component source must export a function");
     return resolved;`,
  ) as (
    React: unknown,
    interpolate: typeof interpolate,
    spring: typeof spring,
    AbsoluteFill: FrameProps['AbsoluteFill'],
  ) => (props: FrameProps) => unknown
  return factory(React, interpolate, spring, AbsoluteFill)
}
