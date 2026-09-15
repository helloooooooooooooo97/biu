import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CheckIcon } from '@heroicons/react/16/solid'
import { ensureDbSearchStyle } from '@biu/database-ui'
import type { DbRecord, FieldSpec } from '@biu/type-file-system'
import { listCollection, readJson } from './db-client.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { crumbRecordLabel } from './sidebar-preview.ts'
import { isSingleRefField, recordLinkIds } from './fields.ts'

export type RecordLinkPeer = { id: string; label: string }

function labelOf(row: DbRecord, labelField?: string) {
  return crumbRecordLabel(row, labelField)
}

function asPeers(rows: DbRecord[], labelField?: string): RecordLinkPeer[] {
  return rows.map((row) => ({ id: row.id, label: labelOf(row, labelField) }))
}

const TABLE_PAGE = 200
const TABLE_CAP = 500

async function loadTablePeers(path: string, labelField?: string): Promise<RecordLinkPeer[]> {
  const first = await listCollection({ path, limit: TABLE_PAGE, offset: 0, sortField: 'id', columns: ['label'] })
  const rows = [...first.items]
  while (rows.length < first.total && rows.length < TABLE_CAP) {
    const more = await listCollection({ path, limit: TABLE_PAGE, offset: rows.length, sortField: 'id', columns: ['label'] })
    if (!more.items.length) break
    rows.push(...more.items)
  }
  return asPeers(rows, labelField ?? first.schema?.labelField)
}

async function readPeer(collectionPath: string, id: string, labelField?: string): Promise<RecordLinkPeer | null> {
  try {
    const body = await readJson<{ value?: DbRecord }>(
      `/api/db/read?path=${encodeURIComponent(`${collectionPath}/${id}`)}`,
    )
    const row = body.value
    if (!row?.id) return null
    return { id: row.id, label: labelOf(row, labelField) }
  } catch {
    return null
  }
}

function linkCollection(field: FieldSpec | undefined, fallback?: string) {
  const raw = typeof field?.collection === 'string' ? field.collection.trim() : ''
  return raw || fallback || ''
}

function jumpRecord(collectionPath: string | undefined, id: string) {
  if (!collectionPath || !id) return
  showRecordInInspector(collectionPath, id)
}

function useResolvedPeerLabels(
  ids: string[],
  seed: RecordLinkPeer[] | undefined,
  collectionPath: string | undefined,
  labelField?: string,
) {
  const seedMap = useMemo(() => new Map((seed ?? []).map((item) => [item.id, item.label])), [seed])
  const idKey = ids.join('\0')
  const [extra, setExtra] = useState<Record<string, string>>({})
  useEffect(() => {
    const missing = ids.filter((id) => !seedMap.has(id))
    if (!collectionPath || !missing.length) {
      setExtra({})
      return
    }
    let cancelled = false
    void Promise.all(missing.map((id) => readPeer(collectionPath, id, labelField))).then((rows) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      missing.forEach((id, index) => {
        const peer = rows[index]
        next[id] = peer?.label || ''
      })
      setExtra(next)
    })
    return () => {
      cancelled = true
    }
  }, [collectionPath, idKey, labelField, seedMap])
  return (id: string) => {
    const labeled = seedMap.get(id) || extra[id]
    return labeled && labeled.trim() ? labeled : ''
  }
}

export function RecordLinkChips({
  field,
  fieldKey,
  value,
  records,
  collectionPath,
  labelField,
}: {
  field?: FieldSpec
  fieldKey: string
  value: unknown
  records?: DbRecord[]
  collectionPath?: string
  labelField?: string
}) {
  const ids = recordLinkIds(field, value, fieldKey)
  const peerPath = linkCollection(field, collectionPath)
  const seed = useMemo(() => asPeers(records ?? [], labelField), [labelField, records])
  const labelOfId = useResolvedPeerLabels(ids, seed, peerPath, labelField)
  if (!ids.length) return null
  return (
    <span className="fsdb-ref-chips">
      {ids.map((id) => {
        const label = labelOfId(id).replace(/\s+/g, ' ').trim()
        return (
          <button
            key={id}
            type="button"
            className="fsdb-ref-chip"
            title={label ? `在右侧打开 ${label}` : '在右侧打开'}
            onClick={(event) => {
              event.stopPropagation()
              jumpRecord(peerPath, id)
            }}
          >
            <span className="fsdb-ref-chip-title">{label || '…'}</span>
            <ArrowTopRightOnSquareIcon className="size-3 shrink-0 opacity-70" aria-hidden />
          </button>
        )
      })}
    </span>
  )
}

export function RecordPickPanel({
  field,
  fieldKey,
  value,
  collectionPath,
  excludeId,
  labelField,
  seed,
  onChange,
  onPicked,
  onJump,
}: {
  field?: FieldSpec
  fieldKey: string
  value: unknown
  collectionPath: string
  excludeId?: string
  labelField?: string
  seed?: DbRecord[]
  onChange: (next: unknown) => void
  onPicked?: () => void
  onJump?: () => void
}) {
  ensureDbSearchStyle()
  const multiple = !isSingleRefField(field, fieldKey)
  const peerPath = linkCollection(field, collectionPath)
  const selected = recordLinkIds(field, value, fieldKey)
  const [query, setQuery] = useState('')
  const [peers, setPeers] = useState<RecordLinkPeer[]>(() => asPeers(seed ?? [], labelField))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadTablePeers(peerPath, labelField)
      .then((rows) => {
        if (!cancelled) setPeers(rows)
      })
      .catch(() => {
        if (!cancelled) setPeers(asPeers(seed ?? [], labelField))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [peerPath, labelField])

  const byId = useMemo(() => new Map(peers.map((item) => [item.id, item.label])), [peers])
  const selectedKey = selected.join('\0')
  const [extra, setExtra] = useState<Record<string, string>>({})
  useEffect(() => {
    const missing = selected.filter((id) => !byId.has(id))
    if (!missing.length) {
      setExtra({})
      return
    }
    let cancelled = false
    void Promise.all(missing.map((id) => readPeer(peerPath, id, labelField))).then((rows) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      missing.forEach((id, index) => {
        const peer = rows[index]
        next[id] = peer?.label || ''
      })
      setExtra(next)
    })
    return () => {
      cancelled = true
    }
  }, [byId, peerPath, labelField, selectedKey])
  const titleOf = (id: string) => {
    const labeled = byId.get(id) || extra[id]
    return labeled && labeled.trim() ? labeled : ''
  }
  const q = query.trim().toLowerCase()
  const available = peers.filter(
    (item) =>
      item.id !== excludeId &&
      (multiple ? !selected.includes(item.id) : true) &&
      (!q || item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)),
  )

  function commit(nextIds: string[]) {
    if (multiple) onChange(nextIds)
    else onChange(nextIds[0] ?? '')
  }

  function pick(id: string) {
    if (!id || id === excludeId) return
    if (multiple) {
      if (!selected.includes(id)) commit([...selected, id])
    } else {
      commit(id === selected[0] ? [] : [id])
      onPicked?.()
    }
    setQuery('')
  }

  function jump(id: string) {
    jumpRecord(peerPath, id)
    onJump?.()
  }

  return (
    <div className="fsdb-ref-pick">
      {selected.length ? (
        <div className="fsdb-ref-picked">
          {selected.map((id) => (
            <div key={id} className="fsdb-ref-picked-row">
              <button type="button" className="fsdb-ref-jump" onClick={() => jump(id)} title={titleOf(id) || '在右侧打开'}>
                <span className="fsdb-ref-title">{titleOf(id) || '…'}</span>
                <ArrowTopRightOnSquareIcon className="size-3 shrink-0 opacity-70" aria-hidden />
              </button>
              <button
                type="button"
                className="fsdb-ref-x"
                aria-label={`取消引用 ${titleOf(id) || '记录'}`}
                onClick={() => commit(selected.filter((item) => item !== id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <label className="db-search-field">
        <input
          value={query}
          autoFocus
          placeholder="搜索本表记录"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (available[0]) pick(available[0].id)
            }
          }}
        />
      </label>
      <div className="fsdb-ref-list">
        {available.map((item) => {
          const on = !multiple && selected[0] === item.id
          return (
            <div key={item.id} className={`fsdb-ref-row${on ? ' is-on' : ''}`}>
              <button
                type="button"
                className={`fsdb-ref-check${on ? ' is-on' : ''}`}
                aria-pressed={on}
                aria-label={on ? `取消引用 ${item.label}` : `引用 ${item.label}`}
                onClick={() => pick(item.id)}
              >
                {on ? <CheckIcon className="size-3" aria-hidden /> : null}
              </button>
              <button type="button" className="fsdb-ref-jump" onClick={() => jump(item.id)} title={item.label}>
                <span className="fsdb-ref-title">{item.label}</span>
                <ArrowTopRightOnSquareIcon className="size-3 shrink-0 opacity-70" aria-hidden />
              </button>
            </div>
          )
        })}
        {loading ? (
          <div className="fsdb-person-loading">
            <ArrowPathIcon className="size-[14px] fsdb-spin" aria-hidden />
            加载本表…
          </div>
        ) : null}
        {!loading && !available.length ? <div className="fsdb-person-loading">本表没有可选项</div> : null}
      </div>
    </div>
  )
}
