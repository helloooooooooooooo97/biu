import { memo, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChatCount, RecordEmojiBoard, SidebarFold } from '@biu/public-ui'
import {
  ChevronDoubleLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  PlusIcon,
  ShareIcon,
  Squares2X2Icon,
  StarIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { CollectionInfo, CollectionSchema, DbRecord } from '@biu/type-file-system'
import { groupField, groupRecords, parentFieldKey, treeChildren } from './fields.ts'
import { builtinAllViewId } from '../catalog-views.ts'
import { isRecordTreeCollection, isSystemCollection, sortDataCollections } from './database-path.ts'
import { readJson } from './db-client.ts'
import { viewsForRegisteredCollection } from './collection-nav.ts'
import type { SavedView } from './saved-view.ts'
import {
  fetchViewPreview,
  fetchViewTotal,
  getPreviewTotal,
  getPreviewTotalsVersion,
  nextPreviewLimit,
  previewCacheKey,
  recordPreviewEmoji,
  recordPreviewLabel,
  rememberPreviewTotal,
  SIDEBAR_PREVIEW_MAX,
  subscribePreviewTotals,
  viewTotalKey,
  writeRecordEmoji,
} from './sidebar-preview.ts'
import {
  activeViewStorageKey,
  getStarredRecords,
  getStarredRecordsVersion,
  getStarredViews,
  getStarredViewsVersion,
  isRecordStarred,
  isViewStarred,
  loadViews,
  peekRecord,
  persistStarredRecords,
  persistStarredViews,
  rememberRecords,
  starredRecordEmoji,
  starredRecordLabel,
  subscribeStarredRecords,
  subscribeStarredViews,
  toggleStarredRecord,
  toggleStarredView,
  withViewDisplay,
} from './view-storage.ts'
import { pickDomAttrs, recordPickKind, viewPickId } from './pick-dom.ts'
import { toggleExpandedViewKey } from './sidebar-nav.ts'
import { TableGlyph, ViewModeGlyph } from './nav-glyphs.tsx'
import { getDatabaseUi } from './database-ui.ts'
import { RecordMark, recordMarkStub } from './record-mark.tsx'
import { SidebarBrandLockup } from '@biu/public-mascot'

type PreviewState = {
  items: DbRecord[]
  total: number
  schema?: CollectionSchema
  loading: boolean
  error: string
}

type PreviewCache = { items: DbRecord[]; total: number; schema?: CollectionSchema }

type SidebarShare = {
  token: string
  kind: 'view' | 'record'
  collection: string
  viewId: string
  recordId: string
  title: string
}

const previewCache = new Map<string, PreviewCache>()

function cachedDirectKidCount(path: string, recordId: string) {
  for (const [key, cache] of previewCache) {
    if (!key.startsWith(`${path}\0`)) continue
    const parentKey = parentFieldKey(cache.schema, cache.items) ?? 'parentId'
    return treeChildren(cache.items, parentKey, recordId).length
  }
  return 0
}

function ViewRecordPreview({
  path,
  view,
  open,
  recordKind,
  tableIcon,
  rootId,
  onOpenRecord,
}: {
  path: string
  view: SavedView
  open: boolean
  recordKind: string
  tableIcon?: string
  rootId?: string
  onOpenRecord?: (recordId: string, row?: DbRecord) => void
}) {
  const key = previewCacheKey(path, view)
  const cached = previewCache.get(key)
  const [state, setState] = useState<PreviewState>(() => ({
    items: cached?.items ?? [],
    total: cached?.total ?? 0,
    schema: cached?.schema,
    loading: !cached,
    error: '',
  }))
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({})
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
  const chromeIcon = getDatabaseUi()?.chrome(path).Icon
  const nested = isRecordTreeCollection(path)
  useSyncExternalStore(subscribeStarredRecords, getStarredRecordsVersion, () => 0)
  const starredRecords = getStarredRecords()

  useEffect(() => {
    if (!open) return
    const hit = previewCache.get(key)
    if (hit) {
      setState({ items: hit.items, total: hit.total, schema: hit.schema, loading: false, error: '' })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    void fetchViewPreview(path, view, 0).then(
      (page) => {
        if (cancelled) return
        previewCache.set(key, { items: page.items, total: page.total, schema: page.schema })
        rememberPreviewTotal(key, page.total)
        setState({ items: page.items, total: page.total, schema: page.schema, loading: false, error: '' })
      },
      (err: unknown) => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: String(err) }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, open, path, view.query, view.sortField, view.sortDir, view.filters, view.groupBy])

  async function loadMore() {
    const more = nextPreviewLimit(state.items.length, state.total)
    if (!more || state.loading) return
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const page = await fetchViewPreview(path, view, state.items.length, more)
      const items = [...state.items, ...page.items]
      const total = page.total
      const schema = page.schema ?? state.schema
      previewCache.set(key, { items, total, schema })
      rememberPreviewTotal(key, total)
      setState({ items, total, schema, loading: false, error: '' })
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: String(err) }))
    }
  }

  async function saveEmoji(row: DbRecord, next: string) {
    try {
      const emoji = await writeRecordEmoji(path, row.id, next)
      const items = state.items.map((item) => (item.id === row.id ? { ...item, emoji } : item))
      previewCache.set(key, { items, total: state.total, schema: state.schema })
      setState((prev) => ({ ...prev, items }))
      setPickerId(null)
      setPickerAnchor(null)
      window.dispatchEvent(new Event('fsdb:change'))
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }

  const remaining = Math.max(0, state.total - state.items.length)
  const capped = state.items.length >= SIDEBAR_PREVIEW_MAX && remaining > 0
  const grouping = Boolean(groupField(state.schema, view.groupBy))
  const buckets = useMemo(() => {
    if (!grouping) return null
    return groupRecords(state.items, state.schema, view.groupBy).filter((bucket) => bucket.rows.length)
  }, [grouping, state.items, state.schema, view.groupBy])
  const parentKey = nested ? parentFieldKey(state.schema, state.items) ?? 'parentId' : null

  function toggleKid(id: string) {
    setOpenKids((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleRecordStar(row: DbRecord) {
    const label = recordPreviewLabel(row)
    const emoji = recordPreviewEmoji(row)
    rememberRecords(path, [{ id: row.id, label, emoji }])
    persistStarredRecords(toggleStarredRecord(getStarredRecords(), path, row.id, { label, emoji }))
  }

  async function createChild(row: DbRecord) {
    if (!parentKey) return
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, records: [{ [parentKey]: row.id }] }),
      })
      const created = data.items?.[0]?.value
      const items = created ? [...state.items, created] : state.items
      const total = state.total + (created ? 1 : 0)
      previewCache.set(key, { items, total, schema: state.schema })
      rememberPreviewTotal(key, total)
      setState((prev) => ({ ...prev, items, total }))
      setOpenKids((prev) => ({ ...prev, [row.id]: true }))
      window.dispatchEvent(new Event('fsdb:change'))
      if (created?.id) onOpenRecord?.(created.id, created)
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }

  function recordFace(row: DbRecord) {
    const emoji = recordPreviewEmoji(row)
    return emoji ? <span className="fsdb-record-emoji">{emoji}</span> : <RecordMark record={row} tableIcon={tableIcon} Icon={chromeIcon} />
  }

  function emojiBoard(row: DbRecord) {
    if (pickerId !== row.id || !pickerAnchor) return null
    return (
      <RecordEmojiBoard
        anchor={pickerAnchor}
        onPick={(next) => void saveEmoji(row, next)}
        onClear={() => void saveEmoji(row, '')}
        onClose={() => {
          setPickerId(null)
          setPickerAnchor(null)
        }}
      />
    )
  }

  function openEmojiPicker(event: MouseEvent<HTMLElement>, row: DbRecord) {
    event.preventDefault()
    event.stopPropagation()
    const btn = event.currentTarget
    setPickerId((prev) => {
      if (prev === row.id) {
        setPickerAnchor(null)
        return null
      }
      setPickerAnchor(btn)
      return row.id
    })
  }

  function renderRecords(scope: DbRecord[], parentId = '') {
    const rows = parentKey ? treeChildren(scope, parentKey, parentId) : parentId ? [] : scope
    return rows.map((row) => {
      const label = recordPreviewLabel(row)
      const kids = parentKey ? treeChildren(scope, parentKey, row.id) : []
      const kidCount = kids.length
      const expanded = Boolean(openKids[row.id])
      const starred = isRecordStarred(starredRecords, path, row.id)
      if (!nested) {
        return (
          <div
            key={row.id}
            className="chat-session-row"
            role="listitem"
            {...pickDomAttrs(recordKind, row.id, label)}
          >
            <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
              <span className="fsdb-record-icon relative grid size-6 shrink-0 place-items-center">
                <button
                  type="button"
                  className="grid size-6 place-items-center border-0 bg-transparent p-0 text-[16px] leading-none text-inherit"
                  title={recordPreviewEmoji(row) ? '更换图标' : '设置图标'}
                  aria-label={recordPreviewEmoji(row) ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
                  onClick={(event) => openEmojiPicker(event, row)}
                >
                  {recordFace(row)}
                </button>
                {emojiBoard(row)}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                title={label}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenRecord?.(row.id, row)
                }}
              >
                {label}
              </button>
            </div>
          </div>
        )
      }
      return (
        <div key={row.id} className="min-w-0" role="listitem">
          <div
            className={`chat-session-row group${starred ? ' is-pinned' : ''}`}
            {...pickDomAttrs(recordKind, row.id, label)}
          >
            <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
              <button
                type="button"
                className="relative grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                title={expanded ? '收起子记录' : '展开子记录'}
                aria-expanded={expanded}
                onClick={() => toggleKid(row.id)}
                onContextMenu={(event) => openEmojiPicker(event, row)}
              >
                <span className="sidebar-rail-icon sidebar-group-fold">
                  <span className="sidebar-group-fold-face">{recordFace(row)}</span>
                  <span className="sidebar-group-fold-chevron">
                    {expanded ? (
                      <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                    ) : (
                      <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                    )}
                  </span>
                </span>
                {emojiBoard(row)}
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                title={label}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenRecord?.(row.id, row)
                }}
              >
                {label}
              </button>
            </div>
            <ChatCount count={kidCount} title={`${kidCount} 个子记录`} />
            <button
              type="button"
              className="sidebar-add"
              title={`在 ${label} 下添加子记录`}
              aria-label={`在 ${label} 下添加子记录`}
              onClick={(event) => {
                event.stopPropagation()
                void createChild(row)
              }}
            >
              <PlusIcon className="size-4 shrink-0" />
            </button>
            <button
              type="button"
              className={`chat-session-row-star${starred ? ' is-on' : ''}`}
              aria-pressed={starred}
              aria-label={starred ? `取消收藏 ${label}` : `收藏 ${label}`}
              title={starred ? '取消收藏' : '收藏'}
              onClick={(event) => {
                event.stopPropagation()
                toggleRecordStar(row)
              }}
            >
              <StarIcon className={`size-4 shrink-0${starred ? ' text-[#f5b700]' : ''}`} />
            </button>
          </div>
          <SidebarFold open={expanded}>
            <div className="fsdb-record-kids">{renderRecords(scope, row.id)}</div>
          </SidebarFold>
        </div>
      )
    })
  }

  const treeRoot = rootId || ''
  const listed = treeRoot
    ? renderRecords(state.items, treeRoot)
    : buckets?.length
      ? null
      : renderRecords(state.items)

  return (
    <div className="fsdb-view-preview" role="list">
      {listed}
      {!treeRoot && buckets?.length ? (
        buckets.map((bucket, index) => {
          const groupKey = bucket.key || 'unset'
          const expanded = openGroups[groupKey] ?? index === 0
          return (
            <div key={groupKey} className="min-w-0" data-testid="sidebar-view-group">
              <div className="chat-session-row fsdb-view-preview-group">
                <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                    title={expanded ? '收起分组' : '展开分组'}
                    aria-expanded={expanded}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [groupKey]: !expanded }))}
                  >
                    <span className="sidebar-rail-icon sidebar-group-fold">
                      <span className="sidebar-group-fold-face">
                        <Squares2X2Icon className="size-4 shrink-0" />
                      </span>
                      <span className="sidebar-group-fold-chevron">
                        {expanded ? (
                          <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                        ) : (
                          <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                    title={bucket.label}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [groupKey]: !expanded }))}
                  >
                    {bucket.label}
                  </button>
                </div>
                <ChatCount count={bucket.rows.length} />
              </div>
              <SidebarFold open={expanded}>
                <div className="fsdb-view-preview-records">{renderRecords(bucket.rows)}</div>
              </SidebarFold>
            </div>
          )
        })
      ) : null}
      {state.loading && !state.items.length ? (
        <div className="fsdb-view-preview-hint">加载中…</div>
      ) : null}
      {state.error ? <div className="fsdb-view-preview-hint">{state.error}</div> : null}
      {!treeRoot && !state.loading && !state.error && !state.items.length ? (
        <div className="fsdb-view-preview-hint">没有数据</div>
      ) : null}
      {!treeRoot && remaining > 0 && !capped ? (
        <button type="button" className="fsdb-view-preview-more" disabled={state.loading} onClick={() => void loadMore()}>
          {state.loading ? '加载中…' : `还有 ${remaining} 条 · 加载更多`}
        </button>
      ) : null}
      {!treeRoot && capped ? <div className="fsdb-view-preview-hint">侧栏最多预览 {SIDEBAR_PREVIEW_MAX} 条，完整数据在主区</div> : null}
    </div>
  )
}

function usePreviewTotalsVersion() {
  return useSyncExternalStore(subscribePreviewTotals, getPreviewTotalsVersion, () => 0)
}

export const DataSidebar = memo(function DataSidebar({
  tables,
  collectionPath,
  title,
  views,
  activeViewId,
  onOpenTable,
  onApplyView,
  onRenameView,
  onDeleteView,
  onAddView,
  onOpenRecord,
  expandedViewKey: expandedViewKeyProp,
  onExpandedViewKeyChange,
  onCollapse,
}: {
  tables: CollectionInfo[]
  collectionPath: string
  title: string
  views: SavedView[]
  activeViewId: string | null
  onOpenTable?: (path: string, viewId?: string) => void
  onApplyView: (view: SavedView) => void
  onRenameView: (view: SavedView) => void
  onDeleteView: (view: SavedView) => void
  onAddView: (path?: string) => void
  onOpenRecord?: (path: string, view: SavedView, recordId: string, row?: DbRecord) => void
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
  onCollapse?: () => void
}) {
  const listedTables = useMemo(() => {
    const raw = tables.length ? tables : ([{ path: collectionPath, label: title, view: { title } }] as CollectionInfo[])
    const { user, system } = sortDataCollections(raw)
    return [...user, ...system]
  }, [collectionPath, tables, title])
  const { user: userTables, system: systemTables } = useMemo(() => sortDataCollections(listedTables), [listedTables])
  const [openTables, setOpenTables] = useState<Record<string, boolean>>(() => ({ [collectionPath]: true }))
  useSyncExternalStore(subscribeStarredViews, getStarredViewsVersion, () => 0)
  useSyncExternalStore(subscribeStarredRecords, getStarredRecordsVersion, () => 0)
  const starredViews = getStarredViews()
  const starredRecords = getStarredRecords()
  const [shareOpen, setShareOpen] = useState(() => {
    try {
      return localStorage.getItem('fsdb.shareOpen') !== '0'
    } catch {
      return true
    }
  })
  const [shares, setShares] = useState<SidebarShare[]>([])
  const [favOpen, setFavOpen] = useState(() => {
    try {
      return localStorage.getItem('fsdb.favOpen') !== '0'
    } catch {
      return true
    }
  })
  const [userOpen, setUserOpen] = useState(true)
  const [systemOpen, setSystemOpen] = useState(true)
  const [expandedViewKeyLocal, setExpandedViewKeyLocal] = useState<string | null>(null)
  const expandedViewKey = expandedViewKeyProp !== undefined ? expandedViewKeyProp : expandedViewKeyLocal
  const setExpandedViewKey = onExpandedViewKeyChange ?? setExpandedViewKeyLocal
  usePreviewTotalsVersion()

  function viewsFor(path: string) {
    const listed = path === collectionPath ? views : loadViews(path)
    return viewsForRegisteredCollection(path, tables, listed).map((view) => withViewDisplay(path, view))
  }

  const starredRows = starredViews.flatMap((item) => {
    const table = listedTables.find((row) => row.path === item.path)
    const view = viewsFor(item.path).find((row) => row.id === item.viewId)
    if (!table || !view) return []
    return [{ table, view }]
  })
  const starredRecordRows = starredRecords.flatMap((item) => {
    const table = listedTables.find((row) => row.path === item.path)
    if (!table) return []
    return [{ table, item }]
  })
  const favCount = starredRows.length + starredRecordRows.length
  const shareCount = shares.length

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void readJson<{ shares?: SidebarShare[] }>('/api/db/shares').then(
        (data) => {
          if (cancelled) return
          setShares(Array.isArray(data.shares) ? data.shares : [])
        },
        () => {
          if (!cancelled) setShares([])
        },
      )
    }
    load()
    const onChange = () => load()
    window.addEventListener('fsdb:shares-change', onChange)
    window.addEventListener('fsdb:change', onChange)
    return () => {
      cancelled = true
      window.removeEventListener('fsdb:shares-change', onChange)
      window.removeEventListener('fsdb:change', onChange)
    }
  }, [])

  const countJobs = useMemo(() => {
    const jobs: Array<{ path: string; view: SavedView }> = []
    if (favOpen) {
      for (const { table, view } of starredRows) jobs.push({ path: table.path, view })
    }
    if (userOpen) {
      for (const table of userTables) {
        if (openTables[table.path]) {
          for (const view of viewsFor(table.path)) jobs.push({ path: table.path, view })
        }
      }
    }
    if (systemOpen) {
      for (const table of systemTables) {
        if (openTables[table.path]) {
          for (const view of viewsFor(table.path)) jobs.push({ path: table.path, view })
        }
      }
    }
    return jobs
  }, [userOpen, systemOpen, favOpen, userTables, systemTables, listedTables, openTables, starredRows, tables, views, collectionPath])

  const countJobKey = countJobs.map((job) => viewTotalKey(job.path, job.view)).join('|')
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      countJobs.map((job) => {
        if (getPreviewTotal(viewTotalKey(job.path, job.view)) != null) return Promise.resolve()
        return fetchViewTotal(job.path, job.view).catch(() => {
          if (cancelled) return
        })
      }),
    )
    return () => {
      cancelled = true
    }
  }, [countJobKey, countJobs])

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      starredRecords.map(async (item) => {
        if (item.label || peekRecord(item.path, item.recordId)?.label) {
          if (item.label) rememberRecords(item.path, [{ id: item.recordId, label: item.label, emoji: item.emoji }])
          return
        }
        try {
          const data = await readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(`${item.path}/${item.recordId}`)}`)
          const row = data.value
          if (cancelled || !row?.id) return
          const label = recordPreviewLabel(row)
          const emoji = recordPreviewEmoji(row)
          rememberRecords(item.path, [{ id: row.id, label, emoji, mascot: row.mascot }])
          persistStarredRecords(
            getStarredRecords().map((entry) =>
              entry.path === item.path && entry.recordId === item.recordId ? { ...entry, label, emoji } : entry,
            ),
          )
        } catch {
          /* ignore */
        }
      }),
    )
    return () => {
      cancelled = true
    }
  }, [starredRecords])

  const starredTreePreviewKey = starredRecordRows
    .filter(({ table }) => isRecordTreeCollection(table.path))
    .map(({ table }) => table.path)
    .sort()
    .join('|')

  useEffect(() => {
    if (!favOpen || !starredTreePreviewKey) return
    let cancelled = false
    const paths = starredTreePreviewKey.split('|')
    void Promise.all(
      paths.map((path) => {
        const view = viewsFor(path).find((row) => row.id === builtinAllViewId(path)) ?? viewsFor(path)[0]
        if (!view) return Promise.resolve()
        const key = previewCacheKey(path, view)
        if (previewCache.get(key)?.items.length) return Promise.resolve()
        return fetchViewPreview(path, view, 0).then(
          (page) => {
            if (cancelled) return
            previewCache.set(key, { items: page.items, total: page.total, schema: page.schema })
            rememberPreviewTotal(key, page.total)
          },
          () => undefined,
        )
      }),
    )
    return () => {
      cancelled = true
    }
  }, [favOpen, starredTreePreviewKey, tables, views, collectionPath])

  function toggleStar(path: string, viewId: string) {
    persistStarredViews(toggleStarredView(getStarredViews(), path, viewId))
  }

  function openView(path: string, viewId: string) {
    try {
      localStorage.setItem(activeViewStorageKey(path), viewId)
    } catch {
      /* ignore */
    }
    onOpenTable?.(path, viewId)
  }

  function toggleViewPreview(key: string) {
    const next = toggleExpandedViewKey(expandedViewKey, key)
    if (onExpandedViewKeyChange) onExpandedViewKeyChange(next)
    else setExpandedViewKeyLocal(next)
  }

  function openRecord(path: string, view: SavedView, recordId: string, row?: DbRecord) {
    onOpenRecord?.(path, view, recordId, row)
  }

  function renderTableRows(rows: CollectionInfo[]) {
    return rows.map((table) => {
      const name = table.view?.title ?? table.label
      const open = openTables[table.path] ?? false
      const listed = viewsFor(table.path)
      const system = isSystemCollection(table.path)
      return (
        <div key={table.path} className="flex min-w-0 flex-col gap-px" data-collection-kind={system ? 'system' : 'user'}>
          <div className="sidebar-group-head">
            <div
              className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit"
              title={name}
              aria-expanded={open}
              {...pickDomAttrs('collection', table.path, name)}
            >
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                title={open ? '收起视图' : '展开视图'}
                aria-label={open ? '收起视图' : '展开视图'}
                onClick={() => setOpenTables((prev) => ({ ...prev, [table.path]: !open }))}
              >
                <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
                  <span className="sidebar-group-fold-face">
                    <TableGlyph icon={table.view?.icon} />
                  </span>
                  <span className="sidebar-group-fold-chevron">
                    {open ? (
                      <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                    ) : (
                      <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit outline-none hover:text-(--dsw-sidebar-fg-active) focus-visible:ring-1 focus-visible:ring-(--dsw-border)"
                onClick={() => onOpenTable?.(table.path, builtinAllViewId(table.path))}
              >
                {name}
              </button>
              <button
                type="button"
                className="sidebar-add"
                title={`在 ${name} 下添加视图`}
                aria-label={`在 ${name} 下添加视图`}
                data-testid={`sidebar-add-view-${table.path}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setOpenTables((prev) => ({ ...prev, [table.path]: true }))
                  onAddView(table.path)
                }}
              >
                <PlusIcon className="size-4 shrink-0" />
              </button>
            </div>
            <ChatCount count={listed.length} />
          </div>
          <SidebarFold open={open} className="sidebar-session-list min-w-0">
            {listed.map((view) => {
              const starred = isViewStarred(starredViews, table.path, view.id)
              const active = table.path === collectionPath && view.id === activeViewId
              const previewKey = `${table.path}:${view.id}`
              const expanded = expandedViewKey === previewKey
              return (
                <div key={view.id} className="min-w-0">
                  <div
                    className={`chat-session-row group${active ? ' is-active' : ''}${starred ? ' is-pinned' : ''}`}
                    {...pickDomAttrs('view', viewPickId(table.path, view.id), view.name)}
                  >
                    <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
                      <button
                        type="button"
                        className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                        title={expanded ? '收起记录' : '展开记录'}
                        aria-expanded={expanded}
                        onClick={() => toggleViewPreview(previewKey)}
                      >
                        <span className="sidebar-rail-icon sidebar-group-fold">
                          <span className="sidebar-group-fold-face">
                            <ViewModeGlyph mode={view.mode} />
                          </span>
                          <span className="sidebar-group-fold-chevron">
                            {expanded ? (
                              <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                            ) : (
                              <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                        onClick={() => openView(table.path, view.id)}
                      >
                        {view.name}
                      </button>
                    </div>
                    <ChatCount count={getPreviewTotal(viewTotalKey(table.path, view))} />
                    {table.path === collectionPath && !view.builtin ? (
                      <>
                        <button
                          type="button"
                          className="chat-session-row-delete"
                          title="重命名"
                          aria-label={`重命名 ${view.name}`}
                          onClick={() => onRenameView(view)}
                        >
                          <PencilSquareIcon className="size-4 shrink-0" />
                        </button>
                        <button
                          type="button"
                          className="chat-session-row-delete"
                          title="删除"
                          aria-label={`删除 ${view.name}`}
                          onClick={() => onDeleteView(view)}
                        >
                          <TrashGlyph className="size-4 shrink-0" />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={`chat-session-row-star${starred ? ' is-on' : ''}`}
                      aria-pressed={starred}
                      aria-label={starred ? `取消收藏 ${view.name}` : `收藏 ${view.name}`}
                      title={starred ? '取消收藏' : '收藏'}
                      onClick={() => toggleStar(table.path, view.id)}
                    >
                      <StarIcon className={`size-4 shrink-0${starred ? ' text-[#f5b700]' : ''}`} />
                    </button>
                  </div>
                  <SidebarFold open={expanded}>
                  <ViewRecordPreview
                    path={table.path}
                    view={view}
                    open={expanded}
                    recordKind={recordPickKind(table.view?.moduleId || table.id)}
                    tableIcon={table.view?.icon}
                    onOpenRecord={(id, row) => openRecord(table.path, view, id, row)}
                  />
                  </SidebarFold>
                </div>
              )
            })}
          </SidebarFold>
        </div>
      )
    })
  }

  const [shellSlot, setShellSlot] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('shell-module-sidebar'),
  )
  useLayoutEffect(() => {
    setShellSlot(document.getElementById('shell-module-sidebar'))
  }, [])

  const body = (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        <div className="mt-2 space-y-1.5">
          <section className="min-w-0">
            <div className="sidebar-section-head min-w-0">
              <div className="flex min-h-8 min-w-0 flex-1 items-center">
                <button
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                  aria-expanded={shareOpen}
                  onClick={() => {
                    const next = !shareOpen
                    setShareOpen(next)
                    try {
                      localStorage.setItem('fsdb.shareOpen', next ? '1' : '0')
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <span className="min-w-0 flex-1 truncate tracking-normal">分享</span>
                </button>
              </div>
              <ChatCount count={shareCount} />
            </div>
            <SidebarFold open={shareOpen}>
              <div className="min-w-0 pt-0.5" data-testid="sidebar-shares">
                {shares.length ? shares.map((share) => {
                  const table = listedTables.find((row) => row.path === share.collection)
                  const tableName = table?.view?.title ?? table?.label ?? share.collection.replace(/^\//, '')
                  const view = viewsFor(share.collection).find((row) => row.id === share.viewId)
                    ?? viewsFor(share.collection).find((row) => row.id === builtinAllViewId(share.collection))
                    ?? viewsFor(share.collection)[0]
                  const isRecord = share.kind === 'record' && share.recordId
                  const previewKey = `share:${share.token}`
                  const active = isRecord
                    ? false
                    : share.collection === collectionPath && view?.id === activeViewId && share.viewId === activeViewId
                  const emoji = peekRecord(share.collection, share.recordId)?.emoji
                  const chromeIcon = table ? getDatabaseUi()?.chrome(table.path).Icon : undefined
                  const label = share.title || (isRecord ? share.recordId : view?.name) || '分享'
                  return (
                    <div key={previewKey} className="min-w-0">
                      <div
                        className={`chat-session-row group${active ? ' is-active' : ''}`}
                        {...pickDomAttrs(isRecord ? recordPickKind(table?.view?.moduleId || table?.id || 'page') : 'view', isRecord ? share.recordId : viewPickId(share.collection, share.viewId || view?.id || ''), label)}
                      >
                        <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
                          <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                            {isRecord ? (
                              <RecordMark
                                record={recordMarkStub({ id: share.recordId, emoji, mascot: peekRecord(share.collection, share.recordId)?.mascot })}
                                tableIcon={table?.view?.icon}
                                Icon={chromeIcon}
                              />
                            ) : view ? (
                              <ViewModeGlyph mode={view.mode} />
                            ) : (
                              <ShareIcon className="size-4 shrink-0 opacity-80" />
                            )}
                          </span>
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                            title={label}
                            onClick={() => {
                              if (isRecord && view) {
                                openRecord(share.collection, view, share.recordId, {
                                  id: share.recordId,
                                  title: label,
                                  emoji,
                                })
                                return
                              }
                              if (view) openView(share.collection, view.id)
                              else onOpenTable?.(share.collection)
                            }}
                          >
                            {label}
                          </button>
                        </div>
                        <span className="sidebar-trail-icon" title={tableName} aria-label={tableName}>
                          {table?.view?.icon ? <TableGlyph icon={table.view.icon} /> : <ShareIcon className="size-4 shrink-0 opacity-70" />}
                        </span>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="px-1 py-1 text-[12px] text-(--dsw-label-3)">还没有分享</div>
                )}
              </div>
            </SidebarFold>
          </section>
          {favCount ? (
            <section className="min-w-0">
              <div className="sidebar-section-head min-w-0">
                <div className="flex min-h-8 min-w-0 flex-1 items-center">
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                    aria-expanded={favOpen}
                    onClick={() => {
                      const next = !favOpen
                      setFavOpen(next)
                      try {
                        localStorage.setItem('fsdb.favOpen', next ? '1' : '0')
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate tracking-normal">收藏</span>
                  </button>
                </div>
                <ChatCount count={favCount} />
              </div>
              <SidebarFold open={favOpen}>
                <div className="min-w-0 pt-0.5">
                  {starredRecordRows.map(({ table, item }) => {
                    const tableName = table.view?.title ?? table.label
                    const label = starredRecordLabel(item)
                    const emoji = starredRecordEmoji(item)
                    const chromeIcon = getDatabaseUi()?.chrome(table.path).Icon
                    const view = viewsFor(table.path).find((row) => row.id === builtinAllViewId(table.path)) ?? viewsFor(table.path)[0]
                    const nested = isRecordTreeCollection(table.path)
                    const previewKey = `star-record:${table.path}:${item.recordId}`
                    const expanded = expandedViewKey === previewKey
                    const kidCount = nested ? cachedDirectKidCount(table.path, item.recordId) : 0
                    const face = (
                      <RecordMark
                        record={recordMarkStub({ id: item.recordId, emoji, mascot: peekRecord(table.path, item.recordId)?.mascot })}
                        tableIcon={table.view?.icon}
                        Icon={chromeIcon}
                      />
                    )
                    return (
                      <div key={previewKey} className="min-w-0">
                        <div
                          className="chat-session-row group is-pinned"
                          {...pickDomAttrs(recordPickKind(table.view?.moduleId || table.id), item.recordId, label)}
                        >
                          <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
                            {nested ? (
                              <button
                                type="button"
                                className="relative grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                                title={expanded ? '收起子记录' : '展开子记录'}
                                aria-expanded={expanded}
                                onClick={() => toggleViewPreview(previewKey)}
                              >
                                <span className="sidebar-rail-icon sidebar-group-fold">
                                  <span className="sidebar-group-fold-face">{face}</span>
                                  <span className="sidebar-group-fold-chevron">
                                    {expanded ? (
                                      <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                                    ) : (
                                      <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                                    )}
                                  </span>
                                </span>
                              </button>
                            ) : (
                              <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                                {face}
                              </span>
                            )}
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                              title={label}
                              onClick={() => {
                                if (!view) return
                                openRecord(table.path, view, item.recordId, {
                                  id: item.recordId,
                                  title: label,
                                  emoji,
                                })
                              }}
                            >
                              {label}
                            </button>
                          </div>
                          {nested ? <ChatCount count={kidCount} title={`${kidCount} 个子记录`} /> : null}
                          <span className="sidebar-trail-icon" title={tableName} aria-label={tableName}>
                            <TableGlyph icon={table.view?.icon} />
                          </span>
                          {nested ? (
                            <button
                              type="button"
                              className="sidebar-add"
                              title={`在 ${label} 下添加子记录`}
                              aria-label={`在 ${label} 下添加子记录`}
                              onClick={(event) => {
                                event.stopPropagation()
                                void (async () => {
                                  try {
                                    const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
                                      method: 'POST',
                                      headers: { 'content-type': 'application/json' },
                                      body: JSON.stringify({ path: table.path, records: [{ parentId: item.recordId }] }),
                                    })
                                    for (const key of [...previewCache.keys()]) {
                                      if (key.startsWith(`${table.path}\0`)) previewCache.delete(key)
                                    }
                                    window.dispatchEvent(new Event('fsdb:change'))
                                    if (expandedViewKey !== previewKey) toggleViewPreview(previewKey)
                                    const created = data.items?.[0]?.value
                                    if (created?.id && view) openRecord(table.path, view, created.id, created)
                                  } catch {
                                    /* ignore */
                                  }
                                })()
                              }}
                            >
                              <PlusIcon className="size-4 shrink-0" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="chat-session-row-star is-on"
                            aria-pressed
                            aria-label={`取消收藏 ${label}`}
                            title="取消收藏"
                            onClick={() => persistStarredRecords(toggleStarredRecord(getStarredRecords(), table.path, item.recordId))}
                          >
                            <StarIcon className="size-4 shrink-0 text-[#f5b700]" />
                          </button>
                        </div>
                        {nested && view ? (
                          <SidebarFold open={expanded}>
                            <ViewRecordPreview
                              path={table.path}
                              view={view}
                              open={expanded}
                              rootId={item.recordId}
                              recordKind={recordPickKind(table.view?.moduleId || table.id)}
                              tableIcon={table.view?.icon}
                              onOpenRecord={(id, row) => openRecord(table.path, view, id, row)}
                            />
                          </SidebarFold>
                        ) : null}
                      </div>
                    )
                  })}
                  {starredRows.map(({ table, view }) => {
                    const tableName = table.view?.title ?? table.label
                    const active = table.path === collectionPath && view.id === activeViewId
                    const previewKey = `star:${table.path}:${view.id}`
                    const expanded = expandedViewKey === previewKey
                    return (
                      <div key={previewKey} className="min-w-0">
                        <div
                          className={`chat-session-row group${active ? ' is-active' : ''} is-pinned`}
                          {...pickDomAttrs('view', viewPickId(table.path, view.id), view.name)}
                        >
                          <div className="chat-session-row-main flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5">
                            <button
                              type="button"
                              className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                              title={expanded ? '收起记录' : '展开记录'}
                              aria-expanded={expanded}
                              onClick={() => toggleViewPreview(previewKey)}
                            >
                              <span className="sidebar-rail-icon sidebar-group-fold">
                                <span className="sidebar-group-fold-face">
                                  <ViewModeGlyph mode={view.mode} />
                                </span>
                                <span className="sidebar-group-fold-chevron">
                                  {expanded ? (
                                    <ChevronDownIcon className="size-4 shrink-0 opacity-80" />
                                  ) : (
                                    <ChevronRightIcon className="size-4 shrink-0 opacity-80" />
                                  )}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                              onClick={() => openView(table.path, view.id)}
                            >
                              {view.name}
                            </button>
                          </div>
                          <ChatCount count={getPreviewTotal(viewTotalKey(table.path, view))} />
                          <span className="sidebar-trail-icon" title={tableName} aria-label={tableName}>
                            <TableGlyph icon={table.view?.icon} />
                          </span>
                          <button
                            type="button"
                            className="chat-session-row-star is-on"
                            aria-pressed
                            aria-label={`取消收藏 ${view.name}`}
                            title="取消收藏"
                            onClick={() => toggleStar(table.path, view.id)}
                          >
                            <StarIcon className="size-4 shrink-0 text-[#f5b700]" />
                          </button>
                        </div>
                        <SidebarFold open={expanded}>
                        <ViewRecordPreview
                          path={table.path}
                          view={view}
                          open={expanded}
                          recordKind={recordPickKind(table.view?.moduleId || table.id)}
                          tableIcon={table.view?.icon}
                          onOpenRecord={(id, row) => openRecord(table.path, view, id, row)}
                        />
                        </SidebarFold>
                      </div>
                    )
                  })}
                </div>
              </SidebarFold>
            </section>
          ) : null}

          <section className="min-w-0">
            <div className="sidebar-section-head min-w-0">
              <div className="flex min-h-8 min-w-0 flex-1 items-center">
                <button
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                  aria-expanded={userOpen}
                  onClick={() => setUserOpen((prev) => !prev)}
                >
                  <span className="min-w-0 flex-1 truncate tracking-normal">用户数据</span>
                </button>
              </div>
              <ChatCount count={userTables.length} />
            </div>
            <SidebarFold open={userOpen}>
              <div className="flex min-w-0 flex-col gap-px" data-testid="sidebar-user-collections">
                {userTables.length ? renderTableRows(userTables) : (
                  <div className="px-1 py-1 text-[12px] text-(--dsw-label-3)">还没有可改的表</div>
                )}
              </div>
            </SidebarFold>
          </section>

          {systemTables.length ? (
            <section className="min-w-0">
              <div className="sidebar-section-head min-w-0">
                <div className="flex min-h-8 min-w-0 flex-1 items-center">
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                    aria-expanded={systemOpen}
                    title="系统运行时记下的数据"
                    onClick={() => setSystemOpen((prev) => !prev)}
                  >
                    <span className="min-w-0 flex-1 truncate tracking-normal">系统数据</span>
                  </button>
                </div>
                <ChatCount count={systemTables.length} />
              </div>
              <SidebarFold open={systemOpen}>
                <div className="flex min-w-0 flex-col gap-px" data-testid="sidebar-system-collections">
                  {renderTableRows(systemTables)}
                </div>
              </SidebarFold>
            </section>
          ) : null}
        </div>
      </div>
  )

  if (shellSlot) {
    return createPortal(
      <div className="fsdb-views flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="数据">
        {body}
      </div>,
      shellSlot,
    )
  }

  return (
    <aside
      className="app-side-bar fsdb-views flex min-h-0 flex-col overflow-hidden border-r border-(--dsw-border) bg-(--dsw-sidebar)"
      aria-label="数据"
    >
      <div className="app-side-bar-head app-side-bar-head-brand" data-biu-ignore>
        <SidebarBrandLockup />
        <button
          type="button"
          className="chat-view-header-expand"
          title="收起左侧边栏"
          aria-label="收起左侧边栏"
          data-testid="sidebar-collapse"
          onClick={onCollapse}
        >
          <ChevronDoubleLeftIcon aria-hidden className="size-4" />
        </button>
      </div>
      {body}
    </aside>
  )
})
