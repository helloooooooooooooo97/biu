import { asHttpHref } from '@biu/type-file-system'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsCellProps } from '@biu/type-file-system/ui'

function PluginTitle({ record, label }: { record: DbRecord; label: string }) {
  const enabled = record.enabled === true || record.enabled === 'true'
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {enabled ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-(--dsw-ok,#22c55e)"
          data-testid="plugin-enabled-dot"
          aria-hidden
        />
      ) : null}
      <span className="truncate font-medium">{label}</span>
    </span>
  )
}

function PluginAuthorCell({ record, fallback }: FsCellProps) {
  const name = fallback === '—' ? '' : fallback
  const href = asHttpHref(record.authorUrl)
  if (!name && !href) return <span className="text-(--dsw-label-3)">—</span>
  if (!href) return <span>{name || '—'}</span>
  return (
    <a
      className="min-w-0 truncate text-(--dsw-accent) underline-offset-2 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      {name || href}
    </a>
  )
}

export const pluginsChrome: CollectionChrome = {
  cells: {
    author: PluginAuthorCell,
  },
  Title: PluginTitle,
}
