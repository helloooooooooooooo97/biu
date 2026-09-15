import {
  CircleStackIcon,
  ShareIcon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'
import type { ViewMode } from './fields.ts'
import type { CrumbKind } from './sidebar-nav.ts'
import { RecordMark, recordMarkStub } from './record-mark.tsx'
import { getDatabaseUi } from './database-ui.ts'
import { TableGlyph } from './table-glyph.tsx'
export { TableGlyph } from './table-glyph.tsx'

export function ViewModeGlyph({ mode, className = 'size-4' }: { mode?: ViewMode; className?: string }) {
  if (mode === 'table' || !mode) return <TableCellsIcon aria-hidden className={className} />
  return <ShareIcon aria-hidden className={className} />
}

export function CrumbItemGlyph({
  kind,
  icon,
  mode,
  emoji,
  mascot,
  collection,
  recordId,
  className = 'chat-view-project-icon',
}: {
  kind: CrumbKind
  icon?: string
  mode?: ViewMode
  emoji?: string
  mascot?: unknown
  collection?: string
  recordId?: string
  className?: string
}) {
  if (kind === 'record') {
    const Icon = collection ? getDatabaseUi()?.chrome(collection).Icon : undefined
    const record = recordId ? recordMarkStub({ id: recordId, emoji, mascot }) : undefined
    return <RecordMark record={record} emoji={emoji} tableIcon={icon} Icon={Icon} className={className} />
  }
  if (kind === 'view') return <ViewModeGlyph mode={mode} className={className} />
  if (kind === 'collection') return <TableGlyph icon={icon} className={className} />
  return <CircleStackIcon aria-hidden className={className} />
}
