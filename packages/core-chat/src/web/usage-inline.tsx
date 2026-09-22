import {
  formatTokens,
  formatTrajectoryUsage,
  type TrajectoryUsage,
} from '@biu/web-session-view'
const CACHE_TRACK = 'var(--dsw-usage-track-cache)'
const HIST_TRACK = 'var(--dsw-usage-track-hist)'
const RING_R = 4.5
const RING_C = 2 * Math.PI * RING_R

function UsageRing({
  fill,
  track,
  className,
}: {
  fill: number
  track: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, fill))
  return (
    <svg
      className={className ? `traj-usage-ring ${className}` : 'traj-usage-ring'}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
    >
      <circle cx="6" cy="6" r={RING_R} fill="none" stroke={track} strokeWidth="2.5" />
      {pct > 0 ? (
        <circle
          cx="6"
          cy="6"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={`${(pct / 100) * RING_C} ${RING_C}`}
          transform="rotate(-90 6 6)"
        />
      ) : null}
    </svg>
  )
}

function formatTok(n: number) {
  return formatTokens(n)
}

function cacheHitPct(usage: TrajectoryUsage): number | null {
  if (!usage.inputTokens || !usage.cacheReadTokens) return null
  return Math.min(100, Math.round((usage.cacheReadTokens / usage.inputTokens) * 100))
}

/** 历史占比是 0~1 的有限数值才纳入合成背景。 */
function isHistPct(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
}

/**
 * 分面绿环 = cache hit；分面橙环 = 历史占比。
 * 百分比数字放在悬浮 title。histPct 默认取 usage.histPct。
 */
export function UsageInline({
  usage,
  empty = '—',
  histPct,
}: {
  usage?: TrajectoryUsage
  empty?: string
  /** 历史 turn 输入占比（0~1）；缺省取 usage.histPct，显式传入则覆盖。 */
  histPct?: number
}) {
  if (!usage) return <span className="traj-usage-empty">{empty}</span>
  const pct = cacheHitPct(usage)
  const hist = isHistPct(histPct !== undefined ? histPct : usage.histPct)
    ? Math.round((histPct !== undefined ? histPct : usage.histPct!) * 100)
    : null
  const cacheFill = pct ?? 0
  const cacheTitle =
    pct != null
      ? `input ${formatTok(usage.inputTokens)} · cache hit ${pct}% (${formatTok(usage.cacheReadTokens!)})`
      : `input ${formatTok(usage.inputTokens)}`

  return (
    <span className="traj-usage" title={formatTrajectoryUsage(usage)}>
      <span className="traj-usage-in-pair" title={cacheTitle}>
        <span className="traj-usage-in">{formatTok(usage.inputTokens)}</span>
        <UsageRing className="is-cache" fill={cacheFill} track={CACHE_TRACK} />
      </span>
      {hist != null ? (
        <span title={`历史占比 ${hist}%`} aria-label={`历史占比 ${hist}%`}>
          <UsageRing className="is-hist" fill={hist} track={HIST_TRACK} />
        </span>
      ) : null}
      <span className="traj-usage-arrow" aria-hidden>
        →
      </span>
      <span className="traj-usage-out" title={`output ${formatTok(usage.outputTokens)}`}>
        {formatTok(usage.outputTokens)}
      </span>
    </span>
  )
}
