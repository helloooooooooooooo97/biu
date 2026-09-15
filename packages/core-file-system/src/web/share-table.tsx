import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { ensureTagChipStyle } from '@biu/public-ui'
import { formatField, pinLabelColumn, contentFieldKey, resolveFieldType, defaultColumnKeys } from './fields.ts'
import { DefaultCell, FieldGlyph } from './fsdb-cells.tsx'
import { SchemaChips } from './schema-field.tsx'
import { loadFacets } from './facet-catalog.ts'
import { RecordMark } from './record-mark.tsx'
import { crumbRecordLabel } from './sidebar-preview.ts'
import { colWidthStyle, tableWidthStyle, type SavedView } from './saved-view.ts'

export function shareTableColumns(schema: CollectionSchema, view?: Partial<SavedView>) {
  const body = contentFieldKey(schema)
  const requested = view?.columns?.length ? view.columns : defaultColumnKeys(schema, Object.keys(schema.fields))
  const keys = pinLabelColumn(
    schema,
    requested.filter((key) => {
      const field = schema.fields[key]
      if (!field || key === body) return false
      return resolveFieldType(field) !== 'file'
    }),
  )
  return keys
    .map((key) => {
      const field = schema.fields[key]
      if (!field) return null
      return { key, field, kind: resolveFieldType(field) }
    })
    .filter(Boolean) as Array<{ key: string; field: FieldSpec; kind: ReturnType<typeof resolveFieldType> }>
}

export function ShareCell({
  row,
  fieldKey,
  field,
  records,
  collection,
  schema,
  chrome,
}: {
  row: DbRecord
  fieldKey: string
  field: FieldSpec
  records: DbRecord[]
  collection: string
  schema: CollectionSchema
  chrome?: CollectionChrome
}) {
  const kind = resolveFieldType(field)
  const Custom = chrome?.cells?.[fieldKey]
  if (Custom) {
    return <Custom field={fieldKey} spec={field} value={row[fieldKey]} record={row} fallback={formatField(field, row[fieldKey])} />
  }
  if (kind === 'facet') return <SchemaChips value={row[fieldKey]} tags={loadFacets()} />
  return (
    <DefaultCell
      field={field}
      fieldKey={fieldKey}
      records={records}
      collectionPath={collection}
      labelField={schema.labelField}
      value={row[fieldKey]}
    />
  )
}

export function ShareListTable({
  schema,
  view,
  records,
  collection,
  chrome,
  onOpen,
}: {
  schema: CollectionSchema
  view?: Partial<SavedView>
  records: DbRecord[]
  collection: string
  chrome?: CollectionChrome
  onOpen: (recordId: string) => void
}) {
  ensureTagChipStyle()
  const columns = shareTableColumns(schema, view)
  const labelKey = schema.labelField
  const widths = view?.columnWidths ?? {}
  const wrap = Boolean(view?.wrap)
  const truncate = Boolean(view?.truncate)
  const hasColWidths = Object.keys(widths).length > 0

  return (
    <div className="tasks-table-wrap">
      <table
        className={`tasks-table${wrap ? ' is-wrap' : ''}${truncate ? ' is-truncate' : ''}${hasColWidths ? ' is-cols-fixed' : ''}`}
        style={tableWidthStyle(widths, columns.map((col) => col.key))}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={colWidthStyle(widths[col.key])}>
                <span className="tasks-th">
                  <FieldGlyph kind={col.kind} />
                  {String(col.field.label ?? col.key)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={row.id} data-testid="fsdb-share-row" data-record-id={row.id} onClick={() => onOpen(row.id)}>
              {columns.map((col) => {
                const cell = (
                  <ShareCell
                    row={row}
                    fieldKey={col.key}
                    field={col.field}
                    records={records}
                    collection={collection}
                    schema={schema}
                    chrome={chrome}
                  />
                )
                return (
                  <td key={col.key} style={colWidthStyle(widths[col.key])}>
                    {col.key === labelKey ? (
                      <span className="fsdb-title-host">
                        <RecordMark record={row} Icon={chrome?.Icon} />
                        <span className="fsdb-title-text">
                          {chrome?.Title ? <chrome.Title record={row} label={crumbRecordLabel(row, labelKey)} /> : cell}
                        </span>
                      </span>
                    ) : (
                      <span className="fsdb-cell">{cell}</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
