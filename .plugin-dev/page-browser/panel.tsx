/**
 * 右侧栏浏览器面板（Electron 外壳里的版本）。
 *
 * 关键点：面板本身只是网页里的一个空位；真正的网页由 Electron 那边的原生
 * BrowserView 渲染，浮在这个空位之上。所以这里要做的只有三件事：
 *   1. 量出空位在窗口里的矩形，报给外壳
 *   2. 面板不可见（切走 tab / 收起检查器）时告诉外壳藏起来
 *   3. 画上层工具条，并把「点选元素」的坐标换算成视图内坐标发过去
 *
 * 网页版（没有 window.biuBrowser）时给出提示，不报错。
 */

import { BROWSER_OPEN_EVENT, BROWSER_TAB_ID, takePendingBrowserUrl } from './open.ts'

const React = globalThis.React
const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React

/** core-pick 服务的最小接口（插件不能 import @biu/*，从 ctx.get('pick') 拿）。 */
type PickApi = {
  attach: (
    refs: Array<Record<string, unknown>>,
    draft?: { text: string; send?: boolean },
  ) => void
}

type Bridge = {
  available: true
  navigate: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  stop: () => void
  bounds: (rect: { x: number; y: number; width: number; height: number }) => void
  visible: (visible: boolean) => void
  openExternal: (url: string) => void
  inspect: (x: number, y: number) => void
  cancelInspect: () => void
  close: () => void
  onState: (fn: (s: { url: string; title: string; canGoBack: boolean; canGoForward: boolean; loading: boolean }) => void) => () => void
  onError: (fn: (e: { code: number; desc: string; url: string }) => void) => () => void
  onInspected: (fn: (info: InspectedPayload) => void) => () => void
}

type DomSnap = { tag: string; id: string; className: string; text: string; html: string }
type InspectedPayload = { items?: DomSnap[] } | DomSnap[] | DomSnap | null

function inspectedList(info: InspectedPayload): DomSnap[] {
  if (!info) return []
  if (Array.isArray(info)) return info
  if (typeof info === 'object' && Array.isArray(info.items)) return info.items
  if (typeof info === 'object' && 'tag' in info && typeof info.tag === 'string') return [info]
  return []
}

function pickIdFromText(raw: string) {
  let hash = 0
  const key = raw.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

function bridge(): Bridge | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { biuBrowser?: Bridge }
  return w.biuBrowser?.available ? w.biuBrowser : null
}

const UI = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
const INK = '#ececec'
const PAPER = '#191919'
const FIELD = '#121212'
const BORDER = 'rgba(255,255,255,.1)'

const BOOKMARKS: Array<{ label: string; url: string }> = [
  { label: 'example.com', url: 'https://example.com' },
  { label: 'Wikipedia', url: 'https://zh.wikipedia.org' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
  { label: 'GitHub', url: 'https://github.com' },
]

function Glyph({ id }: { id: 'back' | 'forward' | 'reload' | 'open' | 'pick' | 'external' }) {
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true }
  if (id === 'back')
    return (
      <svg {...common}>
        <path d="M7.03 3.03a.75.75 0 0 0-1.06-1.06l-4.5 4.5a.75.75 0 0 0 0 1.06l4.5 4.5a.75.75 0 1 0 1.06-1.06L3.81 7.75H10a3.25 3.25 0 0 1 3.25 3.25v1.25a.75.75 0 0 0 1.5 0V11A4.75 4.75 0 0 0 10 6.25H3.81l3.22-3.22Z" />
      </svg>
    )
  if (id === 'forward')
    return (
      <svg {...common}>
        <path d="M8.97 3.03a.75.75 0 1 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H6a3.25 3.25 0 0 0-3.25 3.25v1.25a.75.75 0 0 1-1.5 0V11A4.75 4.75 0 0 1 6 6.25h5.19L8.97 3.03Z" />
      </svg>
    )
  if (id === 'reload')
    return (
      <svg {...common}>
        <path d="M8 2.75a5.25 5.25 0 1 0 5.2 6.02.75.75 0 1 0-1.48-.24A3.75 3.75 0 1 1 8 4.25c.83 0 1.6.27 2.22.72l-1.1 1.1h3.4V2.67l-1.1 1.1A5.24 5.24 0 0 0 8 2.75Z" />
      </svg>
    )
  if (id === 'open')
    return (
      <svg {...common}>
        <path d="M5.5 3.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0V4.81l-7.22 7.22a.75.75 0 1 1-1.06-1.06L10.94 3.75H6.25a.75.75 0 0 1-.75-.5Z" />
      </svg>
    )
  if (id === 'pick')
    return (
      <svg {...common} width={16} height={16}>
        <path d="M7.25 1.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5ZM11.536 2.904a.75.75 0 1 1 1.06 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061ZM14.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM4.464 9.975a.75.75 0 0 1 1.061 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061ZM4.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM5.525 3.964a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 1.06-1.061l1.061 1.06ZM8.779 7.438a.75.75 0 0 0-1.368.366l-.396 5.283a.75.75 0 0 0 1.212.646l.602-.474.288 1.074a.75.75 0 1 0 1.449-.388l-.288-1.075.759.11a.75.75 0 0 0 .726-1.165L8.78 7.438Z" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M4 8.75a4 4 0 1 1 8 0 4 4 0 0 1-8 0ZM3 8a5 5 0 0 1 4.25-4.94V1.5h1.5v1.56A5 5 0 0 1 13 8a5 5 0 0 1-4.25 4.94v1.56h-1.5v-1.56A5 5 0 0 1 3 8Z" />
    </svg>
  )
}

/** 面板内容：一块空位（给原生视图让位）+ 工具条 + 地址栏。 */
function BrowserPanel({ pick }: { pick?: PickApi }) {
  const api = bridge()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [addr, setAddr] = useState('')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState({ url: '', title: '', canGoBack: false, canGoForward: false, loading: false })

  /* ---- 把空位矩形报给外壳 ---- */
  const pushBounds = useCallback(() => {
    const el = stageRef.current
    if (!el || !api) return
    const pane = el.closest('.inspector-stage-pane')
    const active = !pane || pane.classList.contains('is-active')
    const r = el.getBoundingClientRect()
    const show = active && r.width > 1 && r.height > 1
    api.bounds({ x: r.left, y: r.top, width: show ? r.width : 0, height: show ? r.height : 0 })
    api.visible(show)
  }, [api])

  useEffect(() => {
    const goUrl = (raw: string) => {
      const url = String(raw || '').trim()
      if (!url || !api) return
      setError('')
      setAddr(url)
      api.navigate(url)
    }
    const pending = takePendingBrowserUrl()
    if (pending) goUrl(pending)
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail as { url?: unknown } | undefined
      if (typeof detail?.url === 'string') goUrl(detail.url)
    }
    window.addEventListener(BROWSER_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(BROWSER_OPEN_EVENT, onOpen)
  }, [api])

  useLayoutEffect(() => {
    pushBounds()
    if (!api) return
    const el = stageRef.current
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => pushBounds())
    if (ro && el) ro.observe(el)
    window.addEventListener('resize', pushBounds)
    const timer = window.setInterval(pushBounds, 500)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', pushBounds)
      window.clearInterval(timer)
      api.visible(false)
    }
  }, [api, pushBounds])

  /* ---- 订阅外壳状态 ---- */
  useEffect(() => {
    if (!api) return
    const offState = api.onState((next) => {
      setState(next)
      if (next.url && next.url !== 'about:blank') setAddr(next.url)
      if (next.url) setError('')
    })
    const offError = api.onError((e) => {
      setError(`${e.desc || '加载失败'}${e.code ? ` (${e.code})` : ''}`)
    })
    const offInspect = api.onInspected((info) => {
      setPicking(false)
      const snaps = inspectedList(info)
      if (!snaps.length) return
      const route = state.url || ''
      pick?.attach(
        snaps.map((item) => {
          const text = (item.text || '').trim()
          const css = String(item.className || '').split(/\s+/).find(Boolean)
          const tagLabel = `${item.tag}${item.id ? `#${item.id}` : ''}${css ? `.${css}` : ''}`
          const label = (text.replace(/\s+/g, ' ').slice(0, 80) || tagLabel).trim()
          const selection = text || item.html || label
          return {
            kind: 'html',
            id: pickIdFromText(`${route}|${item.tag}|${item.id}|${selection}`),
            label,
            route,
            title: state.title || route,
            path: route,
            plugin: 'page-browser',
            text: text || undefined,
            selection,
          }
        }),
      )
    })
    return () => {
      offState()
      offError()
      offInspect()
    }
  }, [api, pick, state.url])

  useEffect(() => {
    if (!api || !picking) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setPicking(false)
      api.cancelInspect()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [api, picking])

  if (!api) {
    return (
      <div style={{ padding: 16, fontFamily: UI, fontSize: 13, color: 'var(--dsw-label-2)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: 'var(--dsw-label)', marginBottom: 6 }}>侧栏浏览器需要 Electron 外壳</div>
        <div>这个面板靠 Electron 的原生 BrowserView 渲染，网页版里没有这个能力。</div>
        <div style={{ marginTop: 8 }}>
          用 <code style={{ fontFamily: 'var(--font-mono)' }}>npm run electron:dev</code> 启动就能用。
        </div>
      </div>
    )
  }

  const iconBtn: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-label-2)',
    padding: '4px 5px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const go = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`
    setError('')
    setAddr(url)
    api.navigate(url)
  }

  return (
    <div
      data-testid="page-browser-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%', background: PAPER, color: INK }}
    >
      {/* 工具条 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 6px',
          borderBottom: `1px solid ${BORDER}`,
          background: PAPER,
          color: INK,
          fontFamily: UI,
          flex: 'none',
        }}
      >
        <button type="button" style={{ ...iconBtn, opacity: state.canGoBack ? 1 : 0.35 }} title="后退" aria-label="后退" onClick={() => api.back()}>
          <Glyph id="back" />
        </button>
        <button type="button" style={{ ...iconBtn, opacity: state.canGoForward ? 1 : 0.35 }} title="前进" aria-label="前进" onClick={() => api.forward()}>
          <Glyph id="forward" />
        </button>
        <button type="button" style={iconBtn} title={state.loading ? '停止' : '刷新'} aria-label="刷新" onClick={() => (state.loading ? api.stop() : api.reload())}>
          <Glyph id="reload" />
        </button>
        <form
          style={{ flex: 1, minWidth: 0, display: 'flex' }}
          onSubmit={(event) => {
            event.preventDefault()
            go(addr)
          }}
        >
          <input
            data-testid="browser-panel-addr"
            data-page-block-capture=""
            spellCheck={false}
            value={addr}
            placeholder="输入链接，例如 github.com"
            aria-label="地址"
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => setAddr(event.currentTarget.value)}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: UI,
              fontSize: 12.5,
              color: INK,
              background: FIELD,
              border: `1px solid ${BORDER}`,
              borderRadius: 999,
              padding: '5px 12px',
              outline: 'none',
            }}
          />
        </form>
        <button
          type="button"
          style={{ ...iconBtn, color: picking ? '#5b9fd6' : undefined }}
          title={picking ? '取消选取' : '选取'}
          aria-label={picking ? '取消选取' : '选取'}
          aria-pressed={picking}
          data-testid="browser-panel-pick"
          onClick={() => {
            if (picking) {
              setPicking(false)
              api.cancelInspect()
              return
            }
            setPicking(true)
            api.inspect(-1, -1)
          }}
        >
          <Glyph id="pick" />
        </button>
        <button
          type="button"
          style={iconBtn}
          title="在系统浏览器打开"
          aria-label="在系统浏览器打开"
          onClick={() => state.url && api.openExternal(state.url)}
        >
          <Glyph id="external" />
        </button>
      </div>

      {/* 原生视图的位置：这里留空，BrowserView 会浮在上面 */}
      <div
        ref={stageRef}
        data-testid="browser-panel-stage"
        onClick={(event) => {
          if (!picking) return
          const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
          api.inspect(event.clientX - r.left, event.clientY - r.top)
        }}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          background: PAPER,
          cursor: picking ? 'crosshair' : 'default',
        }}
      >
        {!state.url ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 20,
              fontFamily: UI,
              color: '#8b8b8b',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>输入链接开始浏览</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {BOOKMARKS.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => go(item.url)}
                  style={{
                    cursor: 'pointer',
                    fontFamily: UI,
                    fontSize: 12,
                    color: INK,
                    background: FIELD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 999,
                    padding: '5px 12px',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <div
            data-testid="browser-panel-error"
            style={{
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(31,36,48,.92)',
              color: '#f9fafb',
              fontFamily: UI,
              fontSize: 11.5,
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => state.url && api.openExternal(state.url)}
              style={{
                cursor: 'pointer',
                border: 'none',
                background: '#e5e7eb',
                color: INK,
                borderRadius: 6,
                padding: '3px 8px',
                fontFamily: UI,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              系统浏览器打开
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function placeInspectorBrowser(ctx: {
  slots: {
    place: (
      name: string,
      Component: (props: Record<string, unknown>) => unknown,
      options?: { key?: string; order?: number; props?: () => Record<string, unknown> },
    ) => { dispose?: () => void }
  }
  get: (name: string) => unknown
}) {
  ctx.slots.place('inspector-panels', BrowserPanel, {
    key: 'browser',
    order: 60,
    props: () => ({
      tabId: BROWSER_TAB_ID,
      tabLabel: '浏览器',
      requiresSession: true,
      centerKinds: ['session'],
      pick: ctx.get('pick') as PickApi | undefined,
    }),
  })
}
