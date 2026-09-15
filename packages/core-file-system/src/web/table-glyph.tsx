import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  BellIcon,
  BoltIcon,
  DocumentIcon,
  EyeIcon,
  TagIcon,
  PuzzlePieceIcon,
  RectangleStackIcon,
  RectangleGroupIcon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'

export function TableGlyph({ icon, className = 'size-4' }: { icon?: string; className?: string }) {
  const name = (icon ?? '').trim().toLowerCase()
  if (name === 'puzzle-piece' || name === 'puzzle') return <PuzzlePieceIcon aria-hidden className={className} />
  if (name === 'check-circle' || name === 'check' || name === 'clipboard-document-list' || name === 'clipboard') {
    return <CheckCircleIcon aria-hidden className={className} />
  }
  if (name === 'chat-bubble' || name === 'chat-bubble-left-right') return <ChatBubbleLeftRightIcon aria-hidden className={className} />
  if (name === 'document' || name === 'document-text' || name === 'page') return <DocumentIcon aria-hidden className={className} />
  if (name === 'bolt') return <BoltIcon aria-hidden className={className} />
  if (name === 'bell') return <BellIcon aria-hidden className={className} />
  if (name === 'eye') return <EyeIcon aria-hidden className={className} />
  if (name === 'tag') return <TagIcon aria-hidden className={className} />
  if (name === 'rectangle-stack' || name === 'collection') return <RectangleStackIcon aria-hidden className={className} />
  if (name === 'rectangle-group' || name === 'squares-2x2' || name === 'widgets') return <RectangleGroupIcon aria-hidden className={className} />
  return <TableCellsIcon aria-hidden className={className} />
}
