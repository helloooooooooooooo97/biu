import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import { ChevronDownIcon, ChevronUpIcon, EllipsisHorizontalIcon, HashtagIcon } from '@heroicons/react/16/solid'
import { AnchorMenu, RecordEmojiBoard } from '@biu/public-ui'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { contentFieldKey, fieldHasValue, formatField, resolveFieldType } from './fields.ts'
import { LocalText } from './controls.tsx'
import { FilePreview, placedActions } from './fsdb-cells.tsx'
import { PropertyRow } from './property-row.tsx'
import { TableGlyph } from './nav-glyphs.tsx'
import { normalizeRecordEmoji, recordPreviewEmoji } from './sidebar-preview.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, shouldLeaveContentForTitle, shouldLeaveTitleForContent, focusRecordTitleNear } from './title-content-nav.ts'
import { HeadingOutline } from './heading-outline.tsx'
import { PageBanner } from './page-banner.tsx'

function DetailTitleIcon({
  emoji,
  tableIcon,
  label,
  record,
  Icon,
  onChange,
}: {
  emoji: string
  tableIcon?: string
  label: string
  record: DbRecord
  Icon?: CollectionChrome['Icon']
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <span className="fsdb-detail-title-icon-wrap">
      <button
        type="button"
        className="fsdb-detail-title-icon"
        title={emoji ? '更换图标' : '设置图标'}
        aria-label={emoji ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
        onClick={(event) => {
          const btn = event.currentTarget
          setOpen((prev) => {
            if (prev) {
              setAnchor(null)
              return false
            }
            setAnchor(btn)
            return true
          })
        }}
      >
        {emoji ? (
          <span className="fsdb-record-emoji">{emoji}</span>
        ) : Icon ? (
          <span className="fsdb-record-mark is-lg">
            <Icon record={record} />
          </span>
        ) : (
          <TableGlyph icon={tableIcon} className="size-8" />
        )}
      </button>
      {open && anchor ? (
        <RecordEmojiBoard
          anchor={anchor}
          onPick={(next) => {
            onChange(normalizeRecordEmoji(next))
            setOpen(false)
            setAnchor(null)
          }}
          onClear={() => {
            onChange('')
            setOpen(false)
            setAnchor(null)
          }}
          onClose={() => {
            setOpen(false)
            setAnchor(null)
          }}
        />
      ) : null}
    </span>
  )
}

function DetailMore({
  record,
  Tools,
  actions,
  onDelete,
  deleteLabel,
}: {
  record: DbRecord
  Tools?: CollectionChrome['DetailTools']
  actions?: ReactNode
  onDelete?: () => void
  deleteLabel: string
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  const actionMenu =
    actions && isValidElement(actions)
      ? cloneElement(actions as ReactElement<{ onDone?: () => void }>, { onDone: close })
      : actions
  return (
    <>
      <button
        type="button"
        className="fsdb-detail-float-btn"
        title="操作"
        aria-label="记录操作"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        data-testid="fsdb-detail-more"
        onClick={(event) => setAnchor((prev) => (prev ? null : event.currentTarget))}
      >
        <EllipsisHorizontalIcon aria-hidden />
      </button>
      {anchor ? (
        <AnchorMenu
          anchor={anchor}
          onClose={close}
          className="fsdb-detail-more-menu"
          role="menu"
          minWidth={168}
          placement="right"
        >
          {Tools ? <Tools record={record} onDone={close} /> : null}
          {actionMenu}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="fsdb-detail-more-item is-danger"
              data-testid="fsdb-detail-delete"
              onClick={() => {
                close()
                onDelete()
              }}
            >
              <TrashGlyph aria-hidden className="size-4" />
              {deleteLabel}
            </button>
          ) : null}
        </AnchorMenu>
      ) : null}
    </>
  )
}

export function RecordDetail({
  selected,
  schema,
  chrome,
  draft,
  detailBody,
  labelOf,
  renderCell,
  setDraft,
  writeOne,
  writePatch,
  tableIcon,
  onOpenRecord,
  onPrev,
  onNext,
  canPrev,
  canNext,
  headingOutline = true,
  toolbar,
  collectionPath,
  onDelete,
}: {
  selected: DbRecord
  schema: CollectionSchema
  chrome?: CollectionChrome
  draft: Record<string, string>
  detailBody: unknown
  labelOf: (row: DbRecord) => string
  renderCell: (row: DbRecord, key: string, field: FieldSpec) => ReactNode
  setDraft: Dispatch<SetStateAction<Record<string, string>>>
  writeOne: (row: DbRecord, key: string, field: FieldSpec, raw: string) => Promise<unknown> | void
  writePatch: (row: DbRecord, patch: Record<string, unknown>) => Promise<unknown> | void
  tableIcon?: string
  onOpenRecord?: (recordId: string, collection?: string) => void
  onPrev?: () => void
  onNext?: () => void
  canPrev?: boolean
  canNext?: boolean
  headingOutline?: boolean
  toolbar?: ReactNode
  collectionPath?: string
  onDelete?: () => void
}) {
  const mainRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onTitle = () => {
      const go = () => focusRecordTitleNear(mainRef.current)
      go()
      requestAnimationFrame(go)
    }
    window.addEventListener(FOCUS_RECORD_TITLE, onTitle)
    return () => window.removeEventListener(FOCUS_RECORD_TITLE, onTitle)
  }, [])

  const [facetOpen, setFacetOpen] = useState(false)
  useEffect(() => {
    setFacetOpen(false)
  }, [selected.id])

  const propertyEntries = Object.entries(schema.fields)
    .filter(([key, field]) => {
      if (key === 'id' || key === 'emoji' || key === schema.labelField) return false
      if (key === contentFieldKey(schema) && resolveFieldType(field) === 'file') return false
      if (chrome?.panes?.some((pane) => pane.id === key)) return false
      const kind = resolveFieldType(field)
      if (kind === 'facet' && !field.writable) return false
      if (field.computed && !fieldHasValue(field, selected[key])) return false
      return true
    })
    .sort(([, a], [, b]) => Number(resolveFieldType(a) === 'facet') - Number(resolveFieldType(b) === 'facet'))

  return (
<div className="fsdb-detail-stage">
          <div className="fsdb-detail-screen" role="main" aria-label="记录详情">
            <div className="fsdb-detail-split">
              <div className="fsdb-detail-main" ref={mainRef}>
                <PageBanner
                  value={selected.banner}
                  writable
                  path={collectionPath ? `${collectionPath}/${selected.id}` : undefined}
                  title={labelOf(selected)}
                  onChange={(next) => {
                    void Promise.resolve(writePatch(selected, { banner: next })).then(() => {
                      window.dispatchEvent(new Event('fsdb:change'))
                    })
                  }}
                />
                <div className="fsdb-detail-title-row">
                <DetailTitleIcon
                  emoji={recordPreviewEmoji(selected)}
                  tableIcon={tableIcon}
                  label={labelOf(selected)}
                  record={selected}
                  Icon={chrome?.Icon}
                  onChange={(next) => {
                    void Promise.resolve(writePatch(selected, { emoji: next })).then(() => {
                      window.dispatchEvent(new Event('fsdb:change'))
                    })
                  }}
                />
                <div className="fsdb-detail-title-block">
                {schema.labelField && schema.fields[schema.labelField]?.writable ? (
                  <h1 className="fsdb-detail-title">
                    <LocalText
                      as="textarea"
                      className="fsdb-detail-title-input"
                      value={draft[schema.labelField] ?? ''}
                      rows={(draft[schema.labelField] ?? '').length > 48 ? 2 : 1}
                      onKeyDown={(event) => {
                        const el = event.currentTarget
                        if (!(el instanceof HTMLTextAreaElement)) return
                        if (event.nativeEvent.isComposing) return
                        if (!shouldLeaveTitleForContent(event.key, event.shiftKey, el.value, el.selectionEnd)) return
                        event.preventDefault()
                        window.dispatchEvent(new Event(FOCUS_RECORD_CONTENT))
                      }}
                      onCommit={(raw) => {
                        const next = raw.trim()
                        setDraft((prev) => ({ ...prev, [schema.labelField!]: next }))
                        if (next && next !== String(selected[schema.labelField!] ?? '')) {
                          void writeOne(selected, schema.labelField!, schema.fields[schema.labelField!]!, next)
                        }
                      }}
                    />
                  </h1>
                ) : (
                  <h1 className="fsdb-detail-title">{labelOf(selected)}</h1>
                )}
                </div>
                </div>
                <div className="fsdb-detail-aside">
                  <div className="fsdb-prop">
                    <span>
                      <HashtagIcon aria-hidden className="size-[14px]" />
                      ID
                    </span>
                    <span className="fsdb-detail-id" title={selected.id}>
                      {selected.id}
                    </span>
                  </div>
                  {propertyEntries.map(([key, field]) => {
                    const kind = resolveFieldType(field)
                    const facet = kind === 'facet'
                    return (
                      <PropertyRow
                        key={key}
                        field={field}
                        fieldKey={key}
                        collapsible={facet}
                        expanded={facet ? facetOpen : undefined}
                        onToggle={facet ? () => setFacetOpen((open) => !open) : undefined}
                      >
                        <div className={facet ? 'fsdb-prop-val is-schema' : 'fsdb-prop-val'} title={formatField(field, selected[key])}>
                          {renderCell(selected, key, field)}
                        </div>
                      </PropertyRow>
                    )
                  })}
                </div>
                {contentFieldKey(schema) && schema.fields[contentFieldKey(schema)!] ? (() => {
                  const key = contentFieldKey(schema)!
                  const spec = schema.fields[key]!
                  const ContentView = chrome?.Content
                  if (ContentView) {
                    return (
                      <div className="fsdb-fileview">
                        <ContentView
                          record={selected}
                          field={key}
                          spec={spec}
                          value={detailBody}
                          writable={spec.writable}
                          path={collectionPath ? `${collectionPath}/${selected.id}` : undefined}
                          onChange={(next) => void writePatch(selected, { [key]: next })}
                        />
                      </div>
                    )
                  }
                  if (spec.writable) {
                    const saved =
                      typeof detailBody === 'string' || detailBody == null
                        ? String(detailBody ?? '')
                        : JSON.stringify(detailBody, null, 2)
                    return (
                      <LocalText
                        as="textarea"
                        className="fsdb-detail-doc"
                        value={draft[key] ?? saved}
                        rows={12}
                        placeholder=""
                        onKeyDown={(event) => {
                          const el = event.currentTarget
                          if (!(el instanceof HTMLTextAreaElement)) return
                          if (
                            !shouldLeaveContentForTitle(
                              event.key,
                              {
                                shiftKey: event.shiftKey,
                                altKey: event.altKey,
                                metaKey: event.metaKey,
                                ctrlKey: event.ctrlKey,
                                isComposing: event.nativeEvent.isComposing,
                              },
                              el.selectionStart ?? 0,
                              el.selectionStart === el.selectionEnd,
                              0,
                            )
                          )
                            return
                          event.preventDefault()
                          if (!focusRecordTitleNear(el)) {
                            window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
                          }
                        }}
                        onCommit={(next) => {
                          setDraft((prev) => ({ ...prev, [key]: next }))
                          if (next !== saved) void writeOne(selected, key, spec, next)
                        }}
                      />
                    )
                  }
                  return (
                    <div className="fsdb-fileview">
                      <FilePreview value={detailBody} />
                    </div>
                  )
                })() : null}
                {chrome?.panes?.length ? (
                  <div className="fsdb-detail-extras">
                    {chrome.panes.map((pane) => {
                      const Pane = pane.Pane
                      const count = pane.badge?.(selected)
                      return (
                        <section key={pane.id} className="fsdb-detail-extra" data-testid={`fsdb-pane-${pane.id}`}>
                          <h3 className="fsdb-detail-extra-title">
                            {pane.label}
                            {count ? <span className="fsdb-detail-extra-count">{count}</span> : null}
                          </h3>
                          <Pane record={selected} openRecord={onOpenRecord} />
                        </section>
                      )
                    })}
                  </div>
                ) : null}
                {chrome?.Board ? <chrome.Board record={selected} openRecord={onOpenRecord} /> : null}
              </div>
            </div>
          </div>
          <HeadingOutline enabled={headingOutline} />
          {(() => {
            const showMore = Boolean(
              chrome?.DetailTools || onDelete || chrome?.Actions || placedActions(schema, 'detail').length,
            )
            if (!onPrev && !onNext && !showMore) return null
            return (
            <nav className="fsdb-detail-float-nav" aria-label="按视图顺序切换记录">
              {onPrev || onNext ? (
                <button
                  type="button"
                  className="fsdb-detail-float-btn"
                  title="上一条"
                  aria-label="上一条"
                  disabled={!canPrev}
                  onClick={onPrev}
                >
                  <ChevronUpIcon aria-hidden />
                </button>
              ) : null}
              {showMore ? (
                <DetailMore
                  record={selected}
                  Tools={chrome?.DetailTools}
                  actions={toolbar}
                  onDelete={onDelete}
                  deleteLabel={collectionPath === '/pages' ? '删除页面' : '删除记录'}
                />
              ) : null}
              {onPrev || onNext ? (
                <button
                  type="button"
                  className="fsdb-detail-float-btn"
                  title="下一条"
                  aria-label="下一条"
                  disabled={!canNext}
                  onClick={onNext}
                >
                  <ChevronDownIcon aria-hidden />
                </button>
              ) : null}
            </nav>
            )
          })()}
        </div>
  )
}
