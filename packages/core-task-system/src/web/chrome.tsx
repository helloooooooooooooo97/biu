import { LockClosedIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsCellProps } from '@biu/type-file-system/ui'
import { ReportsPane, ScriptPane } from './detail-panes.tsx'

function TaskTitle({ record, label }: { record: DbRecord; label: string }) {
  const chain = String(record.parentChain ?? '')
  return (
    <span className={`tasks2-title${record.status === 'done' || record.status === 'failed' ? ' is-done' : ''}`}>
      {chain ? <span className="tasks-queue-chain">{chain} / </span> : null}
      {label}
      {record.blocked ? (
        <span className="tasks-queue-lock" title="被依赖任务阻塞">
          <LockClosedIcon aria-hidden className="size-[14px]" />
        </span>
      ) : null}
    </span>
  )
}

function formatTokens(n: number) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function UsageCell({ record, value }: FsCellProps) {
  const parts = record.usageParts
  const usage =
    parts && typeof parts === 'object' && !Array.isArray(parts)
      ? {
          inputTokens: Number((parts as { inputTokens?: unknown }).inputTokens) || 0,
          outputTokens: Number((parts as { outputTokens?: unknown }).outputTokens) || 0,
          cacheReadTokens: Number((parts as { cacheReadTokens?: unknown }).cacheReadTokens) || 0,
          totalTokens: Number((parts as { totalTokens?: unknown }).totalTokens) || Number(value) || 0,
          aggregate: Boolean((parts as { aggregate?: unknown }).aggregate),
        }
      : {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          totalTokens: Number(value) || 0,
          aggregate: false,
        }
  if (usage.totalTokens <= 0) return <span className="traj-usage-empty">—</span>
  const pct =
    usage.inputTokens && usage.cacheReadTokens ? Math.min(100, Math.round((usage.cacheReadTokens / usage.inputTokens) * 100)) : null
  return (
    <span
      className={`traj-usage${usage.aggregate ? ' is-agg' : ''}`}
      title={
        usage.aggregate
          ? `子树聚合：in ${formatTokens(usage.inputTokens)} / out ${formatTokens(usage.outputTokens)}`
          : `本任务：in ${formatTokens(usage.inputTokens)} / out ${formatTokens(usage.outputTokens)}${usage.cacheReadTokens ? ` / cache ${formatTokens(usage.cacheReadTokens)}` : ''}`
      }
    >
      <span className="traj-usage-in-pair">
        <span className="traj-usage-in">{formatTokens(usage.inputTokens)}</span>
        <svg className="traj-usage-ring is-cache" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="#0a3d28" strokeWidth="2.5" />
          {(pct ?? 0) > 0 ? (
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="none"
              stroke="#00c972"
              strokeWidth="2.5"
              strokeDasharray={`${((pct ?? 0) / 100) * 2 * Math.PI * 4.5} ${2 * Math.PI * 4.5}`}
              transform="rotate(-90 6 6)"
            />
          ) : null}
        </svg>
      </span>
      <span className="traj-usage-arrow" aria-hidden>
        →
      </span>
      <span className="traj-usage-out">{formatTokens(usage.outputTokens)}</span>
    </span>
  )
}

export const tasksChrome: CollectionChrome = {
  Title: TaskTitle,
  cells: {
    usage: UsageCell,
  },
  panes: [
    {
      id: 'script',
      label: '脚本',
      badge: (record) => {
        const trigger = record.trigger as { cron?: string; at?: number; on?: string[]; enabled?: boolean } | undefined
        if (!trigger) return undefined
        const n = (trigger.cron ? 1 : 0) + (trigger.at ? 1 : 0) + (trigger.on?.length ?? 0)
        return n || undefined
      },
      Pane: ScriptPane,
    },
    {
      id: 'reports',
      label: '进度汇报',
      badge: (record) => (Array.isArray(record.reports) && record.reports.length ? record.reports.length : undefined),
      Pane: ReportsPane,
    },
  ],
}
