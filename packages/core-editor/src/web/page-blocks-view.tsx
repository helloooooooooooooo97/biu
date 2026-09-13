import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, RectangleGroupIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionViewType, FsContentProps, FsViewProps } from '@biu/type-file-system/ui'
import { PageBlockMissing } from './page-block-view.tsx'
import { bindPageBlockPlugin } from './page-block-plugin-host.ts'
import { getPageEditor, usePageEditorVersion } from './service.ts'

export const PAGE_BLOCKS_VIEW_ID = 'blocks'
export const PAGE_REVEAL_EVENT = 'biu:inspector-reveal'

export function parsePageBlockRowData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

async function writeBlockData(id: string, data: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/page-blocks/${id}`, content: { data } }),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  window.dispatchEvent(new Event('fsdb:change'))
}

export function openSourcePage(pageId: string) {
  const id = pageId.trim()
  if (!id) return
  window.dispatchEvent(
    new CustomEvent(PAGE_REVEAL_EVENT, {
      detail: { collection: '/pages', recordId: id, unique: true },
    }),
  )
}

export function pageLabelOf(row: DbRecord) {
  const title = String(row.pageTitle ?? '').trim()
  if (title) return title
  const id = String(row.pageId ?? '').trim()
  return id
}

export function PageBlockStage({
  row,
  raw,
  writable = true,
  onChange,
}: {
  row: DbRecord
  raw?: unknown
  writable?: boolean
  onChange?: (next: Record<string, unknown>) => void
}) {
  usePageEditorVersion()
  const kind = String(row.blockKind ?? row.kind ?? '').trim()
  const plugin = String(row.plugin ?? '').trim()
  const spec = getPageEditor()?.block(kind)
  const View = spec?.View
  const source = raw ?? row.data
  const packed = typeof source === 'string' ? source : JSON.stringify(source ?? {})
  const [data, setData] = useState(() => parsePageBlockRowData(source))
  useEffect(() => {
    setData(parsePageBlockRowData(source))
  }, [packed])
  const update = (patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const next = opts?.replace ? patch : { ...data, ...patch }
    setData(next)
    if (onChange) onChange(next)
    else void writeBlockData(String(row.id), next)
  }
  const hostRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => bindPageBlockPlugin(hostRef.current, plugin), [plugin, kind, View, packed])
  return (
    <div
      ref={hostRef}
      className="page-block"
      data-page-block={kind || undefined}
      data-page-block-plugin={plugin || undefined}
      data-page-block-id={String(row.blockId ?? '') || undefined}
      data-biu-plugin={plugin || undefined}
      data-biu-kind={plugin ? 'plugin' : undefined}
      data-biu-id={plugin || undefined}
      data-biu-label={spec?.label || kind || undefined}
      data-testid="page-block-stage"
    >
      {View ? (
        <View data={data} update={update} writable={writable} />
      ) : (
        <PageBlockMissing kind={kind || 'unknown'} plugin={plugin} data={data} />
      )}
    </div>
  )
}

export function PageBlockContent({ record, value, writable, onChange }: FsContentProps) {
  return (
    <div className="page-editor page-blocks-view page-blocks-detail" data-testid="page-blocks-detail">
      <PageBlockStage
        row={record}
        raw={value ?? record.data}
        writable={writable}
        onChange={(next) => onChange?.(next)}
      />
    </div>
  )
}

function BlockCard({
  row,
  zoomed,
  onOpen,
  onZoom,
}: {
  row: DbRecord
  zoomed: boolean
  onOpen: (row: DbRecord) => void
  onZoom: (row: DbRecord | null) => void
}) {
  usePageEditorVersion()
  const kind = String(row.blockKind ?? row.kind ?? '').trim()
  const spec = getPageEditor()?.block(kind)
  const title = String(row.title ?? spec?.label ?? kind)
  const pageId = String(row.pageId ?? '').trim()
  const pageLabel = pageLabelOf(row)
  const kindLabel = spec?.label || kind

  useEffect(() => {
    if (!zoomed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onZoom(null)
    }
    window.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zoomed, onZoom])

  return (
    <article
      className={`page-blocks-view-card${zoomed ? ' is-zoomed' : ''}`}
      data-testid="page-blocks-view-card"
    >
      <div className="page-blocks-view-head">
        <button type="button" className="page-blocks-view-title" onClick={() => onOpen(row)} title="打开组件">
          {title}
        </button>
        <div className="page-blocks-view-meta">
          {kindLabel && kindLabel !== title ? (
            <span className="page-blocks-view-kind">{kindLabel}</span>
          ) : null}
          {pageId ? (
            <button
              type="button"
              className="page-blocks-view-page"
              data-testid="page-blocks-view-page"
              title="打开来源页面"
              onClick={() => openSourcePage(pageId)}
            >
              {pageLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="page-blocks-view-zoom"
            data-testid="page-blocks-view-zoom"
            aria-label={zoomed ? '退出放大' : '放大'}
            title={zoomed ? '退出放大' : '放大'}
            onClick={() => onZoom(zoomed ? null : row)}
          >
            {zoomed ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />}
          </button>
        </div>
      </div>
      <PageBlockStage row={row} />
    </article>
  )
}

export function PageBlocksView({ rows, onOpen }: FsViewProps) {
  usePageEditorVersion()
  const [zoomId, setZoomId] = useState<string | null>(null)
  const onZoom = useCallback((next: DbRecord | null) => setZoomId(next?.id ?? null), [])
  if (!rows.length) return <p className="fsdb-empty">暂无组件</p>
  const zoomed = zoomId ? rows.find((row) => row.id === zoomId) : undefined
  return (
    <div className={`page-editor page-blocks-view${zoomed ? ' is-zooming' : ''}`} data-testid="page-blocks-view">
      {zoomed ? (
        <button
          type="button"
          className="page-blocks-view-scrim"
          aria-label="退出放大"
          onClick={() => setZoomId(null)}
        />
      ) : null}
      {rows.map((row) => (
        <BlockCard
          key={row.id}
          row={row}
          zoomed={row.id === zoomId}
          onOpen={onOpen}
          onZoom={onZoom}
        />
      ))}
    </div>
  )
}

export const pageBlocksCollectionView: CollectionViewType = {
  id: PAGE_BLOCKS_VIEW_ID,
  label: '组件',
  plugin: 'core-editor-ui',
  Icon: RectangleGroupIcon,
  View: PageBlocksView,
}
