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
}

export const DEFAULT_AD_COMPONENT_SOURCE = `
export default function BiuAd({time, fps, width, height, interpolate, spring, AbsoluteFill}) {
  const scenes = [
    {eyebrow: "BIU VIDEO", title: ["一块内容", "也能是一支片"], note: "在页面里直接播放、修改、继续创作", accent: "#8B5CF6"},
    {eyebrow: "01 / DESCRIBE", title: ["写下结构", "Agent 编排节奏"], note: "\\x3Ctimeline>  \\x3Ctrack>  \\x3Ccomponent>", accent: "#38BDF8"},
    {eyebrow: "02 / TYPE", title: ["文字不是出现", "是登场"], note: "逐字、逐词、逐行，都跟着帧走", accent: "#F472B6"},
    {eyebrow: "03 / TRANSITION", title: ["切换画面", "不必打断情绪"], note: "遮罩推进 · 双画面交叠 · 连续运动", accent: "#FACC15"},
    {eyebrow: "04 / FOCUS", title: ["镜头跟着", "重点走"], note: "缩放、光标与标注，让视线有方向", accent: "#34D399"},
    {eyebrow: "05 / REACT", title: ["不够表达？", "直接写组件"], note: "frame + spring + interpolate + AbsoluteFill", accent: "#FB7185"},
    {eyebrow: "06 / SYNC", title: ["脚本、时间轴、播放", "始终同步"], note: "改完一行，下一帧就能看到", accent: "#60A5FA"},
    {eyebrow: "BIU", title: ["从想法", "到成片。"], note: "Agent 负责编排，你保留最终决定", accent: "#A78BFA"}
  ];
  const sceneDuration = 7;
  const index = Math.min(scenes.length - 1, Math.floor(time / sceneDuration));
  const scene = scenes[index];
  const local = time - index * sceneDuration;
  const enter = spring({frame: local * fps, fps, durationInFrames: 24, config: {stiffness: 180, damping: 22}});
  const leave = interpolate(local, [5.75, 6.75], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const reveal = enter * leave;
  const wipe = interpolate(local, [6.15, 6.95], [110, -10], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const drift = interpolate(local, [0, 7], [-28, 28], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const k = width / 1920;
  const chars = scene.title.join("").split("");
  const glyphs = chars.map(function(char, i) {
    const lineBreak = i === scene.title[0].length;
    const p = spring({frame: local*fps-i*1.35, fps, durationInFrames:20, config:{stiffness:210,damping:24}});
    const y = (1-p)*110*k;
    return React.createElement("span", {
      key:i,
      style:{display:"inline-block", whiteSpace:"pre", opacity:p*leave, transform:"translateY("+y+"px) rotate("+(1-p)*3+"deg)", color:lineBreak ? scene.accent : "#F7F5F2"}
    }, lineBreak ? [React.createElement("br", {key:"br"}), char] : char);
  });
  return (
    <AbsoluteFill style={{background:"#191919", color:"#F7F5F2", overflow:"hidden", fontFamily:"Inter, ui-sans-serif, system-ui"}}>
      <div style={{position:"absolute", inset:0, opacity:.16, backgroundImage:"linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize:(80*k)+"px "+(80*k)+"px", transform:"translateX("+drift*k+"px)"}} />
      <div style={{position:"absolute", width:900*k, height:900*k, right:-250*k, top:-420*k, borderRadius:"50%", background:scene.accent, opacity:.12, filter:"blur("+(120*k)+"px)", transform:"scale("+(0.86+enter*.14)+")"}} />
      <div style={{position:"absolute", left:120*k, right:120*k, top:78*k, display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:18*k, letterSpacing:4*k, color:"rgba(247,245,242,.55)"}}>
        <span>{scene.eyebrow}</span><span>{String(index+1).padStart(2,"0")} / {String(scenes.length).padStart(2,"0")}</span>
      </div>
      <div style={{position:"absolute", left:120*k, top:132*k, height:4*k, width:(120+enter*220)*k, background:scene.accent}} />
      <div style={{position:"absolute", left:120*k, right:120*k, top:"50%", transform:"translateY(-52%)"}}>
        <div style={{display:"flex", flexWrap:"wrap", maxWidth:1550*k, fontSize:126*k, lineHeight:.98, fontWeight:780, letterSpacing:-7*k}}>
          {glyphs}
        </div>
        <div style={{marginTop:48*k, display:"flex", alignItems:"center", gap:18*k, fontSize:25*k, letterSpacing:.5*k, color:"rgba(247,245,242,.64)", opacity:interpolate(local,[.7,1.3],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})*leave, transform:"translateY("+(1-reveal)*18*k+"px)"}}>
          <span style={{width:9*k, height:9*k, borderRadius:"50%", background:scene.accent}} />{scene.note}
        </div>
      </div>
      <div style={{position:"absolute", left:120*k, right:120*k, bottom:70*k, height:2*k, background:"rgba(255,255,255,.12)"}}>
        <div style={{height:"100%", width:((index+Math.min(1,local/sceneDuration))/scenes.length*100)+"%", background:scene.accent}} />
      </div>
      <div style={{position:"absolute", inset:"0 0 0 "+wipe+"%", background:scene.accent, transform:"skewX(-7deg) scaleX(1.08)", transformOrigin:"left"}} />
    </AbsoluteFill>
  );
}
`

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
  out = out.replace(/export\s+default\s+function\s+([A-Za-z_][\w]*)/g, 'function $1')
  out = out.replace(/export\s+default\s+class\s+([A-Za-z_][\w]*)/g, 'class $1')
  out = out.replace(/export\s+default\s+/g, 'const __Component = ')
  if (!/\bconst __Component\b/.test(out)) {
    const named = out.match(/function\s+([A-Za-z_][\w]*)\s*\(/)
    if (named) out += `\nconst __Component = ${named[1]};`
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
