import { createPortal } from 'react-dom'
import { BLOCKED_HINT, BOOKMARKS, normalizeUrl } from './url.ts'
import { openSidebarBrowser } from './open.ts'
import { placeInspectorBrowser } from './panel.tsx'
import { makeOverlay, relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-browser'
export const inject = ['pageEditor', 'slots', 'pick']

const UI = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
const BAR = '#f2f3f5'
const BORDER = 'rgba(15,23,42,.14)'
const INK = '#1f2430'

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 160 ? Math.round(n) : 420
}

/* ---------------- 图标 ---------------- */

function Icon({ id }: { id: 'back' | 'reload' | 'open' | 'expand' | 'shrink' }) {
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true }
  if (id === 'back')
    return (
      <svg {...common}>
        <path d="M7.03 3.03a.75.75 0 0 0-1.06-1.06l-4.5 4.5a.75.75 0 0 0 0 1.06l4.5 4.5a.75.75 0 1 0 1.06-1.06L3.81 7.75H10a3.25 3.25 0 0 1 3.25 3.25v1.25a.75.75 0 0 0 1.5 0V11A4.75 4.75 0 0 0 10 6.25H3.81l3.22-3.22Z" />
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
  if (id === 'expand')
    return (
      <svg {...common}>
        <path d="M9 2h5v5h-1.5V4.56L8.78 8.28 7.72 7.22 11.44 3.5H9V2ZM2 9h1.5v2.44l3.72-3.72 1.06 1.06L4.56 12.5H7V14H2V9Z" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M6 2h1.6v3.4H11V7H6V2Zm4 12H8.4V10.6H5V9h5v5Z" />
    </svg>
  )
}

/* ---------------- 浏览器界面 ---------------- */

function BrowserSurface({
  data,
  update,
  zoomed,
  onZoom,
  onClose,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  zoomed: boolean
  onZoom: () => void
  onClose?: () => void
}) {
  const [addr, setAddr] = useState(String(data.url ?? ''))
  const [src, setSrc] = useState(normalizeUrl(String(data.url ?? '')))
  const [nonce, setNonce] = useState(0)
  const [notice, setNotice] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const url = String(data.url ?? '')

  useEffect(() => {
    setAddr(url)
    setSrc(normalizeUrl(url))
    setNotice('')
  }, [url])

  // 加载 7 秒还没 onLoad 通常就是被站点拒嵌了
  useEffect(() => {
    if (!src) return
    setNotice('')
    const id = window.setTimeout(() => setNotice(BLOCKED_HINT), 7000)
    return () => window.clearTimeout(id)
  }, [src, nonce])

  const go = (raw: string) => {
    const next = normalizeUrl(raw)
    if (!next) {
      setNotice('输入链接或搜索词')
      return
    }
    window.clearTimeout(timer.current)
    setNotice('')
    setAddr(next)
    update({ url: next })
    if (next === src) setNonce((n) => n + 1)
    else setSrc(next)
  }

  const iconBtn: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: '#4b5563',
    padding: '4px 5px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div
      data-testid="page-browser-surface"
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: zoomed ? 'none' : `1px solid ${BORDER}`,
        borderRadius: zoomed ? 0 : 10,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        data-biu-ignore
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: BAR,
          borderBottom: `1px solid ${BORDER}`,
          fontFamily: UI,
        }}
      >
        {zoomed ? null : (
          <button
            type="button"
            tabIndex={-1}
            title="回到起始页"
            aria-label="回到起始页"
            style={iconBtn}
            onClick={() => {
              setSrc('')
              setAddr('')
              setNotice('')
              update({ url: '' })
            }}
          >
            <Icon id="back" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          title="刷新"
          aria-label="刷新"
          style={iconBtn}
          onClick={() => setNonce((n) => n + 1)}
        >
          <Icon id="reload" />
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            go(addr)
          }}
          style={{ flex: 1, minWidth: 0, display: 'flex' }}
        >
          <input
            data-testid="page-browser-addr"
            data-page-block-capture=""
            spellCheck={false}
            value={addr}
            placeholder="链接或搜索词"
            aria-label="地址"
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => setAddr(event.currentTarget.value)}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: UI,
              fontSize: 12.5,
              color: INK,
              background: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 999,
              padding: '5px 12px',
              outline: 'none',
            }}
          />
        </form>
        <button
          type="button"
          tabIndex={-1}
          data-testid="page-browser-go"
          title="访问"
          aria-label="访问"
          style={{ ...iconBtn, color: '#1d4ed8' }}
          onClick={() => go(addr)}
        >
          前往
        </button>
        {src ? (
          <button
            type="button"
            tabIndex={-1}
            title="在侧栏浏览器打开"
            aria-label="在侧栏浏览器打开"
            style={iconBtn}
            onClick={() => src && openSidebarBrowser(src)}
          >
            <Icon id="open" />
          </button>
        ) : null}
        {zoomed ? (
          <button
            type="button"
            tabIndex={-1}
            data-testid="page-browser-shrink"
            title="退出放大"
            aria-label="退出放大"
            style={iconBtn}
            onClick={() => onClose?.()}
          >
            <Icon id="shrink" />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            data-testid="page-browser-zoom"
            title="放大浏览器"
            aria-label="放大浏览器"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onZoom}
            style={iconBtn}
          >
            <Icon id="expand" />
          </button>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fff' }}>
        {src ? (
          <iframe
            key={`${src}-${nonce}`}
            data-testid="page-browser-frame"
            title={src}
            src={src}
            onLoad={() => setNotice('')}
            loading="eager"
            referrerPolicy="no-referrer"
            allow="fullscreen; clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            style={{ display: 'block', width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              fontFamily: UI,
              color: '#6b7280',
              background: 'linear-gradient(180deg,#fbfbfd,#f2f3f5)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>输入链接开始浏览</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
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
                    background: '#fff',
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
        )}
        {notice ? (
          <div
            data-testid="page-browser-notice"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
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
            <span>{notice}</span>
            {src ? (
              <button
                type="button"
                onClick={() => src && openSidebarBrowser(src)}
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
                侧栏打开
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------- 页面块 ---------------- */

function BrowserCard({
  data,
  update,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const [zoom, setZoom] = useState(false)
  const height = blockHeight(data)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!zoom) {
      setOverlayEl(null)
      return
    }
    const host = hostRef.current
    if (host) unlockAncestors(host)
    const el = makeOverlay('page-browser-zoom-host', '#fff')
    setOverlayEl(el)
    const stop = watchZoom(() => setZoom(false), el)
    return () => {
      stop()
      el.remove()
      relockAncestors()
      setOverlayEl(null)
    }
  }, [zoom])

  const surface = (zoomed: boolean) => (
    <BrowserSurface data={data} update={update} zoomed={zoomed} onZoom={() => setZoom(true)} onClose={() => setZoom(false)} />
  )

  return (
    <div
      ref={hostRef}
      data-testid="page-browser"
      style={{ position: 'relative', width: '100%', height, display: 'flex' }}
    >
      {surface(false)}
      {overlayEl ? createPortal(surface(true), overlayEl) : null}
    </div>
  )
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
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: {
        data: Record<string, unknown>
        update: (patch: Record<string, unknown>) => void
        writable: boolean
      }) => unknown
    }) => void
  }
  slots: {
    place: (
      name: string,
      Component: (props: Record<string, unknown>) => unknown,
      options?: { key?: string; order?: number; props?: () => Record<string, unknown> },
    ) => { dispose?: () => void }
  }
  get: (name: string) => unknown
}) {
  placeInspectorBrowser(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'browser',
    plugin: name,
    label: '浏览器',
    blockType: 'browser',
    blockTypeLabel: '浏览器',
    hint: '输入链接就能访问的网页卡片；禁嵌站点点跳转会进右侧栏真浏览器',
    aliases: ['browser', 'web', '浏览器', '网页', '网址', 'url', '链接'],
    assets: [],
    defaults: () => ({ url: 'https://example.com', height: 420 }),
    View: BrowserCard,
  })
}
