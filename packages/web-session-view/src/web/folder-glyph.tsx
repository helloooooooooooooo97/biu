import { FolderIcon } from '@heroicons/react/16/solid'

export function FolderGlyph({ className }: { className?: string }) {
  return <FolderIcon className={className ? `shrink-0 ${className}` : 'size-4 shrink-0'} aria-hidden />
}
