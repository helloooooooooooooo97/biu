import { useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { FieldSpec, FieldType } from '@biu/type-file-system'
import { CellSelect } from '@biu/database-ui'
import { overlayZ } from '@biu/public-ui'
import { FieldGlyph } from './fsdb-cells.tsx'
import { DndGrip } from './dnd-grip.tsx'
import {
  countFilterRules,
  defaultOpForKind,
  emptyFilterGroup,
  emptyFilterRule,
  emptySortRule,
  moveList,
  opsForKind,
  sortDirLabel,
  type FilterGroup,
  type FilterNode,
  type FilterOp,
  type FilterRule,
  type SortRule,
} from '../query-logic.ts'

export type QueryField = { key: string; kind: FieldType; field: FieldSpec }

const WITHIN = [
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 1 天' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
]

type SortFieldOption = { value: string; label: string; icon?: ReactNode }

function SortRuleFields({
  rule,
  kind,
  options,
  sorts,
  onChange,
}: {
  rule: SortRule
  kind: FieldType
  options: SortFieldOption[]
  sorts: SortRule[]
  onChange: (next: SortRule[]) => void
}) {
  return (
    <>
      <CellSelect
        value={rule.field}
        options={options}
        variant="field"
        onSelect={(next) => onChange(sorts.map((item) => (item.id === rule.id ? { ...item, field: next } : item)))}
      />
      <CellSelect
        value={rule.dir}
        options={[
          { value: 'asc', label: sortDirLabel(kind, 'asc') },
          { value: 'desc', label: sortDirLabel(kind, 'desc') },
        ]}
        variant="field"
        onSelect={(next) =>
          onChange(sorts.map((item) => (item.id === rule.id ? { ...item, dir: next === 'desc' ? 'desc' : 'asc' } : item)))
        }
      />
      <button
        type="button"
        className="fsdb-query-x"
        aria-label="删除这条排序"
        onClick={() => onChange(sorts.filter((item) => item.id !== rule.id))}
      >
        <XMarkIcon aria-hidden className="size-[14px]" />
      </button>
    </>
  )
}

function SortableSortRow({
  rule,
  kind,
  options,
  sorts,
  onChange,
}: {
  rule: SortRule
  kind: FieldType
  options: SortFieldOption[]
  sorts: SortRule[]
  onChange: (next: SortRule[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  return (
    <div
      ref={setNodeRef}
      className={`fsdb-query-row${isDragging ? ' is-drag' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="fsdb-query-grip" aria-label="拖动调整排序顺序" {...attributes} {...listeners}>
        <DndGrip />
      </button>
      <SortRuleFields rule={rule} kind={kind} options={options} sorts={sorts} onChange={onChange} />
    </div>
  )
}

export function SortQueryMenu({
  sorts,
  fields,
  onChange,
}: {
  sorts: SortRule[]
  fields: QueryField[]
  onChange: (next: SortRule[]) => void
}) {
  const options = fields.map((item) => ({
    value: item.key,
    label: item.field.label ?? item.key,
    icon: <FieldGlyph kind={item.kind} />,
  }))
  const used = new Set(sorts.map((item) => item.field))
  const leftover = fields.find((item) => !used.has(item.key))
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const active = sorts.find((item) => item.id === activeId)
  const activeKind = fields.find((item) => item.key === active?.field)?.kind ?? 'string'

  return (
    <div className="fsdb-query-menu" role="menu">
      <div className="tasks-sort-head">排序</div>
      {sorts.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={(event: DragEndEvent) => {
            const overId = event.over?.id
            setActiveId(null)
            if (overId == null || event.active.id === overId) return
            const from = sorts.findIndex((item) => item.id === event.active.id)
            const to = sorts.findIndex((item) => item.id === overId)
            if (from < 0 || to < 0) return
            onChange(moveList(sorts, from, to))
          }}
        >
          <SortableContext items={sorts.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            {sorts.map((rule) => {
              const kind = fields.find((item) => item.key === rule.field)?.kind ?? 'string'
              return (
                <SortableSortRow
                  key={rule.id}
                  rule={rule}
                  kind={kind}
                  options={options}
                  sorts={sorts}
                  onChange={onChange}
                />
              )
            })}
          </SortableContext>
          <DragOverlay zIndex={overlayZ(280)}>
            {active ? (
              <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                <div className="fsdb-query-row">
                  <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                    <DndGrip />
                  </button>
                  <SortRuleFields rule={active} kind={activeKind} options={options} sorts={sorts} onChange={() => {}} />
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="tasks-viewdd-empty">还没有排序</div>
      )}
      {leftover ? (
        <button type="button" className="fsdb-query-add" onClick={() => onChange([...sorts, emptySortRule(leftover.key)])}>
          <PlusIcon aria-hidden className="size-[14px]" />
          添加排序
        </button>
      ) : null}
      {sorts.length ? (
        <button type="button" className="fsdb-query-clear" onClick={() => onChange([])}>
          <TrashGlyph aria-hidden className="size-[14px]" />
          删除排序
        </button>
      ) : null}
    </div>
  )
}

export function FilterQueryMenu({
  tree,
  fields,
  valueOptions,
  onChange,
}: {
  tree: FilterGroup
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  onChange: (next: FilterGroup) => void
}) {
  return (
    <div className="fsdb-query-menu is-filter" role="menu">
      <div className="tasks-sort-head">筛选</div>
      <FilterGroupEditor
        group={tree}
        fields={fields}
        valueOptions={valueOptions}
        root
        onChange={onChange}
      />
      {countFilterRules(tree) ? (
        <button type="button" className="fsdb-query-clear" onClick={() => onChange(emptyFilterGroup())}>
          <TrashGlyph aria-hidden className="size-[14px]" />
          删除筛选
        </button>
      ) : null}
    </div>
  )
}

function FilterGroupEditor({
  group,
  fields,
  valueOptions,
  root,
  onChange,
}: {
  group: FilterGroup
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  root?: boolean
  onChange: (next: FilterGroup) => void
}) {
  function patchChild(id: string, next: FilterNode) {
    onChange({ ...group, children: group.children.map((item) => (item.id === id ? next : item)) })
  }
  function dropChild(id: string) {
    onChange({ ...group, children: group.children.filter((item) => item.id !== id) })
  }
  return (
    <div className={root ? 'fsdb-query-stack' : 'fsdb-query-group'}>
      {group.children.map((child, index) => (
        <div key={child.id} className="fsdb-query-line">
          {index === 0 ? (
            <span className="fsdb-query-join">{root ? '其中' : '其中'}</span>
          ) : (
            <button
              type="button"
              className="fsdb-query-join is-btn"
              onClick={() => onChange({ ...group, combinator: group.combinator === 'and' ? 'or' : 'and' })}
            >
              {group.combinator === 'and' ? '且' : '或'}
            </button>
          )}
          {child.kind === 'rule' ? (
            <FilterRuleRow
              rule={child}
              fields={fields}
              valueOptions={valueOptions}
              onChange={(next) => patchChild(child.id, next)}
              onRemove={() => dropChild(child.id)}
            />
          ) : (
            <div className="fsdb-query-nested">
              <FilterGroupEditor
                group={child}
                fields={fields}
                valueOptions={valueOptions}
                onChange={(next) => patchChild(child.id, next)}
              />
              <button type="button" className="fsdb-query-x is-group" aria-label="删除分组" onClick={() => dropChild(child.id)}>
                <XMarkIcon aria-hidden className="size-[14px]" />
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="fsdb-query-add"
        onClick={() => onChange({ ...group, children: [...group.children, emptyFilterRule(fields[0]?.key ?? 'title')] })}
      >
        <PlusIcon aria-hidden className="size-[14px]" />
        添加筛选条件
      </button>
      <button
        type="button"
        className="fsdb-query-add"
        onClick={() => onChange({ ...group, children: [...group.children, emptyFilterGroup()] })}
      >
        <PlusIcon aria-hidden className="size-[14px]" />
        添加筛选分组
      </button>
    </div>
  )
}

function FilterRuleRow({
  rule,
  fields,
  valueOptions,
  onChange,
  onRemove,
}: {
  rule: FilterRule
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  onChange: (next: FilterRule) => void
  onRemove: () => void
}) {
  const field = fields.find((item) => item.key === rule.field) ?? fields[0]
  const kind = field?.kind ?? 'string'
  const ops = opsForKind(kind)
  const needsValue = rule.op !== 'is_empty' && rule.op !== 'not_empty'
  const options = field ? valueOptions(field) : []

  function setField(next: string) {
    const hit = fields.find((item) => item.key === next)
    const nextKind = hit?.kind ?? 'string'
    onChange({ ...rule, field: next, op: defaultOpForKind(nextKind), value: '' })
  }

  return (
    <div className="fsdb-query-rule">
      <CellSelect
        value={rule.field}
        options={fields.map((item) => ({
          value: item.key,
          label: item.field.label ?? item.key,
          icon: <FieldGlyph kind={item.kind} />,
        }))}
        variant="field"
        onSelect={setField}
      />
      <CellSelect
        value={rule.op}
        options={ops.map((item) => ({ value: item.value, label: item.label }))}
        variant="field"
        onSelect={(next) => onChange({ ...rule, op: (next as FilterOp) || rule.op, value: next === 'within' ? '7d' : '' })}
      />
      {needsValue ? (
        rule.op === 'within' ? (
          <CellSelect value={rule.value} options={WITHIN} variant="field" placeholder="时间" onSelect={(next) => onChange({ ...rule, value: next })} />
        ) : options.length ? (
          <CellSelect
            value={rule.value}
            options={options}
            variant="field"
            allowCreate
            placeholder="值"
            chips={kind === 'select' || kind === 'multi-select' || kind === 'facet'}
            onSelect={(next) => onChange({ ...rule, value: next })}
          />
        ) : (
          <input
            className="fsdb-query-input"
            value={rule.value}
            placeholder="值"
            onChange={(event) => onChange({ ...rule, value: event.target.value })}
          />
        )
      ) : (
        <span className="fsdb-query-spacer" />
      )}
      <button type="button" className="fsdb-query-x" aria-label="删除这条筛选" onClick={onRemove}>
        <XMarkIcon aria-hidden className="size-[14px]" />
      </button>
    </div>
  )
}
