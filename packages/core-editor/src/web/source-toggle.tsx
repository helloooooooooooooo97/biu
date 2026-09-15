import { CodeBracketIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { togglePageSourceMode, usePageSourceMode } from './source-mode.ts'

export function SourceToggle({ record, onDone }: { record: DbRecord; onDone?: () => void }) {
  const source = usePageSourceMode(record.id)
  const label = source ? '正文模式' : '源码模式'
  return (
    <button
      type="button"
      role="menuitem"
      className="fsdb-detail-more-item"
      data-testid="page-source-toggle"
      aria-pressed={source}
      onClick={() => {
        togglePageSourceMode(record.id)
        onDone?.()
      }}
    >
      <CodeBracketIcon aria-hidden className="size-4" />
      {label}
    </button>
  )
}
