import { useEffect, useRef, useState } from 'react'
import {
  normalizeSchemaValue,
  retagSchemaValue,
  type CollectionSchemaPack,
  type DbRecord,
  type FieldSpec,
  type SchemaFieldValue,
} from '@biu/type-file-system'
import { TagChip, TagChips } from '@biu/public-ui'
import { DbSearchOption, ensureDbSearchStyle } from '@biu/database-ui'
import { FieldEditor, fieldDraftValue, parseFieldValue } from './fsdb-cells.tsx'
import { loadFacets, persistFacets, slugFacetId, subscribeFacets } from './facet-catalog.ts'
import { PersonPickPanel } from './person-cell.tsx'
import { RecordPickPanel } from './record-link-cell.tsx'
import { asStringList, isRecordLinkField, isSingleRefField, parseFacetFlatColumnKey, resolveFieldType } from './fields.ts'

type TagOption = { value: string; label: string }

function TagPickPanel({
  values,
  options,
  multiple,
  onChange,
  onPicked,
}: {
  values: string[]
  options: TagOption[]
  multiple: boolean
  onChange: (next: string[]) => void
  onPicked?: () => void
}) {
  ensureDbSearchStyle()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const byValue = new Map(options.map((item) => [item.value, item.label]))
  const available = options.filter(
    (item) =>
      Boolean(item.value) &&
      !values.includes(item.value) &&
      (!q || item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)),
  )
  const draft = query.trim()
  const canCreate =
    Boolean(draft) &&
    !values.includes(draft) &&
    !options.some((item) => item.value === draft || item.label === draft)
  function add(value: string) {
    if (!value) return
    if (multiple) {
      if (!values.includes(value)) onChange([...values, value])
    } else {
      onChange([value])
      onPicked?.()
    }
    setQuery('')
  }
  return (
    <div className="fsdb-cell-pop-tags">
      {values.length ? (
        <div className="fsdb-cell-pop-picked">
          <TagChips>
            {values.map((value) => (
              <TagChip
                key={value}
                id={value}
                label={byValue.get(value) ?? value}
                onRemove={() => onChange(values.filter((item) => item !== value))}
              />
            ))}
          </TagChips>
        </div>
      ) : null}
      <label className="db-search-field">
        <input
          value={query}
          autoFocus
          placeholder=""
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (available[0]) add(available[0].value)
              else if (canCreate) add(draft)
            }
          }}
        />
      </label>
      <div className="db-search-list">
        {available.map((item) => (
          <DbSearchOption key={item.value} onClick={() => add(item.value)}>
            <TagChip id={item.value} label={item.label} />
          </DbSearchOption>
        ))}
        {canCreate ? (
          <DbSearchOption onClick={() => add(draft)}>
            添加 <TagChip id={draft} label={draft} />
          </DbSearchOption>
        ) : null}
      </div>
    </div>
  )
}

function applyFacetTags(parsed: SchemaFieldValue, catalog: CollectionSchemaPack[], nextIds: string[]) {
  let packs = catalog
  const used = new Set(packs.map((tag) => tag.id))
  const resolved: string[] = []
  for (const item of nextIds) {
    if (used.has(item)) {
      resolved.push(item)
      continue
    }
    const hit = packs.find((tag) => tag.label === item)
    if (hit) {
      resolved.push(hit.id)
      continue
    }
    const id = slugFacetId(item, used)
    packs = [...packs, { id, label: item, fields: [] }]
    used.add(id)
    resolved.push(id)
  }
  if (packs !== catalog) persistFacets(packs)
  return retagSchemaValue(parsed, resolved)
}

function FacetPickPanel({ value, onChange }: { value: unknown; onChange: (next: SchemaFieldValue) => void }) {
  const parsed = normalizeSchemaValue(value)
  const liveRef = useRef(parsed)
  const [catalog, setCatalog] = useState(() => loadFacets())
  useEffect(() => subscribeFacets(undefined, () => setCatalog(loadFacets())), [])
  return (
    <TagPickPanel
      values={parsed.tags}
      options={catalog.map((tag) => ({ value: tag.id, label: tag.label }))}
      multiple
      onChange={(next) => {
        const updated = applyFacetTags(liveRef.current, catalog, next)
        liveRef.current = updated
        onChange(updated)
      }}
    />
  )
}

function sameDraft(left: unknown, right: unknown) {
  if (left === right) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

export function CellPopDraft({
  record,
  fieldKey,
  field,
  initial,
  options,
  collectionPath,
  seed,
  labelField,
  onClose,
  onSubmit,
}: {
  record: DbRecord
  fieldKey: string
  field: FieldSpec
  initial: unknown
  options: string[]
  collectionPath: string
  seed?: DbRecord[]
  labelField?: string
  onClose: () => void
  onSubmit: (raw: unknown) => void
}) {
  const kind = resolveFieldType(field)
  const flat = parseFacetFlatColumnKey(fieldKey)
  const [text, setText] = useState(() => fieldDraftValue(field, initial))
  const [raw, setRaw] = useState<unknown>(initial)
  const rawRef = useRef(initial)
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const live =
    kind === 'select' ||
    kind === 'multi-select' ||
    kind === 'datetime' ||
    kind === 'image' ||
    kind === 'attachment' ||
    kind === 'facet' ||
    kind === 'person' ||
    isRecordLinkField(field, fieldKey)

  function put(next: unknown, nextText?: string) {
    rawRef.current = next
    setRaw(next)
    if (nextText != null) setText(nextText)
    if (live && !sameDraft(next, initial)) onSubmitRef.current(next)
  }

  useEffect(
    () => () => {
      const next = rawRef.current
      if (sameDraft(next, initial)) return
      onSubmitRef.current(next)
    },
    [],
  )

  if (isRecordLinkField(field, fieldKey)) {
    return (
      <RecordPickPanel
        field={field}
        fieldKey={fieldKey}
        value={raw}
        collectionPath={collectionPath}
        excludeId={record.id}
        labelField={labelField}
        seed={seed}
        onChange={(next) => put(next)}
        onPicked={isSingleRefField(field, fieldKey) ? onClose : undefined}
        onJump={onClose}
      />
    )
  }

  if (kind === 'select' || kind === 'multi-select') {
    const selected = kind === 'multi-select' ? asStringList(raw) : text ? [text] : asStringList(raw)
    const list = [...new Set([...options, ...selected])].filter(Boolean)
    return (
      <TagPickPanel
        values={selected}
        options={list.map((item) => ({ value: item, label: item }))}
        multiple={kind === 'multi-select'}
        onChange={(next) => {
          const value = kind === 'multi-select' ? next : next[0] ?? ''
          setText(kind === 'multi-select' ? next.join(', ') : value)
          put(kind === 'multi-select' ? next : value)
        }}
        onPicked={kind === 'select' ? onClose : undefined}
      />
    )
  }

  if (kind === 'facet') {
    return <FacetPickPanel value={raw} onChange={(next) => put(next)} />
  }

  if (kind === 'person') {
    return <PersonPickPanel value={raw} onChange={(next) => put(next)} onPicked={onClose} />
  }

  if (kind === 'url') {
    return (
      <input
        className="fsdb-cell-pop-url"
        autoFocus
        placeholder="https://"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          rawRef.current = next.trim()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onClose()
          }
        }}
      />
    )
  }

  if (kind === 'datetime' || kind === 'image' || kind === 'attachment') {
    return (
      <FieldEditor
        fieldKey={flat ? field.label ?? flat.fieldKey : fieldKey}
        field={field}
        value={text}
        source={raw}
        collectionPath={collectionPath}
        autoOpen
        options={options}
        onChange={(next) => {
          setText(next)
          put(parseFieldValue(field, next))
        }}
        onCommit={(next) => put(next, fieldDraftValue(field, next))}
      />
    )
  }

  return (
    <textarea
      className="fsdb-cell-pop-text"
      rows={3}
      autoFocus
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        rawRef.current = next
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onClose()
        }
      }}
    />
  )
}
