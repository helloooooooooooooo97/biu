import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

const React = globalThis.React
const { useEffect, useRef } = React

export const name = 'global-terminal'
export const inject = ['slots']

const HISTORY_MAX = 200
const HISTORY_OUT_LINES = 10
const HISTORY_OUT_CHARS = 600
const OUTPUT_SETTLE_MS = 600
const SID_KEY = 'biu:plugin:global-terminal:sid'
const HISTORY_KEY = 'biu:plugin:global-terminal:history'

type HistoryEntry = { cmd: string; at: number; out?: string }

function loadSid() {
  try {
    const existing = localStorage.getItem(SID_KEY)?.trim()
    if (existing) return existing
    const sid = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(SID_KEY, sid)
    return sid
  } catch {
    return 'main'
  }
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      cmd: String(item.cmd ?? ''),
      at: Number(item.at) || 0,
      ...(typeof item.out === 'string' && item.out ? { out: item.out } : {}),
    }))
    .filter((item) => item.cmd)
}

function loadHistory(): HistoryEntry[] {
  try {
    return parseHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))
  } catch {
    return []
  }
}

function saveHistory(next: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 配额满就丢掉，不影响终端本身。
  }
}

// xterm 会在容器里塞进一批「辅助节点」，样式没生效时它们会露出来
// （表现为一个能打字的输入框 + 一行乱码）。这里主动压制。
//
// 注意：只压制「干扰类」节点，绝不碰字符测量元素。
// xterm 自己已经把它放在 left:-119988px / visibility:hidden 了，
// 一旦我们去改它（尤其 display:none），它会量不出字符宽度，
// 导致字间距错乱、光标画不出来。
// xterm 会在容器里塞进一批「辅助节点」，样式没生效时它们会露出来
// （表现为一个能打字的输入框 + 一行乱码）。这里主动压制，但要分清两类：
//
//  1. helper-textarea 是 xterm 接收键盘输入的节点，**不能 display:none**
//     —— 隐藏元素无法获得焦点，会导致整个终端打不了字。
//     必须用「移出屏幕 + 透明 + 零尺寸」的方式藏，保持可聚焦 + 可测量。
//  2. .xterm-helpers 也不动：字符测量元素住在它里面，压了它会让字间距错乱、光标消失。
//  3. 其余干扰节点（无障碍树、live-region 等）直接 display:none。
const HELPER_TEXTAREA = '.xterm-helper-textarea'

// 字符测量元素/测量容器：xterm 拿它量字符宽度，里面塞着一坨占位字符（%%%、vvv 等，会变）。
// 它默认靠 left:-119988px 藏到屏幕外，但在带 transform/backdrop-filter 的容器里
// 可能因包含块变化而重新进入可视区 —— 那串占位字符就会显示成"顶部多一行乱码"。
//
// 处理：用 opacity:0 藏起来。不要 clip-path:inset(100%) —— Chrome 里
// getBoundingClientRect 会变成 0，字格宽度为 0，提示符全叠在最左边。
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
  s.setProperty('white-space', 'nowrap', 'important')
  // 关键：不能 display:none，否则无法聚焦、终端打不了字。
  s.removeProperty('display')
}

function buryAuxiliaryNodes(root: HTMLElement) {
  for (const node of root.querySelectorAll(MEASURE_SELECTORS)) {
    const el = node as HTMLElement
    const s = el.style
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

const THEME = {
  // 透明背景，露出外层窗口的毛玻璃；需要 allowTransparency: true 才生效。
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

// 终端局部样式。
// 注意：不能写成「已存在同 id 的 style 就 return」——
// 旧版本（或上一个实例）留下的同 id 标签会一直挡着，导致新样式永远不生效。
// 每次都用最新内容覆盖它。
function useTerminalStyle() {
  useEffect(() => {
    const id = 'gt-xterm-style-v2'
    // 清掉历史版本留下的同族标签，避免旧内容挡着新样式。
    for (const stale of document.querySelectorAll('style[id^="gt-xterm-style"]')) {
      if (stale.id !== id) stale.remove()
    }
    const existing = document.getElementById(id)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = id
    el.textContent = `
.gt-pane .xterm { padding: 0 !important; height: 100%; }
/* 终端内部透明，露出外层窗口的毛玻璃背景 */
.gt-pane .xterm-screen { background: transparent !important; }
.gt-pane .xterm-viewport { background: transparent !important; }
.gt-pane canvas { background: transparent !important; }

/* xterm 用的是它自己渲染的滚动条（.scrollbar > .slider），
   不是浏览器原生滚动条，所以 ::-webkit-scrollbar 对它无效。
   必须直接改这两个元素：窄滑块 + 圆角 + 半透明，悬停加深。 */
/* 内容不满一屏（无需滚动）时，xterm 会给滚动条加 .invisible 类。
   显式加强：这种情况下彻底隐藏滚动条和滑块，别让它留一条痕迹。 */
.gt-pane .scrollbar.invisible,
.gt-pane .xterm .scrollbar.invisible {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
.gt-pane .scrollbar.invisible > .slider,
.gt-pane .xterm .scrollbar.invisible > .slider {
  opacity: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
  background: transparent !important;
}

/* 用尽量宽的选择器压过 xterm 写在元素上的 inline width。 */
.gt-pane .scrollbar,
.gt-pane .xterm .scrollbar,
.gt-pane .xterm-scrollable-element > .scrollbar {
  width: 12px !important;
  min-width: 12px !important;
  max-width: 12px !important;
}
.gt-pane .slider,
.gt-pane .scrollbar > .slider,
.gt-pane .xterm .scrollbar > .slider {
  width: 8px !important;
  min-width: 8px !important;
  max-width: 8px !important;
  left: 2px !important;
  right: auto !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--dsw-label-3, rgba(242,241,237,0.45)) 55%, transparent) !important;
  transition: background 120ms ease;
  border: 0 !important;
  box-shadow: none !important;
}
.gt-pane .slider:hover,
.gt-pane .scrollbar > .slider:hover,
.gt-pane .scrollbar > .slider.active {
  background: color-mix(in srgb, var(--dsw-label-2, rgba(242,241,237,0.72)) 70%, transparent) !important;
}
`
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function formatSpan(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时`
  return `${Math.floor(hour / 24)} 天`
}

function HistoryPanel({ history, onClear }: { history: HistoryEntry[]; onClear: () => void }) {
  const [open, setOpen] = React.useState(false)
  if (history.length === 0) return null
  const mono = '"SF Mono", Menlo, Monaco, Consolas, monospace'
  const counts = new Map<string, number>()
  for (const entry of history) {
    const head = entry.cmd.trim().split(/\s+/)[0] || entry.cmd.trim()
    counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4)
  const span =
    history.length > 1 && history[0].at && history[history.length - 1].at
      ? formatSpan(history[history.length - 1].at - history[0].at)
      : ''
  return (
    <div
      style={{
        flex: 'none',
        borderBottom: '1px solid var(--dsw-border, rgba(242,241,237,0.1))',
        background: 'color-mix(in srgb, var(--dsw-bg, #191919) 70%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 26,
          padding: '0 10px',
          color: 'var(--dsw-label-3, rgba(242,241,237,0.45))',
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
          <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease', fontSize: 9 }}>
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
        <button
          type="button"
          onClick={onClear}
          style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
        >
          清空
        </button>
      </div>
      {open ? (
        <div
          style={{
            maxHeight: 180,
            overflowY: 'auto',
            padding: '4px 10px 10px',
            fontFamily: mono,
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--dsw-label-2, rgba(242,241,237,0.72))',
          }}
        >
          {history.map((entry, index) => (
            <div key={`${entry.at}-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: '#4cc38a', flex: '0 0 auto' }}>$</span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry.cmd}</span>
              </div>
              {entry.out ? (
                <pre
                  style={{
                    margin: '2px 0 0',
                    paddingLeft: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--dsw-label-3, rgba(242,241,237,0.45))',
                    font: 'inherit',
                  }}
                >
                  {entry.out}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TerminalPane({
  history,
  onHistory,
  sessionKey,
}: {
  history: HistoryEntry[]
  onHistory: (next: HistoryEntry[]) => void
  sessionKey: string
}) {
  useTerminalStyle()
  const host = useRef<HTMLDivElement | null>(null)
  const historyHold = useRef(history)
  historyHold.current = history

  useEffect(() => {
    const element = host.current
    if (!element) return

    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      scrollback: 10000,
      theme: THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)

    // 关键：打开后立刻把辅助节点压掉，并持续盯着（xterm 会重设它们的样式）。
    buryAuxiliaryNodes(element)
    const observer = new MutationObserver(() => buryAuxiliaryNodes(element))
    observer.observe(element, { childList: true, subtree: true })

    // 先量尺寸：容器布局稳定前 fit 出来的是错的，会导致 PTY 按错误列数启动。
    let raf = 0
    const fitted = () => {
      try {
        fit.fit()
        return true
      } catch {
        return false
      }
    }
    fitted()

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    // 连接延后到第二帧建立，此时 term.cols/rows 才反映真实布局。
    let socket!: WebSocket
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitted()
        socket = new WebSocket(
          `${protocol}//${location.host}/ws/global-terminal?cols=${term.cols}&rows=${term.rows}&session=${encodeURIComponent(sessionKey)}`,
        )
        socket.binaryType = 'arraybuffer'
        wireSocket(socket)
      })
    })

    const wireSocket = (ws: WebSocket) => {
      ws.addEventListener('open', () => {
        // 连上后立刻把 xterm 的真实列数同步给 PTY，并且连发几次，
        // 确保 shell 在画第一个提示符之前就拿到正确列数。
        const sync = () => ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        sync()
        window.setTimeout(sync, 50)
        window.setTimeout(sync, 200)
        term.focus()
      })
      // 纯直通：PTY 字节交给 xterm 解析，不做任何清屏/干预。
      ws.addEventListener('message', (event) => {
        decodePtyChunk(event.data, (chunk) => {
          if (!chunk) return
          term.write(chunk)
          recordOutput(chunk)
        })
      })
      ws.addEventListener('close', (event) => {
        if (event.code === 1000) return
        const why = event.reason?.trim() || `code ${event.code}`
        term.write(`\r\n\x1b[31m终端未能启动：${why}\x1b[0m\r\n`)
      })
    }

    let pendingLine = ''
    let capturing = false
    let outBuffer = ''
    let outTimer: number | undefined

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
      const list = [...historyHold.current]
      const last = list[list.length - 1]
      if (!last || last.out !== undefined) return
      last.out = out || undefined
      onHistory(list)
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
          const next = [...historyHold.current, { cmd, at: Date.now() }]
          if (next.length > HISTORY_MAX) next.splice(0, next.length - HISTORY_MAX)
          onHistory(next)
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

    const dataSub = term.onData((data) => {
      recordInput(data)
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }))
    })

    // 关键：xterm 的列数一旦变化，立刻同步给 PTY。
    // 否则 shell 会按旧列数算提示符擦行序列，宽度对不上就会在屏幕上留下一行残留。
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows }))
    })

    const resizeObs = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        return
      }
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    resizeObs.observe(element)

    return () => {
      if (outTimer) window.clearTimeout(outTimer)
      cancelAnimationFrame(raf)
      observer.disconnect()
      resizeObs.disconnect()
      resizeSub.dispose()
      dataSub.dispose()
      try {
        socket?.close()
      } catch {
        // 可能还没建立连接。
      }
      term.dispose()
    }
  }, [onHistory, sessionKey])

  return (
    <div
      ref={host}
      className="gt-pane"
      onKeyDown={(event) => event.stopPropagation()}
      // 用普通块级元素撑满 flex 父容器（不用 absolute），
      // 保证 FitAddon 能读到准确的父容器尺寸，否则会算小行列数、右下留空。
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        padding: '8px 10px 0 10px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    />
  )
}

function GlobalTerminal() {
  const sessionKey = React.useMemo(() => loadSid(), [])
  const [history, setHistory] = React.useState<HistoryEntry[]>(() => loadHistory())
  const onHistory = React.useCallback((next: HistoryEntry[]) => {
    setHistory(next)
    saveHistory(next)
  }, [])

  return (
    <main
      data-testid="global-terminal"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--dsw-sidebar, #202020) 30%, transparent)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        boxShadow: '0 0 0 1px var(--dsw-border, rgba(242,241,237,0.1)), 0 24px 64px rgba(0,0,0,0.42)',
        color: 'var(--dsw-label, #f0efed)',
        font: '11px ui-sans-serif, -apple-system, system-ui, sans-serif',
      }}
    >
      <header
        style={{
          height: 34,
          flex: '0 0 34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
          borderBottom: '1px solid var(--dsw-border, rgba(242,241,237,0.1))',
          background: 'color-mix(in srgb, var(--dsw-label, #f0efed) 4%, transparent)',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--dsw-label-3, rgba(242,241,237,0.45))', fontWeight: 500 }}>zsh</span>
      </header>
      <HistoryPanel history={history} onClear={() => onHistory([])} />
      <section
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          background: 'transparent',
        }}
      >
        <TerminalPane history={history} onHistory={onHistory} sessionKey={sessionKey} />
      </section>
    </main>
  )
}

function TerminalIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6.5 6.5 8.5 4.5 10.5M8.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function apply(ctx: {
  slots: {
    place(slot: string, Component: typeof GlobalTerminal, options: { key: string; props(): { Icon: typeof TerminalIcon } }): void
  }
}) {
  ctx.slots.place('plugin-store-extras', GlobalTerminal, {
    key: name,
    props: () => ({ Icon: TerminalIcon }),
  })
}
