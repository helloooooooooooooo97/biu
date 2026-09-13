import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowsPointingOutIcon, RectangleGroupIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
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

export function mergeLiveBlockData(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  opts?: { replace?: boolean; title?: string },
) {
  const next = opts?.replace ? { ...patch } : { ...current, ...patch }
  const title = typeof opts?.title === 'string' ? opts.title.trim() : ''
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) return next
  if (title) next.title = title
  else delete next.title
  return next
}

export function persistBlockDataPatch(data: Record<string, unknown>, patch: Record<string, unknown>) {
  const out = { ...data }
  if (!Object.prototype.hasOwnProperty.call(patch, 'title')) delete out.title
  return out
}

async function writeBlockTitle(id: string, title: string) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/page-blocks/${id}`, content: { title } }),
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

export function openBlockInInspector(blockId: string) {
  const id = blockId.trim()
  if (!id) return
  window.dispatchEvent(
    new CustomEvent(PAGE_REVEAL_EVENT, {
      detail: { collection: '/page-blocks', recordId: id, unique: true },
    }),
  )
}

export function pageNameFromRecord(row: DbRecord | undefined, pageId: string) {
  if (!row) return ''
  for (const key of ['title', 'name', 'label'] as const) {
    const value = row[key]
    if (value != null && String(value).trim() && String(value).trim() !== pageId) return String(value).trim()
  }
  return ''
}

export function pageLabelOf(row: DbRecord, resolved?: string) {
  const pageId = String(row.pageId ?? '').trim()
  const indexed = String(row.pageTitle ?? '').trim()
  if (indexed && indexed !== pageId) return indexed
  if (resolved && resolved !== pageId) return resolved
  return ''
}

async function readPageName(pageId: string) {
  const res = await fetch(`/api/db/read?path=${encodeURIComponent(`/pages/${pageId}`)}`)
  const body = (await res.json()) as { value?: DbRecord }
  return pageNameFromRecord(body.value, pageId)
}

function usePageNames(ids: string[]) {
  const key = [...new Set(ids.filter(Boolean))].sort().join('\0')
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!key) {
      setNames({})
      return
    }
    let cancelled = false
    const unique = key.split('\0')
    void Promise.all(
      unique.map(async (id) => {
        try {
          return [id, await readPageName(id)] as const
        } catch {
          return [id, ''] as const
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [id, name] of pairs) next[id] = name
      setNames(next)
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return names
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
  const recordTitle = String(row.title ?? '').trim()
  const [data, setData] = useState(() => {
    const parsed = parsePageBlockRowData(source)
    if (recordTitle) parsed.title = recordTitle
    return parsed
  })
  useEffect(() => {
    const parsed = parsePageBlockRowData(source)
    if (recordTitle) parsed.title = recordTitle
    setData(parsed)
  }, [packed, recordTitle])
  const update = (patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const next = mergeLiveBlockData(data, patch, { replace: opts?.replace, title: recordTitle })
    setData(next)
    const toWrite = persistBlockDataPatch(next, patch)
    if (onChange) onChange(toWrite)
    else void writeBlockData(String(row.id), toWrite)
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
  pageName,
  onOpen,
}: {
  row: DbRecord
  pageName: string
  onOpen: (row: DbRecord) => void
}) {
  usePageEditorVersion()
  const kind = String(row.blockKind ?? row.kind ?? '').trim()
  const spec = getPageEditor()?.block(kind)
  const title = String(row.title ?? spec?.label ?? kind)
  const [draft, setDraft] = useState(title)
  useEffect(() => {
    setDraft(title)
  }, [title])
  const pageId = String(row.pageId ?? '').trim()
  const pageLabel = pageLabelOf(row, pageName)
  const kindLabel = spec?.label || kind

  const commitTitle = (raw: string) => {
    const next = raw.trim()
    if (!next || next === title) return
    void writeBlockTitle(String(row.id), next)
  }

  return (
    <article className="page-blocks-view-card" data-testid="page-blocks-view-card">
      <div className="page-blocks-view-head">
        <input
          className="page-blocks-view-title"
          data-testid="page-blocks-view-title"
          value={draft}
          aria-label="组件标题"
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            if (event.nativeEvent.isComposing) return
            commitTitle(next)
          }}
          onCompositionEnd={(event) => commitTitle((event.target as HTMLInputElement).value)}
          onBlur={() => commitTitle(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          }}
        />
        <div className="page-blocks-view-meta">
          {kindLabel && kindLabel !== title ? (
            <span className="page-blocks-view-kind">{kindLabel}</span>
          ) : null}
          {pageId ? (
            <button
              type="button"
              className="page-blocks-view-page"
              data-testid="page-blocks-view-page"
              title={pageLabel ? `打开来源页面 ${pageLabel}` : '打开来源页面'}
              onClick={() => openSourcePage(pageId)}
            >
              {pageLabel || '…'}
            </button>
          ) : null}
          <button
            type="button"
            className="page-blocks-view-open"
            data-testid="page-blocks-view-inspector"
            aria-label="在右侧打开"
            title="在右侧打开"
            onClick={() => openBlockInInspector(String(row.id))}
          >
            <ViewColumnsIcon />
          </button>
          <button
            type="button"
            className="page-blocks-view-zoom"
            data-testid="page-blocks-view-zoom"
            aria-label="查看详情"
            title="查看详情"
            onClick={() => onOpen(row)}
          >
            <ArrowsPointingOutIcon />
          </button>
        </div>
      </div>
      <PageBlockStage row={row} />
    </article>
  )
}

export function PageBlocksView({ rows, onOpen }: FsViewProps) {
  usePageEditorVersion()
  const pageIds = rows.map((row) => String(row.pageId ?? '').trim())
  const pageNames = usePageNames(pageIds)
  if (!rows.length) return <p className="fsdb-empty">暂无组件</p>
  return (
    <div className="page-editor page-blocks-view" data-testid="page-blocks-view">
      {rows.map((row) => (
        <BlockCard
          key={row.id}
          row={row}
          pageName={pageNames[String(row.pageId ?? '').trim()] ?? ''}
          onOpen={onOpen}
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
