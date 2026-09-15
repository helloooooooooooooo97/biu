import { useRef, useState } from 'react'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  Bars3BottomLeftIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE } from '@biu/public-ui'
import type { CollectionSchema, DbRecord, FieldType } from '@biu/type-file-system'
import { countFilterRules, isCustomSorts } from '../query-logic.ts'
import { defaultColumnKeys, resolveFieldType } from './fields.ts'
import { FieldGlyph, ModeGlyph, VIEW_MODES } from './fsdb-cells.tsx'
import { CheckRow } from './controls.tsx'
import { FilterQueryMenu, SortQueryMenu, type QueryField } from './query-menus.tsx'
import { shareTableColumns } from './share-table.tsx'
import type { ShareQueryState } from './share-query.ts'

const QUERY_NEST_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`

function queryFieldsOf(schema: CollectionSchema): QueryField[] {
  const body = schema.contentField
  return Object.entries(schema.fields)
    .filter(([key, field]) => key !== body && resolveFieldType(field) !== 'file')
    .map(([key, field]) => ({ key, field, kind: resolveFieldType(field) as FieldType }))
}

function allColumnKeys(schema: CollectionSchema) {
  return shareTableColumns(schema, { columns: defaultColumnKeys(schema, Object.keys(schema.fields)) }).map((item) => item.key)
}

export function ShareViewQueryBar({
  schema,
  records,
  state,
  onChange,
  onRefresh,
  refreshing = false,
}: {
  schema: CollectionSchema
  records: DbRecord[]
  state: ShareQueryState
  onChange: (next: ShareQueryState) => void
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const fields = queryFieldsOf(schema)
  const sortFields = fields.filter((item) => item.field.sortable !== false)
  const filterActive = countFilterRules(state.filterTree) > 0
  const sortCustom = isCustomSorts(state.sorts, schema.labelField)
  const defaults = allColumnKeys(schema)
  const visible = (state.columns.length ? state.columns : defaults).filter((key) => schema.fields[key])
  const searchRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(Boolean(state.q))
  const [modeOpen, setModeOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [columnOpen, setColumnOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
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

  function toggleColumn(key: string) {
    if (key === schema.labelField) return
    const current = visible.includes(key) ? visible.filter((item) => item !== key) : pinVisible([...visible, key])
    onChange({ ...state, columns: current })
  }

  function pinVisible(keys: string[]) {
    const label = schema.labelField
    if (!label || keys.includes(label)) return keys
    return [label, ...keys]
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
              className={`tasks-sort-btn${searchExpanded ? ' is-active' : ''}`}
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
        <div className="tasks-sort-wrap" ref={modeRef}>
          <button
            type="button"
            className={`tasks-sort-btn${modeOpen ? ' is-active' : ''}`}
            aria-label="查看模式"
            title="模式：表格"
            onClick={() => setModeOpen((open) => !open)}
          >
            <ModeGlyph id="table" />
          </button>
          {modeOpen ? (
            <HeadlessDismiss onDismiss={() => setModeOpen(false)} insideRef={modeRef}>
              <div className="tasks-sort-menu" role="menu">
                <div className="tasks-sort-head">查看模式</div>
                {VIEW_MODES.map((opt) => (
                  <CheckRow
                    key={opt.id}
                    icon={<ModeGlyph id={opt.id} />}
                    label={opt.label}
                    on={opt.id === 'table'}
                    locked={opt.id === 'table'}
                    onToggle={() => setModeOpen(false)}
                  />
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-sort-wrap" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${sortOpen ? ' is-active' : ''}${sortCustom ? ' is-custom' : ''}`}
            aria-label="排序"
            title={sortCustom ? `${state.sorts.length} 个排序` : '排序'}
            onClick={() => setSortOpen((open) => !open)}
          >
            <ArrowsUpDownIcon aria-hidden className="size-[14px]" />
            {sortCustom ? <span className="tasks-sort-dot" aria-hidden /> : null}
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
        <div className="tasks-sort-wrap" ref={columnRef}>
          <button
            type="button"
            className={`tasks-sort-btn${columnOpen ? ' is-active' : ''}`}
            aria-label="可见列"
            title="可见列"
            onClick={() => setColumnOpen((open) => !open)}
          >
            <EyeIcon aria-hidden className="size-[14px]" />
          </button>
          {columnOpen ? (
            <HeadlessDismiss onDismiss={() => setColumnOpen(false)} insideRef={columnRef}>
              <div className="tasks-sort-menu fsdb-col-menu" role="menu">
                <div className="tasks-sort-head">可见列</div>
                <div className="fsdb-col-menu-list">
                  {fields.map((item) => (
                    <CheckRow
                      key={item.key}
                      icon={<FieldGlyph kind={item.kind} />}
                      label={item.field.label ?? item.key}
                      on={visible.includes(item.key)}
                      locked={item.key === schema.labelField}
                      onToggle={() => toggleColumn(item.key)}
                    />
                  ))}
                </div>
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={configRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${configOpen ? ' is-active' : ''}`}
            aria-label="表格配置"
            title="表格显示"
            onClick={() => setConfigOpen((open) => !open)}
          >
            <AdjustmentsHorizontalIcon aria-hidden className="size-[14px]" />
          </button>
          {configOpen ? (
            <HeadlessDismiss onDismiss={() => setConfigOpen(false)} insideRef={configRef}>
              <div className="tasks-filter-menu" role="menu">
                <div className="tasks-sort-head">表格显示</div>
                <CheckRow
                  icon={<Bars3BottomLeftIcon aria-hidden className="size-[14px]" />}
                  label="单元格换行"
                  on={state.wrap}
                  onToggle={() => onChange({ ...state, wrap: !state.wrap })}
                />
                <CheckRow
                  icon={<EllipsisHorizontalIcon aria-hidden className="size-[14px]" />}
                  label="文本缩略"
                  on={state.truncate}
                  onToggle={() => onChange({ ...state, truncate: !state.truncate })}
                />
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="fsdb-refresh-wrap">
          <button
            type="button"
            className={`tasks-refresh${refreshing ? ' is-spinning' : ''}`}
            aria-label="刷新"
            title="刷新"
            disabled={refreshing}
            onClick={() => onRefresh?.()}
          >
            <ArrowPathIcon aria-hidden className={`size-[14px]${refreshing ? ' fsdb-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
