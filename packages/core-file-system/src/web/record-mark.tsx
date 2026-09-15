import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { TableGlyph } from './table-glyph.tsx'
import { recordPreviewEmoji } from './sidebar-preview.ts'

export function recordPreviewMascot(row: Pick<DbRecord, 'id'> & Record<string, unknown> | DbRecord) {
  const raw = row.mascot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const mascot = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof mascot.shape !== 'string' || typeof mascot.color !== 'string') return undefined
  return {
    shape: mascot.shape,
    color: mascot.color,
    ...(typeof mascot.eye === 'number' ? { eye: mascot.eye } : {}),
  }
}

export function recordMarkStub(row: { id: string; emoji?: string; mascot?: unknown }): DbRecord {
  const stub: DbRecord = { id: row.id }
  const emoji = recordPreviewEmoji(row as DbRecord)
  if (emoji) stub.emoji = emoji
  const mascot = recordPreviewMascot(row as DbRecord)
  if (mascot) stub.mascot = mascot
  return stub
}

/** 记录的独立图标属性：有 emoji 用 emoji，否则用集合 Icon（会话小人），再否则表 glyph。 */
export function RecordMark({
  record,
  emoji,
  tableIcon,
  Icon,
  className,
  size = 'sm',
}: {
  record?: DbRecord
  emoji?: string
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  className?: string
  size?: 'sm' | 'lg'
}) {
  const mark = (emoji ?? (record ? recordPreviewEmoji(record) : '')).trim()
  if (mark) return <span className="fsdb-record-emoji">{mark}</span>
  if (Icon && record) {
    return (
      <span className={`fsdb-record-mark is-${size}`}>
        <Icon record={record} />
      </span>
    )
  }
  return (
    <span className={`fsdb-record-mark is-${size}`}>
      <TableGlyph icon={tableIcon} className={className ?? (size === 'lg' ? 'size-8' : 'size-4')} />
    </span>
  )
}
