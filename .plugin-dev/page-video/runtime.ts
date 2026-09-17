import { transform } from 'sucrase'
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

function toComponentScript(src: string) {
  const prepared = hoistDefaultExport(stripReactImports(src.trim()))
  if (/\bimport\s*\(/m.test(prepared) || /\brequire\s*\(/m.test(prepared) || /^\s*import\b/m.test(prepared)) {
    throw new Error('component cannot import or require modules')
  }
  try {
    return transform(prepared, {
      transforms: ['jsx', 'typescript'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'component.tsx',
    }).code
  } catch (err) {
    throw new Error(err instanceof Error ? `JSX compile failed: ${err.message}` : 'JSX compile failed')
  }
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
  const body = toComponentScript(trimmed)
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
