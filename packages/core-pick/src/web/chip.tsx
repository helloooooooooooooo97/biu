import {
  CircleStackIcon,
  StopCircleIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  RectangleStackIcon,
  DocumentIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ChatBubbleLeftIcon,
  PuzzlePieceIcon,
  TagIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/16/solid'
import type { ComponentType } from 'react'
import { ensureTagChipStyle, TagChipCloseMark, tagTone } from '@biu/public-ui'
import type { PickRef } from './types.ts'
import { chipCaption, chipLabel } from './types.ts'

/** 注入侧可能写 tasks / sessions-db，芯片按规范 kind 取色和图标。 */
const PICK_KIND_ALIAS: Record<string, string> = {
  tasks: 'task',
  pages: 'page',
  plugins: 'plugin',
  sessions: 'session',
  'sessions-db': 'session',
  events: 'event',
  'events-db': 'event',
  views: 'view',
  'views-db': 'view',
  tags: 'tag',
  facets: 'facet',
  'facets-db': 'facet',
}

export function canonicalPickKind(kind: string) {
  const key = String(kind ?? '').trim()
  return PICK_KIND_ALIAS[key] ?? key.replace(/-db$/, '')
}

/** 采集点 kind 字符串映射到分面色板。 */
export function pickKindTone(kind: string) {
  return tagTone(canonicalPickKind(kind))
}

type Glyph = ComponentType<{ className?: string }>

const KIND_ICONS: Record<string, Glyph> = {
  session: ChatBubbleLeftIcon,
  text: DocumentTextIcon,
  task: CheckCircleIcon,
  page: DocumentIcon,
  collection: RectangleStackIcon,
  view: Square3Stack3DIcon,
  plugin: PuzzlePieceIcon,
  message: ChatBubbleLeftIcon,
  reply: ChatBubbleLeftIcon,
  tool: WrenchScrewdriverIcon,
  step: Square3Stack3DIcon,
  event: StopCircleIcon,
  turn: HashtagIcon,
  usage: CircleStackIcon,
  tag: TagIcon,
  facet: RectangleStackIcon,
  record: ClipboardDocumentCheckIcon,
  html: DocumentIcon,
  block: DocumentTextIcon,
}

export function pickKindIcon(kind: string): Glyph {
  return KIND_ICONS[canonicalPickKind(kind)] ?? TagIcon
}

export function PickKindGlyph({ kind }: { kind: string }) {
  const Icon = pickKindIcon(kind)
  return <Icon className="pick-kind-icon" aria-hidden data-testid="pick-kind-icon" data-pick-kind={kind} />
}

export function PickChipLabel({ pick }: { pick: PickRef }) {
  const { name, span } = chipCaption(pick)
  return (
    <>
      <PickKindGlyph kind={pick.kind} />
      <span className="pick-chip-name">{name}</span>
      {span ? <span className="pick-chip-lines">({span})</span> : null}
    </>
  )
}

export function PickChip({ pick, onRemove }: { pick: PickRef; onRemove?: () => void }) {
  ensureTagChipStyle()
  const label = chipLabel(pick)
  return (
    <span
      className="biu-tag composer-tool-chip is-pick"
      data-testid="user-pick-chip"
      data-pick-kind={pick.kind}
      title={`${pick.kind} · ${label}`}
      style={{ ['--biu-tag' as string]: pickKindTone(pick.kind) }}
    >
      <PickChipLabel pick={pick} />
      {onRemove ? (
        <button
          type="button"
          className="biu-tag-x"
          aria-label={`移除 ${label}`}
          contentEditable={false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
        >
          <TagChipCloseMark />
        </button>
      ) : null}
    </span>
  )
}
