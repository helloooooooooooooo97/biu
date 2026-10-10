import { useEffect, useMemo, useState } from 'react'
import { ClockIcon, CircleStackIcon } from '@heroicons/react/16/solid'
import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import { builtinAllViewId, scopedCollectionName, type DataScope } from '../catalog-views.ts'
import { sortDataCollections } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { TableGlyph } from './nav-glyphs.tsx'

type RecentRow = {
  table: CollectionInfo
  record: DbRecord
  scope: DataScope
  timestamp: number
}

const SCOPES: DataScope[] = ['personal', 'workspace', 'shared']

function recordTimestamp(record: DbRecord) {
  return Number(record.updatedAt ?? record.createdAt ?? 0)
}

function recordLabel(record: DbRecord) {
  return String(record.title ?? record.name ?? record.id)
}

export function ScopeOverview({
  tables,
  onOpenTable,
  onOpenRecord,
}: {
  tables: CollectionInfo[]
  onOpenTable: (path: string, viewId: string) => void
  onOpenRecord: (path: string, viewId: string, recordId: string, row: DbRecord) => void
}) {
  const userTables = useMemo(() => sortDataCollections(tables).user, [tables])
  const [rows, setRows] = useState<RecentRow[]>([])
  const [counts, setCounts] = useState<Record<string, Record<DataScope, number>>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all(
      userTables.flatMap((table) =>
        SCOPES.map(async (scope) => {
          const page = await listCollection({
            path: table.path,
            limit: 6,
            sortField: 'updatedAt',
            sortDir: 'desc',
            filters: { $scope: scope },
          })
          return { table, scope, page }
        }),
      ),
    ).then(
      (results) => {
        if (cancelled) return
        const nextCounts: Record<string, Record<DataScope, number>> = {}
        for (const { table, scope, page } of results) {
          nextCounts[table.path] ??= { personal: 0, workspace: 0, shared: 0 }
          nextCounts[table.path]![scope] = page.total
        }
        setCounts(nextCounts)
        setRows(
          results
            .flatMap(({ table, scope, page }) =>
              page.items.map((record) => ({ table, scope, record, timestamp: recordTimestamp(record) })),
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
  }, [userTables])

  return (
    <div className="fsdb-right" data-testid="scope-overview-user">
      <header className="chat-view-header">
        <div className="chat-view-header-left">
          <CircleStackIcon className="size-4" />
          <strong>用户数据</strong>
        </div>
      </header>
      <div className="fsdb-right-body overflow-auto">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <section>
            <h1 className="text-xl font-semibold">用户数据</h1>
            <p className="mt-1 text-sm text-(--dsw-label-2)">按协作者区分：只有自己是私人数据，空间成员是空间数据，包含外部成员是共享数据。</p>
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="数据表">
            {userTables.map((table) => {
              const tableCounts = counts[table.path]
              return (
                <div key={table.path} className="rounded-xl border border-(--dsw-border) bg-(--dsw-surface) p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--dsw-hover)">
                      <TableGlyph icon={table.view?.icon} />
                    </span>
                    <strong className="min-w-0 flex-1 truncate text-sm">{table.view?.title ?? table.label}</strong>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {SCOPES.map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        className="rounded-lg bg-(--dsw-hover) px-2 py-2 text-left hover:bg-(--dsw-border)"
                        onClick={() => onOpenTable(table.path, builtinAllViewId(table.path))}
                      >
                        <span className="block text-xs text-(--dsw-label-2)">{scopedCollectionName(table, scope)}</span>
                        <strong className="text-sm">{tableCounts?.[scope] ?? 0}</strong>
                      </button>
                    ))}
                  </div>
                </div>
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
              {rows.map(({ table, record, scope, timestamp }) => {
                const viewId = builtinAllViewId(table.path)
                return (
                  <button
                    key={`${table.path}:${scope}:${record.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 border-0 border-b border-(--dsw-border) bg-transparent px-4 py-3 text-left last:border-b-0 hover:bg-(--dsw-hover)"
                    onClick={() => onOpenRecord(table.path, viewId, record.id, record)}
                  >
                    <span className="text-lg">{String(record.emoji ?? '') || '•'}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{recordLabel(record)}</strong>
                      <span className="text-xs text-(--dsw-label-3)">{scopedCollectionName(table, scope)}</span>
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
