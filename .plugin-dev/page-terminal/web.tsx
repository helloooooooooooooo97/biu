import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { makeOverlay, relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useLayoutEffect, useRef } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const DEFAULTS = { title: '终端', height: 240 }

// 历史记录：写进块数据里，agent 直接读页面 markdown 就能看到用户跑过什么。
const HISTORY_MAX = 200      // 最多保留的命令条数
const HISTORY_OUT_LINES = 10 // 每条命令最多保留的输出行数
const HISTORY_OUT_CHARS = 600 // 单条输出字符上限，防止撑爆 markdown
const OUTPUT_SETTLE_MS = 600 // 输出安静这么久，就认为这条命令跑完了

type HistoryEntry = { cmd: string; at: number; out?: string }

function historyOut(item: Record<string, unknown>): string {
  const raw = item.out ?? item.output ?? item.stdout
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.map((line) => String(line)).join('\n')
  return ''
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const out = historyOut(item)
      return {
        cmd: String(item.cmd ?? item.command ?? ''),
        at: Number(item.at) || 0,
        ...(out ? { out } : {}),
      }
    })
    .filter((item) => item.cmd)
}

// ---------------------------------------------------------------------------
// xterm 附带的「辅助节点」处理（踩坑总结，改动前务必读 README）：
//  1. helper-textarea 是 xterm 接收键盘输入的节点，**不能 display:none**
//     —— 隐藏元素无法聚焦，会导致整个终端打不了字。
//  2. .xterm-helpers 里住着字符测量元素，**不能整块压掉**，
//     否则它量不出字符宽度 → 字间距错乱、光标消失。
//  3. 字符测量元素会因祖先 transform/backdrop-filter 改变包含块而显形，
//     表现为"顶部多出一行会自己变的乱码"。用 opacity:0 藏，不要 clip-path：
//     Chrome 里 clip-path:inset(100%) 会让 getBoundingClientRect 宽高为 0，
//     字格宽度变成 0，提示符和输出全叠在最左边（历史记录仍能记到按键）。
// ---------------------------------------------------------------------------
const HELPER_TEXTAREA = '.xterm-helper-textarea'
const MEASURE_SELECTORS = ['.xterm-char-measure-element', '.xterm-width-cache-measure-container'].join(',')
const BURIED_SELECTORS = [
  '.xterm-accessibility',
  '.xterm-accessibility-tree',
  '.xterm-message',
  '.live-region',
  '.composition-view',
].join(',')

function decodePtyChunk(data: unknown, onText: (text: string) => void) {
  if (typeof data === 'string') {
    onText(data)
    return
  }
  if (data instanceof ArrayBuffer) {
    onText(new TextDecoder().decode(data))
    return
  }
  if (ArrayBuffer.isView(data)) {
    onText(new TextDecoder().decode(data))
    return
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    void data.text().then(onText)
  }
}

function styleHelperTextarea(el: HTMLElement) {
  const s = el.style
  s.setProperty('position', 'absolute', 'important')
  s.setProperty('left', '-9999px', 'important')
  s.setProperty('top', '0', 'important')
  s.setProperty('width', '1px', 'important')
  s.setProperty('height', '1px', 'important')
  s.setProperty('opacity', '0', 'important')
  s.setProperty('color', 'transparent', 'important')
  s.setProperty('caret-color', 'transparent', 'important')
  s.setProperty('background', 'transparent', 'important')
  s.setProperty('border', '0', 'important')
  s.setProperty('padding', '0', 'important')
  s.setProperty('margin', '0', 'important')
  s.setProperty('overflow', 'hidden', 'important')
  s.setProperty('resize', 'none', 'important')
  s.setProperty('z-index', '-5', 'important')
  // 不要 display:none。
  s.removeProperty('display')
}

function fitToVisibleBox(term: Terminal, host: HTMLElement) {
  if (!term.element) return false
  const core = (term as unknown as {
    _core?: { _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } } } } }
  })._core
  const cell = core?._renderService?.dimensions?.css?.cell
  if (!cell?.width || !cell?.height) return false
  const box = host.getBoundingClientRect()
  const style = window.getComputedStyle(term.element)
  const padX = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
  const padY = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
  const cols = Math.max(2, Math.floor((box.width - padX) / cell.width))
  const rows = Math.max(1, Math.floor((box.height - padY) / cell.height))
  if (term.cols !== cols || term.rows !== rows) term.resize(cols, rows)
  return true
}

function attachScrollRail(term: Terminal, pane: HTMLElement) {
  const rail = document.createElement('div')
  rail.className = 'pt-scroll-rail'
  rail.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('div')
  thumb.className = 'pt-scroll-thumb'
  rail.appendChild(thumb)
  pane.appendChild(rail)

  // 右缘感应带。滑轨隐藏时 pointer-events:none，只有靠它才能把滑轨唤出来。
  const hotspot = document.createElement('div')
  hotspot.className = 'pt-rail-hotspot'
  hotspot.setAttribute('aria-hidden', 'true')
  pane.appendChild(hotspot)
  const onHotEnter = () => pane.classList.add('is-rail-hot')
  const onHotLeave = () => pane.classList.remove('is-rail-hot')
  hotspot.addEventListener('pointerenter', onHotEnter)
  hotspot.addEventListener('pointerleave', onHotLeave)

  const metrics = () => {
    const buf = term.buffer.active
    const rows = Math.max(1, term.rows)
    const total = Math.max(rows, buf.length)
    const maxY = Math.max(0, total - rows)
    const y = Math.min(maxY, Math.max(0, buf.viewportY))
    return { rows, total, maxY, y }
  }

  const sync = () => {
    const { rows, total, maxY, y } = metrics()
    const trackH = Math.max(1, rail.clientHeight)
    const thumbH = Math.max(28, Math.round((rows / total) * trackH))
    const travel = Math.max(0, trackH - thumbH)
    const top = maxY === 0 ? 0 : Math.round((y / maxY) * travel)
    thumb.style.height = `${thumbH}px`
    thumb.style.transform = `translateY(${top}px)`
    // 不满一屏：不显示滑块，也不让它吃指针事件。
    rail.classList.toggle('is-idle', maxY === 0)
    thumb.style.opacity = maxY === 0 ? '0' : '1'
  }

  // 滑动时淡入，停手 900ms 后淡出。拖拽中不淡出。
  let fadeTimer = 0
  const sleepNow = () => {
    if (fadeTimer) window.clearTimeout(fadeTimer)
    fadeTimer = 0
    if (!dragging && !hotspot.matches(':hover') && !rail.matches(':hover')) {
      rail.classList.remove('is-active')
    }
  }
  const wake = () => {
    rail.classList.add('is-active')
    if (fadeTimer) window.clearTimeout(fadeTimer)
    fadeTimer = window.setTimeout(sleepNow, 900)
  }
  // 鼠标移出滑轨时，如果已经过了活跃期就立刻收起来，不用等 900ms。
  rail.addEventListener('pointerleave', () => {
    if (!dragging && fadeTimer === 0) rail.classList.remove('is-active')
  })
  rail.addEventListener('pointerenter', () => {
    if (fadeTimer) window.clearTimeout(fadeTimer)
    fadeTimer = 0
    rail.classList.add('is-active')
  })

  let dragging = false
  let startY = 0
  let startViewport = 0

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const { maxY, y } = metrics()
    if (event.target !== thumb) {
      if (maxY === 0) return
      const rect = rail.getBoundingClientRect()
      const ratio = (event.clientY - rect.top) / Math.max(1, rect.height)
      term.scrollToLine(Math.round(ratio * maxY))
      return
    }
    dragging = true
    startY = event.clientY
    startViewport = y
    rail.classList.add('is-dragging')
    wake()
    thumb.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return
    wake()
    const { rows, total, maxY } = metrics()
    if (maxY === 0) return
    const trackH = Math.max(1, rail.clientHeight)
    const thumbH = Math.max(28, Math.round((rows / total) * trackH))
    const travel = Math.max(1, trackH - thumbH)
    const next = startViewport + ((event.clientY - startY) / travel) * maxY
    term.scrollToLine(Math.max(0, Math.min(maxY, Math.round(next))))
  }
  const onPointerUp = (event: PointerEvent) => {
    dragging = false
    rail.classList.remove('is-dragging')
    try {
      thumb.releasePointerCapture(event.pointerId)
    } catch {
      // 可能没捕获过。
    }
    wake()
  }
  // 滚轮绑在整个 pane 上，不只是那条 4px 宽的滑轨。
  // 背景：canvas 渲染下 .xterm-viewport 的原生滚动不可靠（实测 clientHeight
  // === scrollHeight，maxScroll 恒为 0），滚动必须走 xterm 的 scrollLines。
  // xterm 的 onWheel 只认 viewport 能滚的场景，这里自己接管。
  const onWheel = (event: WheelEvent) => {
    // 必须双向堵死，否则滚到头会把滚动"传染"给外层编辑器：
    // preventDefault 挡浏览器默认滚动，stopPropagation 挡冒泡到祖先监听。
    event.preventDefault()
    event.stopPropagation()
    const { maxY } = metrics()
    if (maxY === 0) return
    wake()
    const lines =
      event.deltaMode === 1
        ? Math.round(event.deltaY)
        : event.deltaMode === 2
          ? Math.round(event.deltaY) * term.rows
          : Math.round(event.deltaY / 18)
    const step = Math.max(1, Math.min(12, Math.abs(lines) || 1))
    term.scrollLines(step * (event.deltaY > 0 ? 1 : -1))
  }

  rail.addEventListener('pointerdown', onPointerDown)
  rail.addEventListener('pointermove', onPointerMove)
  rail.addEventListener('pointerup', onPointerUp)
  rail.addEventListener('pointercancel', onPointerUp)
  // capture 阶段抢在 xterm 自己的 wheel 处理之前，passive:false 才能 preventDefault。
  pane.addEventListener('wheel', onWheel, { passive: false, capture: true })

  // 只在事件到来时同步，不要开常驻 rAF：常驻循环会和 xterm 自己的刷新抢帧，
  // 还会在布局未落定时读 rail.clientHeight（读到 0，thumb 高度塌成最小值）。
  // scrollToLine / scrollLines 只改 buffer，不一定触发 viewport 原生 scroll 事件，
  // 所以要额外盯 onScroll，那是 buffer 层滚动位置变化时必发的。
  const subs = [
    term.onScroll(() => sync()),
    term.onRender(() => sync()),
    term.onResize(() => sync()),
  ]
  requestAnimationFrame(sync)

  return () => {
    if (fadeTimer) window.clearTimeout(fadeTimer)
    pane.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
    hotspot.removeEventListener('pointerenter', onHotEnter)
    hotspot.removeEventListener('pointerleave', onHotLeave)
    for (const sub of subs) sub.dispose()
    rail.remove()
    hotspot.remove()
  }
}

function buryAuxiliaryNodes(root: HTMLElement) {
  for (const node of root.querySelectorAll(MEASURE_SELECTORS)) {
    const s = (node as HTMLElement).style
    s.setProperty('opacity', '0', 'important')
    s.setProperty('pointer-events', 'none', 'important')
    s.removeProperty('display')
    s.removeProperty('clip-path')
  }
  for (const node of root.querySelectorAll(HELPER_TEXTAREA)) {
    styleHelperTextarea(node as HTMLElement)
  }
  for (const node of root.querySelectorAll(BURIED_SELECTORS)) {
    const el = node as HTMLElement
    if (el.style.display !== 'none') el.style.setProperty('display', 'none', 'important')
  }
}

const STYLE_ID = 'pt-xterm-style-v5'
const STYLE_CSS = `
.pt-card{
  display:flex;flex-direction:column;overflow:hidden;
  border:1px solid color-mix(in srgb, var(--dsw-border, rgba(242,241,237,0.12)) 80%, #000);
  border-radius:12px;background:#191919;
  box-shadow:0 1px 2px rgba(15,15,15,.08), 0 8px 24px rgba(0,0,0,.12);
}
.pt-head{
  display:flex;align-items:center;gap:8px;flex:none;height:34px;padding:0 10px 0 12px;
  border-bottom:1px solid rgba(255,255,255,.06);
  background:#141414;color:rgba(242,241,237,.5);
  font:12px/1 ui-sans-serif,system-ui,sans-serif;user-select:none;
}
.pt-title{color:rgba(242,241,237,.78);font-weight:600;letter-spacing:-.01em}
.pt-history{border-bottom:1px solid rgba(255,255,255,.06);background:#161616}
.pt-mount{position:absolute;inset:0;overflow:hidden;box-sizing:border-box;overscroll-behavior:contain}
.pt-mount .xterm{
  width:100%;height:100%;
  padding:9px 8px 5px 10px;
  overflow:hidden;box-sizing:border-box;
}
/* 兜底：下面这两块本来由 xterm.css 提供。esbuild 把 xterm.css 的注入包在
   if(!document.getElementById("store-css-<路径哈希>")) 里，只要 head 里残留过
   一个同 id 的空 <style>，整段 CSS 就再也不会注入 —— 实测表现为 .xterm 退化成
   position:static，.xterm-viewport 跟着变 static 被 .xterm-scroll-area 撑满，
   clientHeight === scrollHeight，滚动范围恒为 0：内容一多就"溢出但滑不动"。
   这里显式钉死，不依赖那段注入。pt-xterm-style-vN 每次覆盖，不会被残留标签挡住。 */
.pt-pane .xterm{
  position:relative !important;
}
.pt-pane .xterm .xterm-viewport{
  position:absolute !important;
  top:0 !important;right:0 !important;bottom:0 !important;left:0 !important;
  cursor:default;
}
.pt-pane .xterm-screen { background: transparent !important; }
.pt-pane canvas { background: transparent !important; }
.pt-pane .xterm-helper-textarea{
  position:absolute !important;top:0;left:-9999em;z-index:-5;
  width:0;height:0;margin:0 !important;padding:0 !important;
  overflow:hidden;resize:none;border:0 !important;outline:0 !important;
  opacity:0 !important;background:transparent !important;
}
.pt-pane .xterm-char-measure-element,
.pt-pane .xterm-width-cache-measure-container{
  position:absolute !important;top:0 !important;left:-9999em !important;
  visibility:hidden !important;opacity:0 !important;pointer-events:none !important;
}

/* xterm 的 canvas（.xterm-screen）盖在 viewport 上面，原生滚动条看不见。
   滚轮仍走 viewport；可见滑块用右侧自定义轨道，z-index 盖过 canvas。 */
.pt-pane .xterm-viewport {
  overflow-y: auto !important;
  background: transparent !important;
  scrollbar-width: none;
  /* 别把滚动链传给外层编辑器。 */
  overscroll-behavior: contain;
}
.pt-pane .xterm-viewport::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }

/* 覆盖式浮动滑块，仿 macOS：
   - 平时整条不可见（opacity:0），也不吃指针事件，不挡终端选区/点击
   - 滑动时淡入，停手 ~900ms 后淡出
   - 轨道容器始终可见性透明，只用来定位和接事件，不画背景槽
   注意：不要用 display:none 切换，否则 pointerdown 拖拽期间会丢事件、
   也会让 rail.clientHeight 变 0 导致 thumb 高度算错。 */
.pt-scroll-rail {
  position: absolute;
  top: 4px;
  right: 3px;
  bottom: 4px;
  width: 6px;
  z-index: 12;
  border-radius: 999px;
  background: transparent;
  opacity: 0;
  transition: opacity .18s ease-out;
  pointer-events: none;
  /* 自身滚动不要传染给页面 */
  overscroll-behavior: contain;
}
/* 滚动中 / 拖拽：淡入并接管指针事件。
   注意别写 .pt-scroll-rail:hover —— 隐藏时 pointer-events:none，hover 永不成立，
   那条规则是死代码。改用 pane 右侧的感应带来触发（见下）。 */
.pt-scroll-rail.is-active,
.pt-scroll-rail.is-dragging,
.pt-pane.is-rail-hot .pt-scroll-rail {
  opacity: 1;
  pointer-events: auto;
}
/* pane 右缘 16px 宽的透明感应带：鼠标靠近才让滑轨显形。 */
.pt-rail-hotspot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 16px;
  z-index: 11;
  pointer-events: auto;
}
/* 内容不满一屏：彻底不出现、不占事件（thumb 由 JS 隐藏）。 */
.pt-scroll-rail.is-idle {
  opacity: 0 !important;
  pointer-events: none !important;
}
.pt-scroll-thumb {
  position: absolute;
  left: 1px;
  width: 4px;
  border-radius: 999px;
  background: rgba(242,241,237,0.34);
  cursor: pointer;
  transition: background .12s ease-out;
}
.pt-scroll-rail:hover .pt-scroll-thumb {
  background: rgba(242,241,237,0.5);
}
.pt-scroll-rail.is-dragging .pt-scroll-thumb {
  background: rgba(242,241,237,0.72);
}

.pt-history-out {
  display: block !important;
  margin: 2px 0 0 !important;
  padding: 0 0 0 14px !important;
  border: 0 !important;
  background: transparent !important;
  color: rgba(242,241,237,0.48) !important;
  white-space: pre-wrap !important;
  word-break: break-all !important;
  font: inherit !important;
}
`

function useTerminalStyle() {
  useEffect(() => {
    // 每次用最新内容覆盖，不能"已存在就 return"，否则旧版本内容会一直挡着。
    const id = STYLE_ID
    for (const stale of document.querySelectorAll('style[id^="pt-xterm-style"]')) {
      if (stale.id !== id) stale.remove()
    }
    const existing = document.getElementById(id)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = id
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

const THEME = {
  background: 'rgba(0,0,0,0)',
  foreground: '#f0efed',
  cursor: '#f0efed',
  cursorAccent: '#191919',
  selectionBackground: 'rgba(242,241,237,0.22)',
  black: '#191919',
  red: '#e5484d',
  green: '#30a46c',
  yellow: '#ffb224',
  blue: '#5b9fd6',
  magenta: '#b07cd6',
  cyan: '#12a594',
  white: '#bcbab6',
  brightBlack: '#5f5f5a',
  brightRed: '#ff6369',
  brightGreen: '#4cc38a',
  brightYellow: '#ffc53d',
  brightBlue: '#78b4e4',
  brightMagenta: '#c496e4',
  brightCyan: '#3ddbd9',
  brightWhite: '#f0efed',
}

/** 单个终端面：一个块 = 一个 PTY。
   布局按 5456764d 的最终版：外层 contain:strict + 内层 inset:0；
   padding 打在 .xterm 上让 FitAddon 扣掉；未可见不 open。不要对缓冲区做 clear。 */
function TerminalSurface({
  height,
  history,
  onHistory,
  sessionKey,
  fill,
}: {
  height: number
  history: HistoryEntry[]
  onHistory: (next: HistoryEntry[]) => void
  /** 后端会话键：同一个块刷新/切页都能连回同一个 shell。 */
  sessionKey: string
  /** 放大时撑满容器，而不是固定高度。 */
  fill?: boolean
}) {
  useTerminalStyle()
  const pane = useRef<HTMLDivElement | null>(null)
  const mount = useRef<HTMLDivElement | null>(null)
  const instance = useRef<Terminal | null>(null)

  useLayoutEffect(() => {
    const paneEl = pane.current
    const element = mount.current
    if (!paneEl || !element) return

    let disposed = false
    let frame = 0
    let secondFrame = 0
    let term: Terminal | null = null
    let fit: FitAddon | null = null
    let socket: WebSocket | undefined
    let detachScroll = () => {}
    let buryObs: MutationObserver | undefined
    let dataSub: { dispose(): void } | undefined
    let resizeSub: { dispose(): void } | undefined
    let outTimer: number | undefined

    const historyRef = [...history]
    let pendingLine = ''
    let capturing = false
    let outBuffer = ''

    const stripAnsi = (text: string) =>
      text
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\x1b[()][0-9A-Za-z]/g, '')
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')

    const isPromptLike = (line: string) => {
      const text = line.trim()
      if (!text) return false
      if (/^[%\s]+$/.test(text)) return true
      if (/^\S*@\S*\s*[:~\/.]/.test(text)) return true
      if (/^\([^)]*\)\s*\S*@\S*/.test(text)) return true
      if (/[@~\/]/.test(text) && /[%$#]\s*$/.test(text)) return true
      return false
    }

    const flushHistory = () => {
      if (outTimer) {
        window.clearTimeout(outTimer)
        outTimer = undefined
      }
      if (!capturing) return
      capturing = false
      const clean = stripAnsi(outBuffer)
        .split('\n')
        .map((line) => line.replace(/\s+$/, ''))
        .filter((line) => !isPromptLike(line))
        .filter((line, index, all) => !(index === all.length - 1 && line === ''))
      outBuffer = ''
      if (clean.length === 0) return
      const out = clean.slice(0, HISTORY_OUT_LINES).join('\n').slice(0, HISTORY_OUT_CHARS)
      const last = historyRef[historyRef.length - 1]
      if (!last || last.out !== undefined) return
      last.out = out || undefined
      onHistory([...historyRef])
    }

    const recordOutput = (chunk: string) => {
      if (!capturing) return
      outBuffer += chunk
      if (outTimer) window.clearTimeout(outTimer)
      outTimer = window.setTimeout(flushHistory, OUTPUT_SETTLE_MS)
    }

    const recordInput = (data: string) => {
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          const cmd = pendingLine.trim()
          pendingLine = ''
          if (!cmd) continue
          historyRef.push({ cmd, at: Date.now() })
          if (historyRef.length > HISTORY_MAX) historyRef.splice(0, historyRef.length - HISTORY_MAX)
          onHistory([...historyRef])
          capturing = true
          outBuffer = ''
          continue
        }
        if (ch === '\x7f' || ch === '\b') {
          pendingLine = pendingLine.slice(0, -1)
          continue
        }
        if (ch === '\x03' || ch === '\x04' || ch === '\x1b') {
          pendingLine = ''
          continue
        }
        if (ch >= ' ') pendingLine += ch
      }
    }

    const isVisible = () => {
      if (disposed || !element.isConnected) return false
      const bounds = element.getBoundingClientRect()
      if (bounds.width < 20 || bounds.height < 20) return false
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden'
    }

    const send = (message: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }

    const openVisibleTerminal = () => {
      if (!isVisible()) return
      if (!term) {
        term = new Terminal({
          allowProposedApi: false,
          convertEol: false,
          fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.18,
          cursorBlink: true,
          cursorStyle: 'block',
          allowTransparency: true,
          scrollback: 2000,
          theme: THEME,
        })
        fit = new FitAddon()
        term.loadAddon(fit)
        term.open(element)
        instance.current = term
        if (!term.element || !term.textarea) {
          instance.current = null
          term.dispose()
          term = null
          fit = null
          return
        }
        term.textarea.setAttribute('aria-label', '页面终端输入')
        term.textarea.setAttribute('autocomplete', 'off')
        Object.assign(term.element.style, {
          width: '100%',
          height: '100%',
          padding: '9px 8px 5px 10px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        })
        buryAuxiliaryNodes(element)
        buryObs = new MutationObserver(() => buryAuxiliaryNodes(element))
        buryObs.observe(element, { childList: true, subtree: true })
        detachScroll = attachScrollRail(term, paneEl)
        try {
          if (!fitToVisibleBox(term, element)) fit.fit()
          term.scrollToBottom()
        } catch {
          // 字体度量还没好，下一帧再 fit。
        }
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        socket = new WebSocket(
          `${protocol}//${location.host}/ws/page-terminal` +
            `?cols=${term.cols}&rows=${term.rows}&session=${encodeURIComponent(sessionKey)}`,
        )
        socket.binaryType = 'arraybuffer'
        socket.addEventListener('open', () => {
          if (disposed || !term) return
          scheduleFit()
          send({ type: 'resize', cols: term.cols, rows: term.rows })
        })
        socket.addEventListener('message', (event) => {
          decodePtyChunk(event.data, (chunk) => {
            if (!chunk || disposed || !term) return
            term.write(chunk)
            recordOutput(chunk)
          })
        })
        socket.addEventListener('close', (event) => {
          if (disposed || event.code === 1000 || !term) return
          const why = event.reason?.trim() || `code ${event.code}`
          term.write(`\r\n\x1b[31m终端未能启动：${why}\x1b[0m\r\n`)
        })
        dataSub = term.onData((data) => {
          recordInput(data)
          send({ type: 'input', data })
        })
        resizeSub = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }))
      }
      try {
        if (!term || !fit) return
        if (!fitToVisibleBox(term, element)) fit.fit()
        term.refresh(0, term.rows - 1)
      } catch {
        // Ignore transient zero-size layouts while the page is switching.
      }
    }

    const scheduleFit = () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
      frame = requestAnimationFrame(() => {
        openVisibleTerminal()
        secondFrame = requestAnimationFrame(openVisibleTerminal)
      })
    }

    const resizeObs = new ResizeObserver(scheduleFit)
    resizeObs.observe(element)
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(scheduleFit)
    intersection?.observe(element)
    document.addEventListener('visibilitychange', scheduleFit)
    scheduleFit()

    return () => {
      disposed = true
      if (outTimer) window.clearTimeout(outTimer)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
      intersection?.disconnect()
      document.removeEventListener('visibilitychange', scheduleFit)
      resizeObs.disconnect()
      buryObs?.disconnect()
      detachScroll()
      dataSub?.dispose()
      resizeSub?.dispose()
      try {
        socket?.close()
      } catch {
        // 可能还没连上。
      }
      if (instance.current === term) instance.current = null
      term?.dispose()
    }
  }, [])

  return (
    <div
      ref={pane}
      className="pt-pane"
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation()
        instance.current?.focus()
      }}
      onWheel={(event) => event.stopPropagation()}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        height: fill ? undefined : height,
        flex: fill ? 1 : undefined,
        minWidth: 0,
        minHeight: 0,
        padding: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: '#191919',
        // 不能用 contain:strict：它会让 .xterm-viewport 的 offsetParent 变 null，
        // xterm 的 _handleScroll 里 `if (!viewportElement.offsetParent) return`
        // 会直接吞掉滚动事件，buffer.viewportY 再也不更新 → 内容一多就「溢出但滚不动」。
        contain: 'layout paint',
      }}
    >
      <div ref={mount} className="pt-mount" />
    </div>
  )
}

/** 历史面板：和终端分开的独立组件，只负责把块数据里的 history 画出来。
   不往 xterm 里塞内容，避免干扰真实 shell 的输出。 */
/** 把毫秒差格式化成「刚刚 / 3 分钟 / 2 小时 / 1 天」。 */
function formatSpan(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时`
  return `${Math.floor(hour / 24)} 天`
}

function HistoryPanel({
  history,
  writable,
  onClear,
}: {
  history: HistoryEntry[]
  writable: boolean
  onClear: () => void
}) {
  const React2 = React
  // 默认折叠：历史是参考信息，不该一上来占满屏幕。
  const [open, setOpen] = React2.useState(false)
  if (history.length === 0) return null

  const mono = '"SF Mono", Menlo, Monaco, Consolas, monospace'

  // 统计：总条数 + 最常用的几条命令（去掉参数，按命令名归并）。
  const counts = new Map<string, number>()
  for (const entry of history) {
    const head = entry.cmd.trim().split(/\s+/)[0] || entry.cmd.trim()
    counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4)
  const span = history.length > 1 && history[0].at && history[history.length - 1].at
    ? formatSpan(history[history.length - 1].at - history[0].at)
    : ''

  return (
    <div className="pt-history">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 26,
          padding: '0 10px',
          color: 'rgba(242,241,237,0.45)',
          font: '11px ui-sans-serif, system-ui, sans-serif',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
            border: 0,
            padding: 0,
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms ease',
              fontSize: 9,
            }}
          >
            ▶
          </span>
          历史记录
          <span style={{ opacity: 0.7 }}>{history.length} 条</span>
          {top.length > 0 ? (
            <span style={{ opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              · {top.map(([name, n]) => `${name}×${n}`).join(' · ')}
            </span>
          ) : null}
          {span ? <span style={{ opacity: 0.45 }}>· {span}</span> : null}
        </button>
        <span style={{ flex: 1 }} />
        {writable ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="清空"
            title="清空"
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              border: 0,
              padding: 0,
              borderRadius: 5,
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 14.5h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.71l.275 5.5a.75.75 0 0 1-1.494.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.494-.075l.275-5.5a.75.75 0 0 1 .787-.71Z"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            padding: '4px 10px 10px',
            fontFamily: mono,
            fontSize: 12,
            lineHeight: 1.45,
            color: 'rgba(242,241,237,0.82)',
          }}
        >
          {history.map((entry, index) => (
            <div key={`${entry.at}-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: '#4cc38a', flex: '0 0 auto' }}>$</span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry.cmd}</span>
              </div>
              {entry.out ? (
                <div
                  className="pt-history-out"
                  style={{
                    margin: '2px 0 0',
                    paddingLeft: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'rgba(242,241,237,0.48)',
                    font: 'inherit',
                  }}
                >
                  {entry.out}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 标题栏图标按钮。 */
function IconButton({
  label,
  active,
  dataZoomExit,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  dataZoomExit?: boolean
  onClick: () => void
  children: unknown
}) {
  return (
    <button
      type="button"
      data-zoom-exit={dataZoomExit ? '' : undefined}
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        border: 0,
        padding: 0,
        borderRadius: 5,
        background: active ? 'color-mix(in srgb, var(--dsw-label, #f0efed) 12%, transparent)' : 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children as never}
    </button>
  )
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.455 1.45A.5.5 0 0 1 6.952 1h2.096a.5.5 0 0 1 .497.45l.186 1.858a4.996 4.996 0 0 1 1.466.848l1.703-.769a.5.5 0 0 1 .639.206l1.047 1.814a.5.5 0 0 1-.14.656l-1.517 1.09a5.026 5.026 0 0 1 0 1.694l1.516 1.09a.5.5 0 0 1 .141.656l-1.047 1.814a.5.5 0 0 1-.639.206l-1.703-.768c-.433.36-.928.649-1.466.847l-.186 1.858a.5.5 0 0 1-.497.45H6.952a.5.5 0 0 1-.497-.45l-.186-1.858a4.993 4.993 0 0 1-1.466-.848l-1.703.769a.5.5 0 0 1-.639-.206l-1.047-1.814a.5.5 0 0 1 .14-.656l1.517-1.09a5.033 5.026 0 0 1 0-1.694l-1.516-1.09a.5.5 0 0 1-.141-.656L2.46 3.593a.5.5 0 0 1 .639-.206l1.703.769c.433-.36.928-.65 1.466-.848l.186-1.858Zm-.177 7.567-.022-.037a2 2 0 0 1 3.466-1.997l.022.037a2 2 0 0 1-3.466 1.997Z"
      />
    </svg>
  )
}

function ExpandIcon({ shrink }: { shrink?: boolean }) {
  return shrink ? (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.2 9.8 2.5 13.5M9.8 6.2l3.7-3.7M2.5 13.5h3.2M2.5 13.5v-3.2M13.5 2.5h-3.2M13.5 2.5v3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.5 6.5 13.5 2.5M13.5 2.5h-3.2M13.5 2.5v3.2M6.5 9.5 2.5 13.5M2.5 13.5h3.2M2.5 13.5v-3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 放大放映：不搬 DOM、不重建子树，只把当前块用 fixed 提升到全屏。
   xterm 是命令式操作真实 DOM 的，搬动或重建都会丢节点，所以只改样式。
   同时临时解开沿途祖先的 overflow/position（否则会被编辑器容器裁掉）。 */
/** 放大：把块的真实 DOM 节点搬到 document.body 顶层，并铺满视口。
   为什么必须搬到 body：
     宿主把界面切成多层容器，各层常带 position:relative / z-index，
     会形成各自的层叠上下文（例如检查器的 .app-side-bar-head 是 relative+z-index:3）。
     节点留在原容器里时，z-index 再大也只在那个上下文内生效，
     压不住其它分支里的 UI（顶部 tab 栏就压不住）。
     挂到 body 顶层才能真正浮在一切之上。
   为什么不重建 React 子树 / 用 Portal：xterm 命令式持有真实 DOM，
   重建会让它画在脱离文档的节点上（实测黑屏）。
   还原靠原位置留下的注释锚点。 */
function useZoom() {
  const [zoomed, setZoomed] = React.useState(false)
  const slotRef = React.useRef<HTMLElement | null>(null)
  const markRef = React.useRef<Comment | null>(null)
  const nativeOffRef = React.useRef<(() => void) | null>(null)

  const stopRef = React.useRef<() => void>(() => {})

  const stop = React.useCallback(() => {
    const slot = slotRef.current
    const mark = markRef.current
    if (slot && mark && mark.parentNode) {
      mark.parentNode.insertBefore(slot, mark)
      mark.remove()
    }
    markRef.current = null
    nativeOffRef.current?.()
    nativeOffRef.current = null
    relockAncestors()
    setZoomed(false)
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }, [])
  stopRef.current = stop

  const start = React.useCallback(() => {
    const slot = slotRef.current
    if (!slot || markRef.current) return
    // 原位留注释锚点，退出时据此还原。
    const mark = document.createComment('page-terminal-zoom-anchor')
    slot.parentNode?.insertBefore(mark, slot)
    markRef.current = mark
    unlockAncestors(mark)
    document.body.appendChild(slot)
    setZoomed(true)
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    // 节点被搬走后，React 的合成事件委托链会断，onClick 不再触发。
    // 补一个原生监听，保证放大后还能点按钮退出。
    window.setTimeout(() => {
      const btn = slot.querySelector('[data-zoom-exit]') as HTMLElement | null
      if (!btn) return
      const handler = (event: Event) => {
        event.preventDefault()
        event.stopPropagation()
        stopRef.current()
      }
      btn.addEventListener('click', handler, true)
      nativeOffRef.current = () => btn.removeEventListener('click', handler, true)
    }, 0)
  }, [])

  // Esc 退出。用原生 keydown，捕获阶段优先。
  React.useEffect(() => {
    if (!zoomed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      stop()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zoomed, stop])

  // 卸载兜底还原。
  React.useEffect(() => () => relockAncestors(), [])

  return { zoomed, start, stop, slotRef }
}

/** 终端设置：小悬浮窗，贴标题栏齿轮，点窗外关闭。 */
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const React2 = React
  const box = React2.useRef<HTMLDivElement | null>(null)
  const [state, setState] = React2.useState<{
    loading: boolean
    error?: string
    settings?: Record<string, number>
    limits?: Record<string, { min: number; max: number }>
    sessions?: number
  }>({ loading: true })

  React2.useEffect(() => {
    let cancelled = false
    fetch('/api/page-terminal/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setState({ loading: false, settings: data.settings, limits: data.limits, sessions: data.sessions })
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  React2.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const patch = (key: string, value: number) => {
    setState((cur) => ({ ...cur, settings: { ...(cur.settings ?? {}), [key]: value } }))
    fetch('/api/page-terminal/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
      .then((res) => res.json())
      .then((data) => setState((cur) => ({ ...cur, settings: data.settings, sessions: data.sessions })))
      .catch(() => {
        // 忽略：下次打开会重读。
      })
  }

  const row = (key: string, label: string, hint: string) => {
    const value = state.settings?.[key]
    const limit = state.limits?.[key]
    return (
      <label
        key={key}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '2px 10px',
          padding: '8px 0',
          borderTop: '1px solid var(--dsw-border, rgba(242,241,237,0.1))',
        }}
      >
        <span style={{ color: 'var(--dsw-label, #f0efed)', fontWeight: 600 }}>{label}</span>
        <input
          type="number"
          value={value ?? ''}
          min={limit?.min}
          max={limit?.max}
          disabled={state.loading}
          onChange={(event) => patch(key, Number(event.target.value))}
          style={{
            width: 64,
            height: 26,
            border: 0,
            borderRadius: 7,
            padding: '0 8px',
            background: 'var(--dsw-hover, rgba(242,241,237,0.08))',
            color: 'var(--dsw-label, #f0efed)',
            font: 'inherit',
            textAlign: 'right',
            outline: 'none',
          }}
        />
        <span style={{ gridColumn: '1 / -1', color: 'var(--dsw-label-3, rgba(242,241,237,0.45))', fontSize: 11, lineHeight: 1.4 }}>
          {hint}
          {limit ? ` · ${limit.min}–${limit.max}` : ''}
        </span>
      </label>
    )
  }

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="终端设置"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        zIndex: 40,
        width: 268,
        padding: '10px 12px 8px',
        border: '1px solid var(--dsw-border, rgba(242,241,237,0.12))',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--dsw-sidebar, #222220) 92%, #111)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.42)',
        color: 'var(--dsw-label-2, rgba(242,241,237,0.72))',
        font: '12px ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0 8px' }}>
        <span style={{ color: 'var(--dsw-label, #f0efed)', fontWeight: 600, fontSize: 13 }}>设置</span>
        {typeof state.sessions === 'number' ? (
          <span style={{ color: 'var(--dsw-label-3, rgba(242,241,237,0.45))' }}>{state.sessions} 个后台会话</span>
        ) : null}
      </div>
      {state.error ? (
        <div style={{ padding: '6px 0', color: '#ff6369' }}>读取失败：{state.error}</div>
      ) : (
        <>
          {row('maxSessions', '后台保留', '关掉页面后仍留着的会话，超出按最久未用淘汰')}
          {row('bufferKB', '回放缓冲 KB', '每个会话缓存的输出，重连时回放')}
          {row('replayLines', '回放行数', '重连时最多回放多少行')}
        </>
      )}
    </div>
  )
}

function PageTerminal({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const settingsWrap = React.useRef<HTMLDivElement | null>(null)
  const zoom = useZoom()
  const sessionKey = typeof data.sid === 'string' && data.sid ? data.sid : ''
  useEffect(() => {
    if (sessionKey || !writable) return
    const sid = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    update({ sid })
  }, [sessionKey, writable, update])

  React.useEffect(() => {
    if (!settingsOpen) return
    const onDown = (event: MouseEvent) => {
      const node = settingsWrap.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      setSettingsOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [settingsOpen])

  const height = typeof data.height === 'number' && data.height > 0 ? Math.min(900, data.height) : DEFAULTS.height

  // 历史存在块数据里，agent 读页面 markdown 即可看到用户跑过什么。
  const history: HistoryEntry[] = parseHistory(data.history)

  const body = (
    <section
      ref={(el: HTMLElement | null) => {
        zoom.slotRef.current = el
      }}
      data-testid="page-terminal"
      className="pt-card"
      style={{
        ...(zoom.zoomed
          ? {
              position: 'fixed',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 2147483647,
              borderRadius: 0,
              border: 'none',
            }
          : {}),
      }}
    >
      <header className="pt-head">
        <span className="pt-title">终端</span>
        <span style={{ flex: 1 }} />
        <div ref={settingsWrap} style={{ position: 'relative', flex: '0 0 auto' }}>
          <IconButton label="设置" active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
            <GearIcon />
          </IconButton>
          {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        </div>
        <IconButton
          label={zoom.zoomed ? '退出全屏' : '全屏放大'}
          active={zoom.zoomed}
          dataZoomExit
          onClick={() => (zoom.zoomed ? zoom.stop() : zoom.start())}
        >
          <ExpandIcon shrink={zoom.zoomed} />
        </IconButton>
      </header>
      <HistoryPanel
        history={history}
        writable={writable}
        onClear={() => update({ history: [] })}
      />
      {sessionKey ? (
        <TerminalSurface
          height={height}
          history={history}
          onHistory={(next) => update({ history: next })}
          sessionKey={sessionKey}
          fill={zoom.zoomed}
        />
      ) : null}
    </section>
  )

  return body
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
      View: (props: {
        data: Record<string, unknown>
        update: (patch: Record<string, unknown>) => void
        writable: boolean
      }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'terminal',
    plugin: name,
    label: '终端',
    blockType: 'terminal',
    blockTypeLabel: '终端',
    hint: '可交互的真实终端，每块一个独立 shell',
    aliases: ['terminal', 'term', 'shell', '终端', '命令行'],
    defaults: DEFAULTS,
    View: PageTerminal,
  })
}
