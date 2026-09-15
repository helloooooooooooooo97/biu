import { RectangleStackIcon } from '@heroicons/react/16/solid'
import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CollectionRowViewType, FsRowViewProps } from '@biu/type-file-system/ui'
import { formatField } from './fields.ts'

export type BoundRowField = {
  key: string
  spec?: FieldSpec
  value: unknown
  label: string
}

export function bindRowFields(
  record: DbRecord,
  schema: CollectionSchema | undefined,
  columns: string[],
): BoundRowField[] {
  const keys = columns.map((key) => String(key ?? '').trim()).filter(Boolean)
  return keys.map((key) => {
    const spec = schema?.fields[key]
    return {
      key,
      spec,
      value: record[key],
      label: String(spec?.label ?? key),
    }
  })
}

export function BoundFieldsRow({ fields, onOpen }: FsRowViewProps) {
  return (
    <button type="button" className="fsdb-row-card" onClick={onOpen}>
      {fields.map((field) => (
        <span key={field.key} className="fsdb-row-card-field">
          <span className="fsdb-row-card-k">{field.label}</span>
          <span className="fsdb-row-card-v">{formatField(field.spec, field.value) || '—'}</span>
        </span>
      ))}
    </button>
  )
}

export const DEFAULT_ROW_VIEW: CollectionRowViewType = {
  id: 'card',
  label: '卡片',
  plugin: 'core-file-system-ui',
  Icon: RectangleStackIcon,
  Row: BoundFieldsRow,
}

export function CollectionRowsShell({
  rows,
  schema,
  columns,
  onOpen,
  Row,
}: {
  rows: DbRecord[]
  schema?: CollectionSchema
  columns: string[]
  onOpen: (row: DbRecord) => void
  Row: CollectionRowViewType['Row']
}) {
  if (!rows.length) return <p className="fsdb-empty">暂无记录</p>
  return (
    <div className="fsdb-rows-view" data-testid="fsdb-rows-view">
      {rows.map((row) => (
        <div key={row.id} className="fsdb-rows-view-item">
          <Row record={row} fields={bindRowFields(row, schema, columns)} onOpen={() => onOpen(row)} />
        </div>
      ))}
    </div>
  )
}
