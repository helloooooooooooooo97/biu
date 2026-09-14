import { ArchiveBoxArrowDownIcon, ArrowPathIcon, PlayIcon, StopIcon } from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { asHttpHref } from '@biu/type-file-system'
import type { CollectionActionInfo, DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsActionProps, FsActionsProps, FsCellProps } from '@biu/type-file-system/ui'

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

function runningOf(record: DbRecord) {
  return record.running === true || record.running === 'true'
}

function matchWhen(record: DbRecord, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}

function btnClass(place: 'row' | 'detail', danger?: boolean) {
  if (place === 'detail') return `fsdb-detail-more-item${danger ? ' is-danger' : ''}`
  return `tasks-icon-btn${danger ? ' is-danger' : ''}`
}

function PluginAction({ action, busy, run, className, place }: FsActionProps & { className: string; place: 'row' | 'detail' }) {
  const icon =
    action.id === 'uninstall' ? (
      <TrashGlyph aria-hidden className="size-[14px]" />
    ) : action.id === 'pack' ? (
      <ArchiveBoxArrowDownIcon aria-hidden className="size-[14px]" />
    ) : action.id === 'reload' ? (
      <ArrowPathIcon aria-hidden className="size-[14px]" />
    ) : null
  return (
    <button
      type="button"
      role={place === 'detail' ? 'menuitem' : undefined}
      className={className}
      title={action.label}
      data-dock-tip={action.label}
      aria-label={action.label}
      disabled={busy}
      onClick={run}
    >
      {icon ?? action.label}
      {place === 'detail' && icon ? action.label : null}
    </button>
  )
}

function PluginRunButton({
  running,
  busy,
  className,
  place,
  onClick,
}: {
  running: boolean
  busy: boolean
  className: string
  place: 'row' | 'detail'
  onClick: () => void
}) {
  const label = running ? '停止' : '运行'
  return (
    <button
      type="button"
      role={place === 'detail' ? 'menuitem' : undefined}
      className={className}
      title={label}
      data-dock-tip={place === 'detail' ? undefined : label}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
    >
      {running ? <StopIcon aria-hidden className="size-[14px]" /> : <PlayIcon aria-hidden className="size-[14px]" />}
      {place === 'detail' ? label : null}
    </button>
  )
}

function PluginActions({ actions, record, busy, place, run }: FsActionsProps) {
  const cls = btnClass(place)
  const start = actions.find((action) => action.id === 'start' && matchWhen(record, action.when))
  const stop = actions.find((action) => action.id === 'stop' && matchWhen(record, action.when))
  const running = runningOf(record)
  const current: CollectionActionInfo | undefined = running ? stop : start
  const rest = actions.filter(
    (action) => action.id !== 'start' && action.id !== 'stop' && matchWhen(record, action.when),
  )
  return (
    <>
      {start || stop ? (
        <PluginRunButton
          running={running}
          busy={busy}
          place={place}
          className={cls}
          onClick={() => {
            if (current) run(current)
          }}
        />
      ) : null}
      {rest.map((action) => (
        <PluginAction
          key={action.id}
          action={action}
          record={record}
          busy={busy}
          place={place}
          run={() => run(action)}
          className={btnClass(place, action.tone === 'danger')}
        />
      ))}
    </>
  )
}

export const pluginsChrome: CollectionChrome = {
  cells: {
    author: PluginAuthorCell,
  },
  Title: PluginTitle,
  Actions: PluginActions,
}
