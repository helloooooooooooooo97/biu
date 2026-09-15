import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export const name = 'page-excalidraw'
export const inject = ['pageEditor']

type PageEditor = {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: () => Record<string, unknown>
      View: (props: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
}

type Scene = {
  elements?: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

type DrawApi = {
  refresh: () => void
  scrollToContent?: (target?: unknown, opts?: { fitToContent?: boolean; animate?: boolean }) => void
  updateScene?: (data: {
    elements?: unknown
    appState?: Record<string, unknown>
    captureUpdate?: unknown
  }) => void
  addFiles?: (files: unknown[]) => void
}

function emptyScene(): Scene {
  return { elements: [], appState: { theme: 'dark', showWelcomeScreen: false }, files: {} }
}

function withoutCollab(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== 'object' || Array.isArray(appState)) return {}
  const { collaborators: _c, ...rest } = appState as Record<string, unknown>
  return rest
}

function parseScene(raw: unknown): Scene {
  if (!raw || typeof raw !== 'object') return emptyScene()
  const o = raw as Scene
  return {
    elements: Array.isArray(o.elements) ? o.elements : [],
    appState: withoutCollab(o.appState),
    files: o.files && typeof o.files === 'object' ? o.files : {},
  }
}

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

function assetStem(file: string) {
  return assetName(file).replace(/\.[^.]+$/, '')
}

function normalizeStem(raw: string, fallback: string) {
  const trimmed = raw.trim() || fallback
  const stem = trimmed.replace(/\.[^.]+$/, '')
  if (!stem || /[\\/]/.test(stem) || !/^[\p{L}\p{N}._-]+$/u.test(stem)) return fallback
  return stem
}

async function loadScene(file: string, bust = false): Promise<{ scene: Scene; etag: string }> {
  const name = assetName(file)
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}${bust ? `?t=${Date.now()}` : ''}`)
  if (res.status === 404) {
    const scene = emptyScene()
    const created = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene),
    })
    const etag = etagFromResponse(created)
    return { scene, etag }
  }
  if (!res.ok) return { scene: emptyScene(), etag: '' }
  try {
    return { scene: parseScene(JSON.parse(await res.text())), etag: etagFromResponse(res) }
  } catch {
    return { scene: emptyScene(), etag: etagFromResponse(res) }
  }
}

function etagFromResponse(res: Response) {
  return String(res.headers.get('etag') ?? '').replace(/^W\//, '').replaceAll('"', '')
}

async function saveScene(file: string, scene: Scene, etag: string) {
  const name = assetName(file)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (etag) headers['If-Match'] = `"${etag}"`
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(scene),
  })
  if (res.status === 409) return { ok: false as const, etag: etagFromResponse(res) }
  if (!res.ok) return { ok: false as const, etag }
  return { ok: true as const, etag: etagFromResponse(res) || etag }
}

function fitView(api: DrawApi | null) {
  if (!api) return
  api.refresh?.()
  api.scrollToContent?.(undefined, { fitToContent: true, animate: false })
}

const UI_OPTIONS = { canvasActions: { loadScene: false, saveToActiveFile: false } } as const

type Host = {
  file: string
  el: HTMLDivElement
  root: Root | null
  refs: number
  ready: Promise<Host>
  initialData: { elements: never; appState: Record<string, unknown>; files: never } | null
  lastScene: Scene | null
  etag: string
  pending: ReturnType<typeof setTimeout> | null
  quietUntil: number
  appliedEtag: string
  api: DrawApi | null
  expanded: boolean
  sync?: () => void
  onCollapse?: () => void
}

const hosts = new Map<string, Host>()
let syncQueued = false

function cancelPending(host: Host) {
  if (!host.pending) return
  clearTimeout(host.pending)
  host.pending = null
}

function sceneData(scene: Scene) {
  return {
    elements: (scene.elements ?? []) as never,
    appState: { ...withoutCollab(scene.appState), isLoading: false, showWelcomeScreen: false, collaborators: new Map() },
    files: (scene.files ?? {}) as never,
  }
}

function applyScene(host: Host, scene: Scene, etag: string) {
  if (etag && host.appliedEtag === etag) return
  host.etag = etag
  host.appliedEtag = etag
  host.lastScene = scene
  host.initialData = sceneData(scene)
  host.quietUntil = Date.now() + 1200
  const data = host.initialData
  if (host.api?.updateScene) {
    host.api.updateScene({
      elements: data.elements,
      appState: withoutCollab(scene.appState),
      captureUpdate: 'NEVER',
    })
    const files = scene.files && typeof scene.files === 'object' ? Object.values(scene.files) : []
    if (files.length) host.api.addFiles?.(files)
    return
  }
  paintHost(host)
}

async function reloadHost(file: string) {
  const host = hosts.get(file)
  if (!host) return
  cancelPending(host)
  const loaded = await loadScene(file, true)
  if (hosts.get(file) !== host) return
  applyScene(host, loaded.scene, loaded.etag)
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:asset-changed', ((event: Event) => {
    const detail = (event as CustomEvent<{ name?: string; etag?: string }>).detail
    const name = String(detail?.name ?? '')
    if (!name) return
    for (const [file, host] of hosts) {
      if (assetName(file) !== name && file !== name) continue
      if (Date.now() < host.quietUntil) continue
      if (detail?.etag && (host.appliedEtag === detail.etag || host.etag === detail.etag)) continue
      cancelPending(host)
      void reloadHost(file)
    }
  }) as EventListener)
}

function queueHostSync() {
  if (syncQueued) return
  syncQueued = true
  requestAnimationFrame(() => {
    syncQueued = false
    for (const host of hosts.values()) host.sync?.()
  })
}

/** 卸下或卸载时先藏起来再挂到 body，避免 inset:0 铺满视口闪一下全屏。 */
function parkHost(host: Host) {
  host.expanded = false
  const el = host.el
  el.style.cssText =
    'position:fixed;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;inset:auto'
  if (el.parentElement !== document.body) document.body.appendChild(el)
}

function placeHost(host: Host, slot: HTMLElement | null) {
  const el = host.el
  if (host.expanded) {
    if (el.parentElement !== document.body) document.body.appendChild(el)
    el.style.cssText =
      'position:fixed;top:36px;left:0;right:0;bottom:0;width:auto;height:auto;z-index:9992;pointer-events:auto;visibility:visible;overflow:hidden;isolation:isolate;background:var(--dsw-bg,#191919)'
    return
  }
  if (!slot?.isConnected) {
    parkHost(host)
    return
  }
  if (el.parentElement !== slot) slot.appendChild(el)
  el.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;visibility:visible;overflow:hidden;isolation:isolate;background:var(--dsw-bg)'
}

function paintHost(host: Host) {
  if (!host.root || !host.initialData) return
  host.root.render(
    <PersistentDraw file={host.file} initialData={host.initialData} expanded={host.expanded} />,
  )
}

function retainHost(file: string) {
  const current = hosts.get(file)
  if (current) {
    current.refs += 1
    return current
  }
  const el = document.createElement('div')
  el.dataset.excalidrawHost = file
  document.body.appendChild(el)
  const host: Host = {
    file,
    el,
    root: null,
    refs: 1,
    ready: Promise.resolve(null as unknown as Host),
    initialData: null,
    lastScene: null,
    etag: '',
    pending: null,
    quietUntil: 0,
    appliedEtag: '',
    api: null,
    expanded: false,
  }
  host.ready = loadScene(file).then((loaded) => {
    if (hosts.get(file) !== host) return host
    const scene = loaded.scene
    host.etag = loaded.etag
    host.appliedEtag = loaded.etag
    host.quietUntil = Date.now() + 1200
    host.initialData = sceneData(scene)
    host.lastScene = scene
    host.root = createRoot(el)
    paintHost(host)
    return host
  })
  hosts.set(file, host)
  if (hosts.size === 1) {
    window.addEventListener('scroll', queueHostSync, true)
    window.addEventListener('resize', queueHostSync)
  }
  return host
}

function releaseHost(file: string) {
  const host = hosts.get(file)
  if (!host) return
  host.refs -= 1
  if (host.refs > 0) return
  queueMicrotask(() => {
    if (host.refs > 0) return
    host.root?.unmount()
    host.el.remove()
    hosts.delete(file)
    if (!hosts.size) {
      window.removeEventListener('scroll', queueHostSync, true)
      window.removeEventListener('resize', queueHostSync)
    }
  })
}

function PersistentDraw(props: {
  file: string
  initialData: NonNullable<Host['initialData']>
  expanded: boolean
}) {
  const file = props.file
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')
  const etagRef = useRef(hosts.get(file)?.etag ?? '')
  const apiRef = useRef<DrawApi | null>(null)
  const bindApi = useCallback((api: DrawApi | null) => {
    apiRef.current = api
    const hosted = hosts.get(file)
    if (hosted) hosted.api = api
  }, [file])
  const onChange = useCallback((elements: unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (!file) return
    const next: Scene = {
      elements,
      appState: withoutCollab(appState),
      files,
    }
    const raw = JSON.stringify(next)
    const hosted = hosts.get(file)
    if (hosted) {
      etagRef.current = hosted.etag
      hosted.lastScene = next
    }
    if (hosted && Date.now() < hosted.quietUntil) {
      lastSaved.current = raw
      return
    }
    if (raw === lastSaved.current) return
    lastSaved.current = raw
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      const hostedNow = hosts.get(file)
      if (hostedNow) hostedNow.pending = null
      void saveScene(file, next, etagRef.current).then((result) => {
        if (result.ok) {
          etagRef.current = result.etag
          const live = hosts.get(file)
          if (live) {
            live.etag = result.etag
            live.appliedEtag = result.etag
            live.quietUntil = Date.now() + 1200
          }
          return
        }
        void reloadHost(file)
      })
    }, 400)
    const hostedPending = hosts.get(file)
    if (hostedPending) hostedPending.pending = pending.current
  }, [file])

  useEffect(() => {
    if (!props.expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hosts.get(props.file)?.onCollapse?.()
    }
    window.addEventListener('keydown', onKey)
    const id = requestAnimationFrame(() => fitView(apiRef.current))
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
    }
  }, [props.expanded, props.file])

  return (
    <div style={{ height: '100%', width: '100%', isolation: 'isolate', overflow: 'hidden' }}>
      <Excalidraw
        theme="dark"
        initialData={props.initialData as never}
        viewModeEnabled={false}
        zenModeEnabled={!props.expanded}
        UIOptions={UI_OPTIONS as never}
        onChange={onChange as never}
        excalidrawAPI={bindApi as never}
      />
    </div>
  )
}

const BAR: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 36,
  padding: '0 8px',
  background: 'var(--dsw-sidebar)',
  borderBottom: '1px solid var(--dsw-border)',
  color: 'var(--dsw-label-2)',
  fontSize: 12,
}

const ICON_BTN: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: 28,
  height: 28,
  margin: 0,
  padding: 0,
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--dsw-label-2)',
  cursor: 'pointer',
}

function Glyph(props: { d: string; evenodd?: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d={props.d} fillRule={props.evenodd ? 'evenodd' : undefined} clipRule={props.evenodd ? 'evenodd' : undefined} />
    </svg>
  )
}

function BoardBar(props: {
  file: string
  expanded: boolean
  writable: boolean
  onToggle: () => void
  onRename: (name: string) => void
}) {
  const [draft, setDraft] = useState(assetStem(props.file))
  useEffect(() => {
    setDraft(assetStem(props.file))
  }, [props.file])

  const commit = () => {
    const next = normalizeStem(draft, assetStem(props.file))
    setDraft(next)
    if (next === assetStem(props.file)) return
    props.onRename(`${next}.json`)
  }

  return (
    <div style={BAR}>
      <span style={{ display: 'inline-flex', color: 'var(--dsw-label)' }} title="画板">
        <Glyph
          evenodd
          d="M2 12V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Zm1.5-5.5V12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V6.5A.5.5 0 0 0 12 6H4a.5.5 0 0 0-.5.5Zm.75-1.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM7 4a.75.75 0 1 1-1.5 0A.75.75 0 0 1 7 4Zm1.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
        />
      </span>
      <input
        data-page-block-capture=""
        style={{
          minWidth: 0,
          flex: 1,
          height: 28,
          margin: 0,
          border: 0,
          borderRadius: 8,
          padding: '0 8px',
          background: 'transparent',
          color: 'var(--dsw-label)',
          font: 'inherit',
          textAlign: 'center',
          outline: 'none',
        }}
        value={draft}
        disabled={!props.writable}
        aria-label="画板名称"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(event.target as HTMLInputElement).blur()
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        data-page-block-expand=""
        style={ICON_BTN}
        title={props.expanded ? '缩小' : '放大'}
        aria-label={props.expanded ? '缩小' : '放大'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={props.onToggle}
      >
        {props.expanded ? (
          <Glyph
            evenodd
            d="M2.22 2.22a.75.75 0 0 1 1.06 0L5.5 4.44V2.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5h1.69L2.22 3.28a.75.75 0 0 1 0-1.06Zm10.5 0a.75.75 0 1 1 1.06 1.06L11.56 5.5h1.69a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 9 6.25v-3.5a.75.75 0 0 1 1.5 0v1.69l2.22-2.22ZM2.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-1.69l-2.22 2.22a.75.75 0 0 1-1.06-1.06l2.22-2.22H2.75a.75.75 0 0 1 0-1.5ZM9 9.75A.75.75 0 0 1 9.75 9h3.5a.75.75 0 0 1 0 1.5h-1.69l2.22 2.22a.75.75 0 1 1-1.06 1.06l-2.22-2.22v1.69a.75.75 0 0 1-1.5 0v-3.5Z"
          />
        ) : (
          <Glyph
            evenodd
            d="M2.75 9a.75.75 0 0 1 .75.75v1.69l2.22-2.22a.75.75 0 0 1 1.06 1.06L4.56 12.5h1.69a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-3.5A.75.75 0 0 1 2.75 9ZM2.75 7a.75.75 0 0 0 .75-.75V4.56l2.22 2.22a.75.75 0 0 0 1.06-1.06L4.56 3.5h1.69a.75.75 0 0 0 0-1.5h-3.5a.75.75 0 0 0-.75.75v3.5c0 .414.336.75.75.75ZM13.25 9a.75.75 0 0 0-.75.75v1.69l-2.22-2.22a.75.75 0 1 0-1.06 1.06l2.22 2.22H9.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 0-.75-.75ZM13.25 7a.75.75 0 0 1-.75-.75V4.56l-2.22 2.22a.75.75 0 1 1-1.06-1.06l2.22-2.22H9.75a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75Z"
          />
        )}
      </button>
    </div>
  )
}

function Board(props: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void; writable: boolean }) {
  const file = String(props.data.file || '')
  const [expanded, setExpanded] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) {
      props.update({ file: `assets/画板-${crypto.randomUUID().slice(0, 8)}.json` })
    }
  }, [file])

  useLayoutEffect(() => {
    if (!file) return
    retainHost(file)
    return () => {
      const host = hosts.get(file)
      if (host) parkHost(host)
      releaseHost(file)
    }
  }, [file])

  useLayoutEffect(() => {
    if (!file) return
    const host = hosts.get(file)
    if (!host) return
    host.expanded = expanded
    host.onCollapse = () => setExpanded(false)
    host.sync = () => {
      host.expanded = expanded
      placeHost(host, slotRef.current)
    }
    void host.ready.then(() => {
      if (hosts.get(file) !== host) return
      paintHost(host)
      host.sync?.()
    })
    host.sync()
    return () => {
      if (host.onCollapse) host.onCollapse = undefined
      if (host.sync) host.sync = undefined
    }
  }, [file, expanded])

  const onRename = (name: string) => {
    const nextFile = `assets/${name}`
    const hosted = hosts.get(file)
    const scene = hosted?.lastScene
    if (scene) void saveScene(nextFile, scene, '')
    props.update({ file: nextFile })
  }

  if (!file) return <div className="text-sm text-[var(--muted-foreground)]">正在创建画板文件…</div>

  return (
    <div style={{ overflow: 'hidden', background: 'var(--dsw-bg)', borderRadius: 8 }}>
      <BoardBar
        file={file}
        expanded={expanded}
        writable={props.writable}
        onToggle={() => setExpanded((v) => !v)}
        onRename={onRename}
      />
      <div ref={slotRef} style={{ position: 'relative', height: 280 }} />
      {expanded
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9993,
                pointerEvents: 'auto',
              }}
            >
              <BoardBar
                file={file}
                expanded={expanded}
                writable={props.writable}
                onToggle={() => setExpanded(false)}
                onRename={onRename}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function apply(ctx: { pageEditor: PageEditor }) {
  ctx.pageEditor.registerBlock({
    kind: 'excalidraw',
    plugin: name,
    label: '画板',
    blockType: 'excalidraw',
    blockTypeLabel: '画板',
    hint: '手绘白板，放大后编辑',
    aliases: ['excalidraw', 'draw', '白板', '画板', 'board'],
    defaults: () => ({ file: `assets/画板-${crypto.randomUUID().slice(0, 8)}.json` }),
    View: Board,
  })
}
