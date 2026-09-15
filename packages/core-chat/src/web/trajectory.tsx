import { memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpIcon } from '@heroicons/react/16/solid'
import type { SlotProps } from '@biu/web-slots'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'
import {
  formatTokens,
  sumTrajectoryRowUsage,
  sumUsageParts,
  type DerivedMessage,
  type SessionEvent,
  type TrajectoryRow,
  type TrajectoryUsage,
} from '@biu/web-session-view'
import { UsageInline } from './usage-inline.tsx'
import { pickDomAttrs, pickPreview } from '@biu/core-pick/web'

type TagTone = 'user' | 'assistant' | 'tool' | 'system' | 'turn' | 'step'

async function loadEventDetail(sessionId: string, seq: number): Promise<SessionEvent | null> {
  const res = await fetch(`/api/sessions/${sessionId}/events/${seq}`)
  if (!res.ok) throw new Error(`加载事件失败：${res.status}`)
  const body = (await res.json()) as { event?: SessionEvent }
  return body.event ?? null
}

async function loadEventRequest(sessionId: string, seq: number): Promise<{ messages: DerivedMessage[]; toolsTokens: number }> {
  const res = await fetch(`/api/sessions/${sessionId}/events/${seq}/request`)
  if (!res.ok) throw new Error(`加载 request 失败：${res.status}`)
  const body = (await res.json()) as { messages?: DerivedMessage[]; toolsTokens?: number }
  return {
    messages: Array.isArray(body.messages) ? body.messages : [],
    toolsTokens: typeof body.toolsTokens === 'number' ? body.toolsTokens : 0,
  }
}

function toneOf(type: TrajectoryRow['type']): TagTone {
  if (type.startsWith('user/')) return 'user'
  if (type.startsWith('assistant/')) return 'assistant'
  if (type.startsWith('tool/')) return 'tool'
  if (type.startsWith('system/')) return 'system'
  if (type.startsWith('turn/')) return 'turn'
  if (type.startsWith('step/')) return 'step'
  return 'system'
}

const toneClass: Record<TagTone, string> = {
  user: 'traj-tag traj-tag-user',
  assistant: 'traj-tag traj-tag-assistant',
  tool: 'traj-tag traj-tag-tool',
  system: 'traj-tag traj-tag-system',
  turn: 'traj-tag traj-tag-turn',
  step: 'traj-tag traj-tag-step',
}

function formatTok(n: number) {
  return formatTokens(n)
}

function UsageCard({ usage, label = 'Token usage' }: { usage: TrajectoryUsage; label?: string }) {
  const total = usage.totalTokens ?? usage.inputTokens + usage.outputTokens
  return (
    <section className="traj-usage-card" aria-label={label}>
      <div className="traj-usage-card-title">{label}</div>
      <div className="traj-usage-card-row">
        <UsageInline usage={usage} />
        <span className="traj-usage-total">total {formatTok(total)}</span>
      </div>
    </section>
  )
}

function FoldCaret({ open }: { open: boolean }) {
  return (
    <span className={`traj-caret${open ? ' is-open' : ''}`} aria-hidden>
      ▸
    </span>
  )
}

const TRAJ_NEAR_BOTTOM_PX = 96


export const TrajectoryView = memo(function TrajectoryView(props: SlotProps) {
  const useSessionView = props.useSessionView as ReturnType<typeof bindSessionView>
  const sessionView = props.sessionView as SessionViewService | undefined
  const rows = useSessionView((state) => state.trajectory)
  const focusCallId = useSessionView((state) => state.focusCallId)
  const sessionId = useSessionView((state) => state.sessionId)
  const trajectoryHasMore = useSessionView((state) => state.trajectoryHasMore)
  const trajectoryLoading = useSessionView((state) => state.trajectoryLoading)
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const [detailEvent, setDetailEvent] = useState<SessionEvent | null>(null)
  const [detailRequest, setDetailRequest] = useState<{ messages: DerivedMessage[]; toolsTokens: number } | null>(
    null,
  )
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | undefined>()
  /** turn key → collapsed */
  const [collapsedTurns, setCollapsedTurns] = useState<Record<string, boolean>>({})
  /** `${turn}:${step}` → collapsed */
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => groupByTurn(rows), [rows])
  const localUsage = useMemo(() => sumTrajectoryRowUsage(rows), [rows])
  const dispatchedUsage = useSessionView((state) => state.dispatchedUsage)
  const cumulative = useMemo(
    () => sumUsageParts(localUsage, dispatchedUsage),
    [localUsage, dispatchedUsage],
  )

  // 自动滚动到最新：当轨迹更新且用户靠近底部时，滚动到最新部分
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    stickToBottomRef.current = true
  }, [sessionId])

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distance <= TRAJ_NEAR_BOTTOM_PX
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [sessionId, rows.length > 0])

  const sticksKey = `${rows.length}:${groups.length}`

  useLayoutEffect(() => {
    if (!stickToBottomRef.current || rows.length === 0) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [sticksKey, rows.length, groups.length])

  useEffect(() => {
    if (!focusCallId) return
    const row = rows.find((item) => item.callId === focusCallId)
    if (row) setSelectedSeq(row.seq)
    document.getElementById(`traj-call-${focusCallId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusCallId, rows])

  useEffect(() => {
    if (selectedSeq == null) {
      setDetailEvent(null)
      setDetailRequest(null)
      setDetailError(undefined)
      return
    }
    if (!rows.some((row) => row.seq === selectedSeq)) {
      setSelectedSeq(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(undefined)
    setDetailEvent(null)
    setDetailRequest(null)
    void (async () => {
      try {
        const event = sessionView
          ? await sessionView.fetchEventDetail(selectedSeq)
          : sessionId
            ? await loadEventDetail(sessionId, selectedSeq)
            : null
        if (cancelled) return
        setDetailEvent(event)
        if (event?.type === 'assistant/message') {
          const request = sessionView
            ? await sessionView.fetchEventRequest(selectedSeq)
            : sessionId
              ? await loadEventRequest(sessionId, selectedSeq)
              : { messages: [], toolsTokens: 0 }
          if (!cancelled) setDetailRequest(request)
        }
      } catch (error) {
        if (!cancelled) setDetailError(String(error))
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSeq, rows, sessionId, sessionView])

  if (!sessionId) {
    return (
      <div className="traj-empty">
        <p className="traj-empty-title">No session</p>
        <p className="traj-empty-body">打开或新建会话后，可在此查看调试日志。</p>
      </div>
    )
  }

  if (!rows.length && trajectoryLoading) {
    return (
      <div className="traj-empty">
        <p className="traj-empty-title">Loading debug log…</p>
      </div>
    )
  }

  return (
    <div className={`traj-root${selectedSeq != null ? ' traj-root-split' : ''}${!rows.length ? ' traj-root-empty' : ''}`}>
      <div className="traj-pane">
        <div className="traj-meta">
          {trajectoryHasMore ? (
            <button
              type="button"
              className="traj-meta-earlier"
              title="加载更早的轮次"
              aria-label="加载更早的轮次"
              disabled={trajectoryLoading || !sessionView}
              onClick={() => void sessionView?.loadOlderTrajectory()}
            >
              <ArrowUpIcon aria-hidden className="size-3" />
            </button>
          ) : null}
          <span className="traj-meta-stat">
            {rows.length} events
            <span className="traj-meta-sep">·</span>
            {groups.length} turns
          </span>
          <span className="traj-meta-usage" title="本会话 + 派工到其它会话的用量">
            <span className="traj-meta-usage-label">usage</span>
            <UsageInline usage={cumulative} />
          </span>
        </div>

        <div className="traj-head" role="row">
          <span className="traj-col-seq">#</span>
          <span className="traj-col-type">type</span>
          <span className="traj-col-summary">summary</span>
          <span className="traj-col-usage">usage</span>
        </div>

        <div ref={listRef} className="traj-list" role="rowgroup">
          {groups.map((group) => {
            const turnKey = group.key
            const turnCollapsed = Boolean(collapsedTurns[turnKey])
            const visibleRows = turnCollapsed
              ? []
              : filterCollapsedSteps(group.rows, group.turn, collapsedSteps)
            return (
              <div key={group.key} className={`traj-group${turnCollapsed ? ' is-collapsed' : ''}`}>
                <button
                  type="button"
                  className="traj-group-bar"
                  aria-expanded={!turnCollapsed}
                  onClick={() =>
                    setCollapsedTurns((prev) => ({ ...prev, [turnKey]: !prev[turnKey] }))
                  }
                  {...pickDomAttrs('turn', group.turn == null ? 'meta' : String(group.turn), group.turn == null ? 'meta' : `Turn ${group.turn}`)}
                >
                  <span className="traj-group-bar-left">
                    <FoldCaret open={!turnCollapsed} />
                    <span>{group.turn == null ? 'meta' : `Turn ${group.turn}`}</span>
                  </span>
                  <span>{group.rows.length}</span>
                </button>
                {visibleRows.map((row) => {
                  const focused = Boolean(focusCallId && row.callId === focusCallId) || selectedSeq === row.seq
                  const tone = toneOf(row.type)
                  const isStepStart = row.type === 'step/start'
                  const stepKey =
                    isStepStart && row.turn != null && row.step != null ? `${row.turn}:${row.step}` : null
                  const stepCollapsed = stepKey ? Boolean(collapsedSteps[stepKey]) : false
                  return (
                    <div key={row.id} className="traj-row-wrap">
                      {isStepStart && stepKey ? (
                        <button
                          type="button"
                          className="traj-step-fold"
                          aria-expanded={!stepCollapsed}
                          aria-label={stepCollapsed ? 'Expand step' : 'Collapse step'}
                          onClick={(event) => {
                            event.stopPropagation()
                            setCollapsedSteps((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }))
                          }}
                        >
                          <FoldCaret open={!stepCollapsed} />
                        </button>
                      ) : (
                        <span className="traj-step-fold-spacer" aria-hidden />
                      )}
                      <button
                        type="button"
                        id={row.callId ? `traj-call-${row.callId}` : undefined}
                        role="row"
                        className={`traj-row traj-depth-${row.depth}${focused ? ' traj-row-focus' : ''}${
                          row.type === 'assistant/message' ? ' traj-row-assistant' : ''
                        }`}
                        onClick={() => setSelectedSeq(row.seq)}
                        {...pickDomAttrs('event', String(row.seq), pickPreview(`${row.type} ${row.summary}`) || row.type)}
                      >
                        <span className="traj-col-seq">{row.seq}</span>
                        <span className="traj-col-type">
                          <span className={toneClass[tone]} title={row.type}>
                            {row.type}
                          </span>
                        </span>
                        <span className="traj-col-summary" title={row.summary}>
                          {row.summary}
                        </span>
                        <span className="traj-col-usage">
                          <UsageInline usage={row.usage} histPct={row.usage?.histPct} />
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {selectedSeq != null ? (
        <aside className="traj-detail" aria-label="Event detail">
          <div className="traj-detail-head">
            <div>
              <div className="traj-detail-title">#{selectedSeq}</div>
              <div className="traj-detail-type">{detailEvent?.type ?? (detailLoading ? 'loading…' : '—')}</div>
            </div>
            <button type="button" className="traj-detail-close" onClick={() => setSelectedSeq(null)}>
              Close
            </button>
          </div>
          {detailLoading ? <div className="traj-detail-body">Loading detail…</div> : null}
          {detailError ? <div className="traj-detail-body">{detailError}</div> : null}
          {!detailLoading && detailEvent ? (
            <EventDetailBody event={detailEvent} request={detailRequest ?? undefined} />
          ) : null}
        </aside>
      ) : null}
    </div>
  )
})

/** 折叠的 step：隐藏 step/start 之后到对应 step/end（含）之间的行，start 行本身保留。 */
function filterCollapsedSteps(
  rows: TrajectoryRow[],
  turn: number | null,
  collapsedSteps: Record<string, boolean>,
): TrajectoryRow[] {
  const out: TrajectoryRow[] = []
  let hiding: string | null = null
  for (const row of rows) {
    if (hiding) {
      if (row.type === 'step/end' && turn != null && row.step != null && `${turn}:${row.step}` === hiding) {
        hiding = null
      }
      continue
    }
    out.push(row)
    if (row.type === 'step/start' && turn != null && row.step != null) {
      const key = `${turn}:${row.step}`
      if (collapsedSteps[key]) hiding = key
    }
  }
  return out
}

export function EventDetailBody({
  event,
  request,
}: {
  event: SessionEvent
  request?: { messages: DerivedMessage[]; toolsTokens: number }
}) {
  const fields = detailFields(event, request?.messages)
  const usage = event.type === 'assistant/message' ? event.usage : undefined
  return (
    <div className="traj-detail-body">
      <dl className="traj-detail-meta">
        <div>
          <dt>seq</dt>
          <dd>{event.seq}</dd>
        </div>
        <div>
          <dt>ts</dt>
          <dd>{new Date(event.ts).toISOString()}</dd>
        </div>
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      {usage ? <UsageCard usage={usage} /> : null}
      {request ? <RequestDetail request={request.messages} toolsTokens={request.toolsTokens} /> : null}
      {event.type === 'assistant/message' ? (
        <ResponsePanel event={event} />
      ) : (
        <pre className="traj-detail-json">{JSON.stringify(event, null, 2)}</pre>
      )}
    </div>
  )
}

function msgContent(m: DerivedMessage): string {
  if (typeof m.content === 'string' && m.content) return m.content
  if (m.tool_calls?.length) return JSON.stringify(m.tool_calls)
  if (m.tool_call_id) return `#${m.tool_call_id}`
  return ''
}

interface SplitRequest {
  system?: DerivedMessage
  toolsTokens: number
  history: DerivedMessage[]
  current?: DerivedMessage
}

/** 把 request 切分为 系统提示 / 工具定义 / 历史上下文 / 本轮消息 四类。 */
function splitRequest(messages: DerivedMessage[], toolsTokens: number): SplitRequest {
  let system: DerivedMessage | undefined
  let lastUserIndex = -1
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'system' && !system) system = m
    if (m.role === 'user') lastUserIndex = i
  }
  const history: DerivedMessage[] = []
  let current: DerivedMessage | undefined
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m === system) continue
    if (i === lastUserIndex) current = m
    else history.push(m)
  }
  return { system, toolsTokens, history, current }
}

/** 单个 message 的内容块（含 role 标签与摘要）。 */
function MessageEntry({ message, index }: { message: DerivedMessage; index: number }) {
  const isTool = message.role === 'tool' || !!message.tool_call_id
  const preview = msgContent(message)
  const truncated = preview.length > 240 ? `${preview.slice(0, 240)}…` : preview
  const expanded = preview.length <= 240
  return (
    <article key={`${message.role}-${index}`} className="traj-io-msg">
      <header className="traj-io-msg-head">
        <span className={`traj-io-role traj-io-role-${message.role}`}>{message.role}</span>
        {message.tool_call_id ? <span className="traj-io-meta">#{message.tool_call_id}</span> : null}
        {message.tool_calls?.length ? (
          <span className="traj-io-meta">{message.tool_calls.length} tool_calls</span>
        ) : null}
      </header>
      {expanded ? (
        <>
          {message.content ? <pre className="traj-io-msg-body">{message.content}</pre> : null}
          {message.tool_calls?.length ? (
            <pre className="traj-io-msg-body traj-io-msg-tools">{JSON.stringify(message.tool_calls, null, 2)}</pre>
          ) : null}
          {!message.content && !message.tool_calls?.length ? (
            <pre className="traj-io-msg-body traj-io-msg-empty">(empty content)</pre>
          ) : null}
        </>
      ) : (
        <details className="traj-io-msg-folds">
          <summary className="traj-io-msg-folds-summary">（{preview.length} chars）</summary>
          <pre className="traj-io-msg-body">{truncated}</pre>
          {message.tool_calls?.length ? (
            <pre className="traj-io-msg-body traj-io-msg-tools">{JSON.stringify(message.tool_calls, null, 2)}</pre>
          ) : null}
        </details>
      )}
    </article>
  )
}

/** 折叠块：标题 + 可展开内容。 */
function CollapseSection({
  label,
  badge,
  children,
}: {
  label: string
  badge?: string | number
  children: ReactNode
}) {
  return (
    <details className="traj-sec" open>
      <summary className="traj-sec-summary">
        <span className="traj-sec-label">{label}</span>
        {badge != null ? <span className="traj-sec-badge">{badge}</span> : null}
      </summary>
      <div className="traj-sec-body">{children}</div>
    </details>
  )
}

/** 历史上下文：默认展示最近 HISTORY_PAGE 条，向下滚动加载更早（分页）。 */
const HISTORY_PAGE = 10
function HistorySection({ history }: { history: DerivedMessage[] }) {
  const [shown, setShown] = useState(HISTORY_PAGE)
  // 倒序：最近的在前
  const desc = useMemo(() => [...history].reverse(), [history])
  const visible = desc.slice(0, shown)
  const hasMore = shown < desc.length
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    // 距底部较近时加载更多（更早的记录）
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && hasMore) {
      setShown((p) => Math.min(desc.length, p + HISTORY_PAGE))
    }
  }
  return (
    <div className="traj-sec-history" onScroll={onScroll}>
      {visible.map((m, i) => (
        <MessageEntry key={`h-${i}`} message={m} index={i} />
      ))}
      <div className="traj-sec-history-more">
        {hasMore ? (
          <button type="button" onClick={() => setShown((p) => Math.min(desc.length, p + HISTORY_PAGE))}>
            向上加载更早（{history.length - shown} 条）
          </button>
        ) : (
          <span>已全部加载（{history.length} 条）</span>
        )}
      </div>
    </div>
  )
}

/** 详情：4 个可折叠区块（系统提示 / 工具定义 / 历史上下文 / 本轮消息）。 */
function RequestDetail({ request, toolsTokens }: { request: DerivedMessage[]; toolsTokens: number }) {
  const split = useMemo(() => splitRequest(request, toolsTokens), [request, toolsTokens])
  return (
    <div className="traj-detail-sections">
      <CollapseSection label="系统提示" badge={split.system ? `${split.system.content?.length ?? 0} chars` : '—'}>
        {split.system ? (
          <pre className="traj-io-msg-body">{split.system.content}</pre>
        ) : (
          <pre className="traj-io-msg-body traj-io-msg-empty">（无系统提示）</pre>
        )}
      </CollapseSection>

      <CollapseSection label="工具定义" badge={`≈ ${formatTok(toolsTokens)}`}>
        <pre className="traj-io-msg-body traj-io-msg-empty">
          工具 schema 未下发展示，估算 token ≈ {formatTok(toolsTokens)}
        </pre>
      </CollapseSection>

      <CollapseSection label={`历史上下文`} badge={`${split.history.length} 条`}>
        {split.history.length ? (
          <HistorySection history={split.history} />
        ) : (
          <pre className="traj-io-msg-body traj-io-msg-empty">（无历史上下文）</pre>
        )}
      </CollapseSection>

      <CollapseSection label="本轮消息" badge={split.current ? `${split.current.content?.length ?? 0} chars` : '—'}>
        {split.current ? (
          <pre className="traj-io-msg-body">{split.current.content}</pre>
        ) : (
          <pre className="traj-io-msg-body traj-io-msg-empty">（无本轮消息）</pre>
        )}
      </CollapseSection>
    </div>
  )
}

function ResponsePanel({ event }: { event: Extract<SessionEvent, { type: 'assistant/message' }> }) {
  return (
    <section className="traj-io-card" aria-label="LLM response">
      <div className="traj-io-card-title">Response · assistant/message</div>
      {event.text ? <pre className="traj-io-msg-body">{event.text}</pre> : null}
      {event.tool_calls?.length ? (
        <pre className="traj-io-msg-body traj-io-msg-tools">{JSON.stringify(event.tool_calls, null, 2)}</pre>
      ) : null}
      {!event.text && !event.tool_calls?.length ? <pre className="traj-io-msg-body traj-io-msg-empty">(empty)</pre> : null}
    </section>
  )
}

function detailFields(
  event: SessionEvent,
  request?: DerivedMessage[],
): Array<{ label: string; value: string }> {
  if (event.type === 'user/message' || event.type === 'assistant/chunk' || event.type === 'system/prompt') {
    return [
      ...(event.type === 'user/message' && event.kind ? [{ label: 'kind', value: event.kind }] : []),
      { label: 'text', value: `${event.text.length} chars` },
    ]
  }
  if (event.type === 'assistant/message') {
    const rows = [{ label: 'text', value: `${event.text.length} chars` }]
    if (event.tool_calls?.length) rows.push({ label: 'tool_calls', value: String(event.tool_calls.length) })
    if (request) rows.push({ label: 'request', value: `${request.length} messages (derived)` })
    return rows
  }
  if (event.type === 'tool/call') {
    return [
      { label: 'name', value: event.name },
      { label: 'id', value: event.id },
      { label: 'arguments', value: `${event.arguments.length} chars` },
    ]
  }
  if (event.type === 'tool/result') {
    return [
      { label: 'name', value: event.name },
      { label: 'ok', value: event.ok ? 'true' : 'false' },
      { label: 'detail', value: `${event.detail.length} chars` },
    ]
  }
  if (event.type === 'turn/start' || event.type === 'turn/end') {
    return [
      { label: 'turn', value: String(event.turn) },
      ...('reason' in event ? [{ label: 'reason', value: event.reason }] : []),
    ]
  }
  if (event.type === 'step/start' || event.type === 'step/end') {
    return [
      { label: 'turn', value: String(event.turn) },
      { label: 'step', value: String(event.step) },
    ]
  }
  return []
}

function groupByTurn(rows: TrajectoryRow[]) {
  const groups: Array<{ key: string; turn: number | null; rows: TrajectoryRow[] }> = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last && last.turn === row.turn) {
      last.rows.push(row)
      continue
    }
    groups.push({
      key: `${row.turn ?? 'meta'}-${row.seq}`,
      turn: row.turn,
      rows: [row],
    })
  }
  return groups
}
