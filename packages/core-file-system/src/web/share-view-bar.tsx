import { useRef, useState } from 'react'
import { ArrowsUpDownIcon, FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE } from '@biu/public-ui'
import type { CollectionSchema, DbRecord, FieldType } from '@biu/type-file-system'
import { countFilterRules } from '../query-logic.ts'
import { resolveFieldType } from './fields.ts'
import { FilterQueryMenu, SortQueryMenu, type QueryField } from './query-menus.tsx'
import type { ShareQueryState } from './share-query.ts'

const QUERY_NEST_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`

function queryFieldsOf(schema: CollectionSchema): QueryField[] {
  const body = schema.contentField
  return Object.entries(schema.fields)
    .filter(([key, field]) => key !== body && resolveFieldType(field) !== 'file')
    .map(([key, field]) => ({ key, field, kind: resolveFieldType(field) as FieldType }))
}

export function ShareViewQueryBar({
  schema,
  records,
  state,
  onChange,
}: {
  schema: CollectionSchema
  records: DbRecord[]
  state: ShareQueryState
  onChange: (next: ShareQueryState) => void
}) {
  const fields = queryFieldsOf(schema)
  const sortFields = fields.filter((item) => item.field.sortable !== false)
  const filterActive = countFilterRules(state.filterTree) > 0
  const searchRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(Boolean(state.q))
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchExpanded = searchOpen || Boolean(state.q)

  function valueOptions(item: QueryField) {
    const seen = new Set<string>()
    const out: Array<{ value: string; label: string }> = []
    for (const row of records) {
      const raw = row[item.key]
      const value = raw == null ? '' : String(raw)
      if (!value || seen.has(value)) continue
      seen.add(value)
      out.push({ value, label: value })
    }
    return out
  }

  return (
    <div className="tasks-toolbar" data-testid="fsdb-share-query">
      <div className="tasks-toolbar-left" />
      <div className="tasks-toolbar-right">
        <HeadlessDismiss
          enabled={searchExpanded}
          onDismiss={() => {
            if (!state.q) setSearchOpen(false)
          }}
        >
          <div className={`tasks-search-wrap${searchExpanded ? ' is-open' : ''}`} ref={searchRef}>
            <button
              type="button"
              className="tasks-sort-btn"
              aria-label="搜索"
              aria-expanded={searchExpanded}
              title="搜索"
              onClick={() => setSearchOpen((open) => (searchExpanded && !state.q ? false : true))}
            >
              <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
            </button>
            {searchExpanded ? (
              <input
                className="tasks-search"
                value={state.q}
                placeholder="搜索"
                aria-label="搜索"
                data-testid="fsdb-share-search"
                onChange={(event) => onChange({ ...state, q: event.target.value })}
              />
            ) : null}
          </div>
        </HeadlessDismiss>
        <div className="tasks-sort-wrap" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${sortOpen ? ' is-active' : ''}${state.sorts.length ? ' is-custom' : ''}`}
            aria-label="排序"
            title={state.sorts.length ? `${state.sorts.length} 个排序` : '排序'}
            onClick={() => setSortOpen((open) => !open)}
          >
            <ArrowsUpDownIcon aria-hidden className="size-[14px]" />
            {state.sorts.length ? <span className="tasks-sort-dot" aria-hidden /> : null}
          </button>
          {sortOpen ? (
            <HeadlessDismiss
              onDismiss={() => setSortOpen(false)}
              insideRef={sortRef}
              ignoreSelector={QUERY_NEST_IGNORE}
              inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
            >
              <SortQueryMenu sorts={state.sorts} fields={sortFields} onChange={(sorts) => onChange({ ...state, sorts })} />
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={filterRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${filterOpen || filterActive ? ' is-active' : ''}`}
            aria-label="筛选"
            title={filterActive ? `${countFilterRules(state.filterTree)} 条筛选` : '筛选'}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <FunnelIcon aria-hidden className="size-[14px]" />
            {filterActive ? <span className="tasks-filter-dot" aria-hidden /> : null}
          </button>
          {filterOpen ? (
            <HeadlessDismiss
              onDismiss={() => setFilterOpen(false)}
              insideRef={filterRef}
              ignoreSelector={QUERY_NEST_IGNORE}
              inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
            >
              <FilterQueryMenu
                tree={state.filterTree}
                fields={fields}
                valueOptions={valueOptions}
                onChange={(filterTree) => onChange({ ...state, filterTree })}
              />
            </HeadlessDismiss>
          ) : null}
        </div>
      </div>
    </div>
  )
}
