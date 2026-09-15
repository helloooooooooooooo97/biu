import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArchiveBoxArrowDownIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlayIcon,
  PuzzlePieceIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  StopIcon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'
import { TagChip, TagChips } from '@biu/public-ui'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { actionVisibleToUser } from '@biu/type-file-system'
import type { CollectionActionInfo, DbRecord } from '@biu/type-file-system'
import { getDatabaseUi } from '@biu/core-file-system/database-ui'
import { setChatOverlay, requestComposerFocus } from './chat-overlay.ts'

export type SearchKind = 'view' | 'session' | 'task' | 'page' | 'plugin' | 'facet'

export const SEARCH_SCOPES: Array<{
  id: SearchKind
  label: string
  path: string | null
}> = [
  { id: 'view', label: '视图', path: '/views' },
  { id: 'session', label: '会话', path: null },
  { id: 'task', label: '任务', path: '/tasks' },
  { id: 'page', label: '页面', path: '/pages' },
  { id: 'plugin', label: '插件', path: '/plugins' },
  { id: 'facet', label: '合集', path: '/facets' },
]

const PER_KIND = 8
const DEBOUNCE_MS = 160
const NAV_ACTION_IDS = new Set(['open-split', 'open-page'])
/** Agent-only / internal actions that must never appear on search hits. */
const SEARCH_SKIP_ACTION_IDS = new Set([
  'report',
  'progress',
  'inspect',
  'compact',
  'clear',
  'retrieve',
  'status',
])

export type SearchAction = {
  id: string
  label: string
  tone?: 'danger'
  for?: 'both' | 'agent' | 'user'
  placement?: Array<'row' | 'detail'>
  confirm?: string
  when?: Record<string, unknown>
}

export type SearchMascot = { shape: string; color: string; eye?: number }

export type SearchHit = {
  kind: SearchKind
  id: string
  title: string
  tags?: string[]
  updatedAt?: number
  emoji?: string
  mascot?: SearchMascot
  record?: Record<string, unknown>
  actions?: SearchAction[]
}

export type SessionHint = {
  id: string
  title: string
  tags?: string[]
  updatedAt?: number
  emoji?: string
  mascot?: SearchMascot
}

function recordTitle(row: Record<string, unknown>) {
  const title = row.title ?? row.name ?? row.label
  const text = String(title ?? '').trim()
  return text || String(row.id ?? '')
}

function pushTags(into: string[], value: unknown) {
  if (!Array.isArray(value)) return
  for (const item of value) {
    const text = String(item ?? '').trim()
    if (text) into.push(text)
  }
}

/** 列表行上的标签：tags、facet.tags、config.tags。 */
export function tagsFromRecord(row: Record<string, unknown>) {
  const tags: string[] = []
  pushTags(tags, row.tags)
  const facet = row.facet
  if (facet && typeof facet === 'object' && !Array.isArray(facet)) {
    pushTags(tags, (facet as { tags?: unknown }).tags)
  }
  const config = row.config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    pushTags(tags, (config as { tags?: unknown }).tags)
  }
  return [...new Set(tags)]
}

export function pluginRecordEnabled(row?: Record<string, unknown>) {
  return row?.enabled === true || row?.enabled === 'true'
}

/** 与列表 RecordMark 相同：emoji 最多两枚。 */
export function recordEmoji(row: Record<string, unknown>) {
  const text = String(row.emoji ?? '').trim()
  if (!text) return ''
  return [...text].slice(0, 2).join('')
}

export function recordMascot(row: Record<string, unknown>): SearchMascot | undefined {
  const raw = row.mascot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const mascot = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof mascot.shape !== 'string' || typeof mascot.color !== 'string') return undefined
  return {
    shape: mascot.shape,
    color: mascot.color,
    ...(typeof mascot.eye === 'number' ? { eye: mascot.eye } : {}),
  }
}

export function recordUpdatedAt(row: Record<string, unknown>) {
  const updated = Number(row.updatedAt)
  if (Number.isFinite(updated) && updated) return updated
  const created = Number(row.createdAt)
  return Number.isFinite(created) ? created : 0
}

export function pickRecentHits<T extends { id: string; updatedAt?: number }>(items: T[], limit = PER_KIND) {
  return [...items]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.id.localeCompare(right.id))
    .slice(0, limit)
}

export function matchActionWhen(record: Record<string, unknown>, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}

export function previewRunningRecord(record: Record<string, unknown>, when?: Record<string, unknown>) {
  if (!when || typeof when.running !== 'boolean') return record
  const running = when.running === false
  if (Object.is(record.running, running)) return record
  return { ...record, running }
}

export function previewHitRecord(record: Record<string, unknown>, action: SearchAction) {
  if (action.id === 'uninstall' || action.id === 'delete' || action.id === 'remove') {
    if (record.installed === false && record.running !== true && record.enabled !== true) return record
    return { ...record, installed: false, running: false, enabled: false }
  }
  if (action.id === 'pack') {
    if (record.installed === true) return record
    return { ...record, installed: true }
  }
  return previewRunningRecord(record, action.when)
}

export function visibleRowActions(actions: SearchAction[] | undefined, record: Record<string, unknown> | undefined) {
  const row = record ?? {}
  return placedRowActions(actions).filter((action) => matchActionWhen(row, action.when))
}

export function placedRowActions(actions: SearchAction[] | undefined) {
  return (actions ?? []).filter((action) => {
    if (!actionVisibleToUser(action)) return false
    if (NAV_ACTION_IDS.has(action.id)) return false
    if (SEARCH_SKIP_ACTION_IDS.has(action.id)) return false
    const places = action.placement ?? ['row', 'detail']
    return places.includes('row')
  })
}

export function searchCollection(kind: SearchKind) {
  if (kind === 'session') return '/sessions'
  return SEARCH_SCOPES.find((item) => item.id === kind)?.path ?? `/${kind}`
}

function viewOpenTarget(hit: { kind: SearchKind; id: string; record?: Record<string, unknown> }) {
  const tablePath = String(hit.record?.tablePath ?? '').trim()
  const viewId = String(hit.record?.viewId ?? '').trim()
  if (hit.kind !== 'view' || !tablePath || !viewId) return null
  return { collection: tablePath, viewId }
}

/** Enter：右侧检查器打开，不改路由、不换主 Session。 */
export function openSearchHit(hit: { kind: SearchKind; id: string; record?: Record<string, unknown> }) {
  const view = viewOpenTarget(hit)
  window.dispatchEvent(
    new CustomEvent('biu:inspector-reveal', {
      detail: { ...(view ?? { collection: searchCollection(hit.kind), recordId: hit.id }), unique: true },
    }),
  )
}

/** Shift+Enter：左侧主区打开并改路由；只有会话会换成主 Session。 */
export function searchHref(hit: { kind: SearchKind; id: string; record?: Record<string, unknown> }) {
  const view = viewOpenTarget(hit)
  if (view) return `/database${view.collection}/view/${encodeURIComponent(view.viewId)}`
  if (hit.kind === 'session') return `/s/${encodeURIComponent(hit.id)}`
  const collection = searchCollection(hit.kind)
  return `/database${collection}/record/${encodeURIComponent(hit.id)}`
}

function matchLocal(title: string, id: string, needle: string) {
  if (!needle) return true
  return title.toLowerCase().includes(needle) || id.toLowerCase().includes(needle)
}

function asSearchActions(value: unknown): SearchAction[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is SearchAction => {
    if (!item || typeof item !== 'object') return false
    const action = item as SearchAction
    return typeof action.id === 'string' && typeof action.label === 'string' && actionVisibleToUser(action)
  })
}

function hitFromRow(kind: SearchKind, row: Record<string, unknown>, actions: SearchAction[]): SearchHit {
  const id = String(row.id ?? '')
  return {
    kind,
    id,
    title: recordTitle(row),
    tags: tagsFromRecord(row),
    updatedAt: recordUpdatedAt(row),
    emoji: recordEmoji(row),
    mascot: recordMascot(row),
    record: row,
    actions,
  }
}

async function listKind(path: string, query: string, signal: AbortSignal) {
  const params = new URLSearchParams({
    path,
    limit: String(PER_KIND),
    offset: '0',
    q: query,
    sort: 'updatedAt',
    dir: 'desc',
    filter: '{}',
  })
  const res = await fetch(`/api/db/list?${params}`, { signal })
  const body = (await res.json()) as {
    items?: Array<Record<string, unknown>>
    schema?: { actions?: unknown }
  }
  return {
    items: Array.isArray(body.items) ? body.items : [],
    actions: asSearchActions(body.schema?.actions),
  }
}

function actionGlyph(id: string) {
  const cls = 'size-4'
  if (id === 'start' || id === 'play' || id === 'run' || id === 'open') return <PlayIcon aria-hidden className={cls} />
  if (id === 'stop' || id === 'close' || id === 'pause') return <StopIcon aria-hidden className={cls} />
  if (id === 'pack') return <ArchiveBoxArrowDownIcon aria-hidden className={cls} />
  if (id === 'uninstall' || id === 'delete' || id === 'remove') return <TrashGlyph aria-hidden className={cls} />
  if (id === 'edit' || id === 'rename') return <PencilSquareIcon aria-hidden className={cls} />
  if (id === 'refresh') return <ArrowPathIcon aria-hidden className={cls} />
  if (id === 'deliver') return <PaperAirplaneIcon aria-hidden className={cls} />
  return null
}

function HitRecordTags({ tags }: { tags?: string[] }) {
  const list = (tags ?? []).map((tag) => tag.trim()).filter(Boolean)
  if (!list.length) return null
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <TagChips>
      {shown.map((tag) => (
        <TagChip key={tag} id={tag} label={tag} />
      ))}
      {extra > 0 ? <TagChip id={`+${extra}`} label={`+${extra}`} /> : null}
    </TagChips>
  )
}

function HitActions({ hit }: { hit: SearchHit }) {
  const [record, setRecord] = useState(hit.record ?? { id: hit.id })
  const acting = useRef(false)
  const Actions = getDatabaseUi()?.chrome(searchCollection(hit.kind)).Actions
  const placed = placedRowActions(hit.actions)
  const actions = visibleRowActions(hit.actions, record).filter((action) => actionGlyph(action.id))
  useEffect(() => {
    setRecord(hit.record ?? { id: hit.id })
  }, [hit.id, hit.record])
  const run = async (action: SearchAction) => {
    if (acting.current) return
    if (action.confirm && !window.confirm(action.confirm)) return
    acting.current = true
    const next = previewHitRecord(record, action)
    if (next !== record) setRecord(next)
    try {
      await fetch('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: `${searchCollection(hit.kind)}/${hit.id}`,
          action: action.id,
        }),
      })
      window.dispatchEvent(new Event('fsdb:change'))
    } finally {
      acting.current = false
    }
  }
  if (Actions) {
    if (!placed.length) return null
    return (
      <span className="shell-search-hit-actions" data-biu-ignore onClick={(event) => event.stopPropagation()}>
        <Actions
          actions={placed as CollectionActionInfo[]}
          record={record as DbRecord}
          busy={false}
          place="row"
          run={(action) => void run(action)}
        />
      </span>
    )
  }
  if (!actions.length) return null
  return (
    <span className="shell-search-hit-actions" data-biu-ignore>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`shell-search-hit-action${action.tone === 'danger' ? ' is-danger' : ''}`}
          title={action.label}
          data-dock-tip={action.label}
          aria-label={action.label}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void run(action)
          }}
        >
          {actionGlyph(action.id)}
        </button>
      ))}
    </span>
  )
}

function KindGlyph({ kind, compact }: { kind: SearchKind | 'all'; compact?: boolean }) {
  const className = compact ? 'size-3 shrink-0' : 'size-4 shrink-0'
  if (kind === 'all') return <Squares2X2Icon className={className} />
  if (kind === 'view') return <TableCellsIcon className={className} />
  if (kind === 'session') return <ChatBubbleLeftRightIcon className={className} />
  if (kind === 'task') return <CheckCircleIcon className={className} />
  if (kind === 'page') return <DocumentIcon className={className} />
  if (kind === 'plugin') return <PuzzlePieceIcon className={className} />
  return <RectangleStackIcon className={className} />
}

function HitMark({ hit }: { hit: SearchHit }) {
  const emoji = (hit.emoji || recordEmoji(hit.record ?? {})).trim()
  if (emoji) return <span className="fsdb-record-emoji">{emoji}</span>
  if (hit.kind === 'session') {
    const identity = resolveSessionMascot(hit.id, hit.mascot ?? recordMascot(hit.record ?? {}))
    return <SidebarMascot size={20} sessionId={hit.id} identity={identity} animate={false} title="" />
  }
  return <KindGlyph kind={hit.kind} />
}

export function ShellSearchPanel({
  sessions,
  onClose,
  focusSeq = 0,
}: {
  sessions: SessionHint[]
  onClose: () => void
  focusSeq?: number
}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | SearchKind>('all')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  const [reloadSeq, setReloadSeq] = useState(0)
  const cacheRef = useRef(new Map<string, SearchHit[]>())
  const schemaActionsRef = useRef(new Map<SearchKind, SearchAction[]>())

  useLayoutEffect(() => {
    const node = inputRef.current
    if (!node) return
    node.focus()
  }, [focusSeq])

  useEffect(() => {
    const onChange = () => setReloadSeq((seq) => seq + 1)
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  }, [])

  const needle = query.trim().toLowerCase()

  const localSessions = useMemo(() => {
    const sessionActions = schemaActionsRef.current.get('session')
    const matched = sessions
      .filter((item) => matchLocal(item.title, item.id, needle))
      .map((item) => ({
        kind: 'session' as const,
        id: item.id,
        title: item.title || item.id,
        tags: (item.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
        updatedAt: item.updatedAt ?? 0,
        emoji: item.emoji,
        mascot: item.mascot,
        record: {
          id: item.id,
          title: item.title,
          tags: item.tags,
          emoji: item.emoji,
          mascot: item.mascot,
          updatedAt: item.updatedAt,
        },
        actions: sessionActions,
      }))
    return pickRecentHits(matched)
  }, [needle, sessions, hits, reloadSeq])

  useEffect(() => {
    const keyOf = (kind: SearchKind) => `${kind}\0${needle}`
    const listed = SEARCH_SCOPES.map((item) => ({
      id: item.id,
      path: item.id === 'session' ? '/sessions' : item.path,
    })).filter((item): item is { id: SearchKind; path: string } => Boolean(item.path))
    const remote = listed.filter((item) => scope === 'all' || item.id === scope)
    const allRemote = listed
    if (reloadSeq) cacheRef.current.clear()
    const fromCache = allRemote.flatMap((item) => cacheRef.current.get(keyOf(item.id)) ?? [])
    if (fromCache.length) setHits(fromCache)
    if (!remote.length) {
      setBusy(false)
      return
    }
    const missing = remote.filter((item) => !cacheRef.current.has(keyOf(item.id)))
    if (!missing.length) {
      setHits(fromCache)
      setBusy(false)
      return
    }
    const ac = new AbortController()
    const timer = window.setTimeout(() => {
      setBusy(true)
      void Promise.all(
        missing.map(async (item) => {
          try {
            const listedKind = await listKind(item.path, needle, ac.signal)
            schemaActionsRef.current.set(item.id, listedKind.actions)
            return listedKind.items.map((row) => hitFromRow(item.id, row, listedKind.actions))
          } catch {
            return [] as SearchHit[]
          }
        }),
      ).then((groups) => {
        if (ac.signal.aborted) return
        groups.forEach((rows, index) => {
          const kind = missing[index]?.id
          if (kind) cacheRef.current.set(keyOf(kind), rows)
        })
        setHits(allRemote.flatMap((item) => cacheRef.current.get(keyOf(item.id)) ?? []))
        setBusy(false)
      })
    }, needle ? DEBOUNCE_MS : 0)
    return () => {
      ac.abort()
      window.clearTimeout(timer)
    }
  }, [needle, scope, reloadSeq])

  const grouped = useMemo(() => {
    const remote = hits.filter((item) => scope === 'all' || item.kind === scope)
    const order: SearchKind[] = ['view', 'session', 'task', 'page', 'plugin', 'facet']
    return order
      .map((kind) => {
        const fromRemote = remote.filter((item) => item.kind === kind)
        const fromLocal = kind === 'session' && (scope === 'all' || scope === 'session') ? localSessions : []
        const seen = new Set(fromRemote.map((item) => item.id))
        const merged = [...fromRemote, ...fromLocal.filter((item) => !seen.has(item.id))]
        return {
          kind,
          label: SEARCH_SCOPES.find((item) => item.id === kind)?.label ?? kind,
          items: pickRecentHits(merged),
        }
      })
      .filter((group) => group.items.length)
  }, [hits, localSessions, scope])

  const flat = grouped.flatMap((group) => group.items)
  const current = flat[Math.min(active, Math.max(0, flat.length - 1))]

  useLayoutEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const node = root.querySelector<HTMLElement>(`[data-search-hit="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, flat.length])

  const openHit = (hit: SearchHit, side: 'right' | 'left') => {
    if (side === 'left') {
      const href = searchHref(hit)
      if (hit.kind === 'session') setChatOverlay(false)
      navigate(href)
    } else {
      openSearchHit(hit)
    }
    onClose()
    if (side === 'left' && hit.kind === 'session') requestComposerFocus()
  }

  let cursor = -1

  return (
    <div
      className="shell-search-overlay"
      data-testid="shell-search-overlay"
      onClick={onClose}
    >
      <div
        className="shell-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shell-search-field">
          <button
            type="button"
            className="shell-search-go"
            title="搜索"
            aria-label="搜索"
            aria-busy={busy}
            onClick={() => inputRef.current?.focus()}
          >
            <MagnifyingGlassIcon className="size-4 shrink-0" />
          </button>
          <input
            ref={inputRef}
            className="shell-search-input"
            autoFocus
            placeholder="搜索视图、会话、任务、页面、插件、合集"
            value={query}
            data-testid="shell-search-input"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((prev) => Math.min(prev + 1, Math.max(0, flat.length - 1)))
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((prev) => Math.max(prev - 1, 0))
                return
              }
              if (event.key === 'Enter' && current) {
                event.preventDefault()
                openHit(current, event.shiftKey ? 'left' : 'right')
              }
            }}
          />
        </div>
        <div className="shell-search-scopes" role="tablist" aria-label="搜索范围">
          <TagChips>
            <TagChip
              id="all"
              label="全部"
              active={scope === 'all'}
              icon={<KindGlyph kind="all" compact />}
              onClick={() => setScope('all')}
            />
            {SEARCH_SCOPES.map((item) => (
              <TagChip
                key={item.id}
                id={item.id}
                label={item.label}
                active={scope === item.id}
                icon={<KindGlyph kind={item.id} compact />}
                onClick={() => setScope(item.id)}
              />
            ))}
          </TagChips>
        </div>
        <div ref={bodyRef} className="shell-search-body" aria-busy={busy}>
          {!needle && scope === 'all' && !flat.length && !busy ? (
            <p className="shell-search-hint">
              空着时视图、会话、任务、页面、插件、合集各按更新时间列最近 {PER_KIND} 条。
            </p>
          ) : null}
          {grouped.map((group) => (
            <section key={group.kind} className="shell-search-group">
              <h3 className="shell-search-group-title">{group.label}</h3>
              {group.items.map((item) => {
                cursor += 1
                const index = cursor
                const tags = (item.kind === 'session' || item.kind === 'task' || item.kind === 'page' || item.kind === 'plugin')
                  ? item.tags
                  : undefined
                const actions = visibleRowActions(item.actions, item.record ?? { id: item.id })
                const hasGlyphActions = (item.actions ?? []).some((action) => actionGlyph(action.id))
                return (
                  <div
                    role="option"
                    aria-selected={index === active}
                    data-search-hit={index}
                    key={`${item.kind}:${item.id}`}
                    className={`shell-search-hit${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={(event) => openHit(item, event.shiftKey ? 'left' : 'right')}
                  >
                    <span className="shell-search-hit-icon" aria-hidden>
                      <HitMark hit={item} />
                    </span>
                    <span className="shell-search-hit-title">
                      {item.kind === 'plugin' && pluginRecordEnabled(item.record) ? (
                        <span className="shell-search-hit-enabled" data-testid="plugin-enabled-dot" aria-hidden />
                      ) : null}
                      <span className="shell-search-hit-title-text">{item.title}</span>
                    </span>
                    {tags?.length || actions.length || hasGlyphActions ? (
                      <span className="shell-search-hit-aside">
                        {tags?.length ? (
                          <span className="shell-search-hit-tags">
                            <HitRecordTags tags={tags} />
                          </span>
                        ) : null}
                        {hasGlyphActions ? <HitActions hit={item} /> : null}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ))}
          {!busy && needle && !flat.length ? (
            <p className="shell-search-hint">没有匹配「{query.trim()}」的结果</p>
          ) : null}
        </div>
        <div className="shell-search-foot">
          <span>⌘F 搜索</span>
          <span>↑↓ 选择</span>
          <span>↵ 右侧</span>
          <span>⇧↵ 左侧</span>
          <span>esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
