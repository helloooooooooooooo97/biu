import { useEffect, useMemo, useState } from 'react'
import { ClockIcon, CircleStackIcon } from '@heroicons/react/16/solid'
import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import { builtinAllViewId, builtinScopeViewId, type DataScope } from '../catalog-views.ts'
import { sortDataCollections } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { TableGlyph } from './nav-glyphs.tsx'

type RecentRow = {
  table: CollectionInfo
  record: DbRecord
  timestamp: number
}

function recordTimestamp(record: DbRecord) {
  return Number(record.updatedAt ?? record.createdAt ?? 0)
}

function recordLabel(record: DbRecord) {
  return String(record.title ?? record.name ?? record.id)
}

export function ScopeOverview({
  scope,
  tables,
  onOpenTable,
  onOpenRecord,
}: {
  scope: DataScope
  tables: CollectionInfo[]
  onOpenTable: (path: string, viewId: string) => void
  onOpenRecord: (path: string, viewId: string, recordId: string, row: DbRecord) => void
}) {
  const userTables = useMemo(() => sortDataCollections(tables).user, [tables])
  const [rows, setRows] = useState<RecentRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all(
      userTables.map(async (table) => {
        const page = await listCollection({
          path: table.path,
          limit: 6,
          sortField: 'updatedAt',
          sortDir: 'desc',
          filters: { $scope: scope },
        })
        return { table, page }
      }),
    ).then(
      (results) => {
        if (cancelled) return
        setCounts(Object.fromEntries(results.map(({ table, page }) => [table.path, page.total])))
        setRows(
          results
            .flatMap(({ table, page }) =>
              page.items.map((record) => ({ table, record, timestamp: recordTimestamp(record) })),
            )
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 18),
        )
        setLoading(false)
      },
      () => {
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [scope, userTables])

  const title = scope === 'workspace' ? '空间数据' : '私人数据'
  const description = scope === 'workspace'
    ? '空间成员共同使用的数据概览'
    : '仅你和被明确授权成员可访问的数据概览'

  return (
    <div className="fsdb-right" data-testid={`scope-overview-${scope}`}>
      <header className="chat-view-header">
        <div className="chat-view-header-left">
          <CircleStackIcon className="size-4" />
          <strong>{title}</strong>
        </div>
      </header>
      <div className="fsdb-right-body overflow-auto">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <section>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-(--dsw-label-2)">{description}</p>
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="数据分类">
            {userTables.map((table) => {
              const viewId = builtinScopeViewId(scope, builtinAllViewId(table.path))
              return (
                <button
                  key={table.path}
                  type="button"
                  className="flex items-center gap-3 rounded-xl border border-(--dsw-border) bg-(--dsw-surface) p-4 text-left hover:bg-(--dsw-hover)"
                  onClick={() => onOpenTable(table.path, viewId)}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--dsw-hover)">
                    <TableGlyph icon={table.view?.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{table.view?.title ?? table.label}</strong>
                    <span className="text-xs text-(--dsw-label-3)">{counts[table.path] ?? 0} 条</span>
                  </span>
                </button>
              )
            })}
          </section>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ClockIcon className="size-4" />
              最近使用
            </h2>
            <div className="overflow-hidden rounded-xl border border-(--dsw-border) bg-(--dsw-surface)">
              {loading ? <p className="p-4 text-sm text-(--dsw-label-3)">加载中…</p> : null}
              {!loading && !rows.length ? <p className="p-4 text-sm text-(--dsw-label-3)">还没有数据</p> : null}
              {rows.map(({ table, record, timestamp }) => {
                const viewId = builtinScopeViewId(scope, builtinAllViewId(table.path))
                return (
                  <button
                    key={`${table.path}:${record.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 border-0 border-b border-(--dsw-border) bg-transparent px-4 py-3 text-left last:border-b-0 hover:bg-(--dsw-hover)"
                    onClick={() => onOpenRecord(table.path, viewId, record.id, record)}
                  >
                    <span className="text-lg">{String(record.emoji ?? '') || '•'}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{recordLabel(record)}</strong>
                      <span className="text-xs text-(--dsw-label-3)">{table.view?.title ?? table.label}</span>
                    </span>
                    {timestamp ? (
                      <time className="text-xs text-(--dsw-label-3)">
                        {new Date(timestamp).toLocaleDateString()}
                      </time>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
