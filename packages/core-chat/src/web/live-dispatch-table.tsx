import { memo } from 'react'
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/16/solid'
import type { TrajectoryUsage } from '@biu/web-session-view'
import type { DispatchedTaskRow } from '@biu/web-session-view'
import { SidebarMascot } from '@biu/public-mascot'
import { resolveSessionMascot } from '@biu/public-mascot'
import { FolderGlyph } from '@biu/web-session-view/folder-glyph'
import { UsageInline } from './usage-inline.tsx'

export type LiveDispatchTaskRow = DispatchedTaskRow

function statusMeta(status: LiveDispatchTaskRow['status'], reason?: string) {
  if (status === 'complete') {
    return {
      label: '已完成',
      className: 'text-(--dsw-ok,#448361)',
      icon: <CheckCircleIcon className="size-3.5" aria-hidden />,
    }
  }
  if (status === 'running') {
    return {
      label: '运行中',
      className: 'text-(--dsw-business)',
      icon: <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden />,
    }
  }
  if (status === 'pending') {
    return {
      label: '等待中',
      className: 'text-(--dsw-label-3)',
      icon: <MinusCircleIcon className="size-3.5" aria-hidden />,
    }
  }
  return {
    label: reason ? `结束(${reason})` : '已结束',
    className: 'text-(--dsw-danger,#c4554d)',
    icon: <XCircleIcon className="size-3.5" aria-hidden />,
  }
}

function sumUsage(tasks: LiveDispatchTaskRow[]): TrajectoryUsage | undefined {
  let input = 0
  let output = 0
  let total = 0
  let cache = 0
  let hit = false
  for (const task of tasks) {
    if (!task.usage) continue
    hit = true
    input += task.usage.inputTokens
    output += task.usage.outputTokens
    total += task.usage.totalTokens ?? task.usage.inputTokens + task.usage.outputTokens
    cache += task.usage.cacheReadTokens ?? 0
  }
  if (!hit) return undefined
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    ...(cache ? { cacheReadTokens: cache } : {}),
  }
}

export const LiveDispatchTable = memo(function LiveDispatchTable({
  tasks,
}: {
  tasks: LiveDispatchTaskRow[]
}) {
  if (!tasks.length) return null
  const total = sumUsage(tasks)

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-(--dsw-border) bg-(color-mix(in_srgb,var(--dsw-sidebar)_65%,transparent))"
      data-testid="live-dispatch-table"
    >
      <div className="border-b border-(--dsw-border) px-3 py-2 text-(length:--dsw-chat-ui-font-size) font-semibold text-(--dsw-label-2)">
        本回合派工
      </div>
      <table className="w-full table-fixed border-collapse text-left text-(length:--dsw-chat-ui-font-size)">
        <colgroup>
          <col style={{ width: '5.5rem' }} />
          <col style={{ width: '2.75rem' }} />
          <col />
          <col style={{ width: '4.25rem' }} />
          <col style={{ width: '9.5rem' }} />
          <col style={{ width: '2.75rem' }} />
        </colgroup>
        <thead>
          <tr className="text-(length:--dsw-chat-ui-font-size) uppercase tracking-wide text-(--dsw-label-3)">
            <th className="px-2 py-1.5 text-center font-medium">项目</th>
            <th className="px-2 py-1.5 text-center font-medium">代理</th>
            <th className="px-3 py-1.5 text-center font-medium">任务</th>
            <th className="px-2 py-1.5 text-center font-medium">轮次</th>
            <th className="px-2 py-1.5 text-center font-medium">用量</th>
            <th className="px-2 py-1.5 text-center font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const status = statusMeta(task.status, task.reason)
            const identity = resolveSessionMascot(task.sessionId, task.mascot)
            const running = task.status === 'running'
            return (
              <tr
                key={`${task.sessionId}-${task.wakeTs ?? index}`}
                className="live-dispatch-row"
              >
                <td className="min-w-0 px-2 py-2 align-middle">
                  <div
                    className="flex min-w-0 items-center justify-center gap-1 text-(length:--dsw-chat-ui-font-size) text-(--dsw-label-2)"
                    title={task.project?.path ?? task.project?.name}
                  >
                    {task.project?.name ? (
                      <>
                        <FolderGlyph className="size-3 shrink-0 opacity-80" />
                        <span className="min-w-0 truncate">{task.project.name}</span>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 align-middle">
                  <div className="flex justify-center">
                    <SidebarMascot
                      size={22}
                      sessionId={task.sessionId}
                      identity={identity}
                      busy={running}
                      animate={false}
                      title={task.title ?? identity.shape}
                    />
                  </div>
                </td>
                <td className="min-w-0 px-3 py-2 align-middle">
                  <div
                    className="truncate font-semibold text-(--dsw-label)"
                    title={task.preview}
                  >
                    {task.preview?.trim() || '（无派工文本）'}
                  </div>
                </td>
                <td className="px-2 py-2 align-middle tabular-nums text-(--dsw-label-2)">
                  {task.workerTurn != null ? `Turn${task.workerTurn}` : '—'}
                </td>
                <td className="px-2 py-2 align-middle text-left">
                  {task.usage ? (
                    <UsageInline usage={task.usage} />
                  ) : (
                    <span className="traj-usage-empty">—</span>
                  )}
                </td>
                <td className="px-2 py-2 align-middle">
                  <div className={`flex justify-center ${status.className}`} title={status.label}>
                    <span className="inline-flex" aria-label={status.label}>
                      {status.icon}
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-(--dsw-border) bg-(color-mix(in_srgb,var(--dsw-hover)_50%,transparent))">
            <td className="px-2 py-2" colSpan={2} />
            <td className="px-3 py-2 font-semibold text-(--dsw-label)">合计（{tasks.length}）</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 text-left">
              {total ? <UsageInline usage={total} /> : <span className="traj-usage-empty">—</span>}
            </td>
            <td className="px-2 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
})
