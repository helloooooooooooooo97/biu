import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { CircleStackIcon } from '@heroicons/react/16/solid'
import { EventDetailBody } from './trajectory.tsx'
import { type SessionViewService } from '@biu/web-session-view'
import type { DerivedMessage, SessionEvent } from '@biu/web-session-view'
import type { UsageTrend, UsageTrendPoint } from '@biu/web-session-view'
import { pickDomAttrs } from '@biu/core-pick/web'

export interface UsagePanelProps {
  useSessionView: <T>(selector: (state: unknown) => T) => T
  sessionView?: SessionViewService
}

const IN = '#5b9fd6'
const OUT = '#9aa0a8'
const CACHE = '#448361'
const COMPACT = '#c2920a'

async function loadUsageTrend(sessionId: string): Promise<UsageTrend> {
  const res = await fetch(`/api/sessions/${sessionId}/usage-trend`)
  if (!res.ok) throw new Error(`加载 usage 趋势失败：${res.status}`)
  const body = (await res.json()) as { points?: UsageTrendPoint[]; compactions?: number[] }
  return {
    points: Array.isArray(body.points) ? body.points : [],
    compactions: Array.isArray(body.compactions) ? body.compactions : [],
  }
}

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

/** 把 usage 点序列转成 Input/Output/Cache 三个数据集（不做降采样）。 */
export function splitTrendData(
  points: UsageTrendPoint[],
): {
  input: Array<{ x: number; value: number }>
  output: Array<{ x: number; value: number }>
  cache: Array<{ x: number; value: number }>
} {
  const input: Array<{ x: number; value: number }> = []
  const output: Array<{ x: number; value: number }> = []
  const cache: Array<{ x: number; value: number }> = []
  for (let i = 0; i < points.length; i++) {
    input.push({ x: i + 1, value: points[i].input })
    output.push({ x: i + 1, value: points[i].output })
    cache.push({ x: i + 1, value: points[i].cache })
  }
  return { input, output, cache }
}

/** 把压缩点 seq 序列映射为折线图 x 位置（取 ≥ 该 seq 的首个 step）。 */
export function compactToSteps(compactions: number[], points: UsageTrendPoint[]): number[] {
  if (!compactions.length || !points.length) return []
  return compactions
    .map((seq) => {
      const idx = points.findIndex((p) => p.seq >= seq)
      return idx >= 0 ? idx + 1 : null
    })
    .filter((v): v is number => v != null)
}

export interface TurnAggregate {
  turn: number
  steps: number
  input: number
  output: number
  cache: number
  baseInput: number
}

/** 按 turn 聚合每个回合的用量，并计算回合数。 */
export function aggregateTurns(points: UsageTrendPoint[]): TurnAggregate[] {
  const turns = new Map<number, TurnAggregate>()
  for (const p of points) {
    let agg = turns.get(p.turn)
    if (!agg) {
      agg = { turn: p.turn, steps: 0, input: 0, output: 0, cache: 0, baseInput: p.input }
      turns.set(p.turn, agg)
    }
    if (agg.steps === 0) agg.baseInput = p.input
    agg.steps += 1
    agg.input += p.input
    agg.output += p.output
    agg.cache += p.cache
  }
  return [...turns.values()].sort((a, b) => a.turn - b.turn)
}

/** 把回合聚合转成 Input/Output/Cache 三个数据集（x=turn，保留全部回合）。 */
export function turnToTrendData(turns: TurnAggregate[]): {
  input: Array<{ x: number; value: number }>
  output: Array<{ x: number; value: number }>
  cache: Array<{ x: number; value: number }>
} {
  const input: Array<{ x: number; value: number }> = []
  const output: Array<{ x: number; value: number }> = []
  const cache: Array<{ x: number; value: number }> = []
  for (const t of turns) {
    input.push({ x: t.turn, value: t.input })
    output.push({ x: t.turn, value: t.output })
    cache.push({ x: t.turn, value: t.cache })
  }
  return { input, output, cache }
}

function fmt(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 >= 100 ? 1 : 0)}k`
  return `${v}`
}

/** ECharts 双 Y 轴折线图：左侧 Input 轴，右侧 Output 轴（各自独立刻度范围）。 */
function EChartsDualLine({
  inputData,
  outputData,
  cacheData,
  height,
  compactAt,
  onClick,
}: {
  inputData: Array<{ x: number; value: number }>
  outputData: Array<{ x: number; value: number }>
  cacheData: Array<{ x: number; value: number }>
  height: number
  compactAt?: number[]
  onClick?: (x: number) => void
}) {
  const option = useMemo<EChartsOption>(() => {
    const xValues = Array.from(
      new Set([...inputData.map((d) => d.x), ...outputData.map((d) => d.x), ...cacheData.map((d) => d.x)]),
    ).sort((a, b) => a - b)
    const toSeries = (data: Array<{ x: number; value: number }>) =>
      data.map((d) => [d.x, d.value])
    const markLineData = (compactAt ?? []).map((x) => ({ xAxis: x }))
    return {
      animation: false,
      grid: { left: 28, right: 28, top: 8, bottom: 4 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(24,25,28,0.94)',
        borderWidth: 0,
        textStyle: { color: 'rgba(210,214,220,0.95)', fontSize: 11 },
      },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: xValues,
        boundaryGap: false,
        axisLabel: { show: xValues.length <= 40, fontSize: 9, color: 'rgba(160,167,178,0.7)' },
        axisLine: { lineStyle: { color: 'rgba(130,140,155,0.25)' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          position: 'left',
          splitNumber: 3,
          axisLabel: { fontSize: 9, color: 'rgba(160,167,178,0.7)', formatter: (v: number) => fmt(v) },
          splitLine: { lineStyle: { color: 'rgba(130,140,155,0.12)', type: 'dashed' } },
        },
        {
          type: 'value',
          position: 'right',
          splitNumber: 3,
          axisLabel: { fontSize: 9, color: 'rgba(160,167,178,0.7)', formatter: (v: number) => fmt(v) },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Input',
          type: 'line',
          data: toSeries(inputData),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: IN },
          itemStyle: { color: IN },
          areaStyle: { color: 'rgba(77,141,224,0.06)' },
          yAxisIndex: 0,
          markLine: markLineData.length
            ? {
                symbol: 'none',
                silent: true,
                lineStyle: { color: COMPACT, width: 1, type: 'dashed', opacity: 0.85 },
                label: { show: false },
                data: markLineData,
              }
            : undefined,
        },
        {
          name: 'Cache',
          type: 'line',
          data: toSeries(cacheData),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: CACHE, opacity: 0.9 },
          itemStyle: { color: CACHE },
          yAxisIndex: 0,
        },
        {
          name: 'Output',
          type: 'line',
          data: toSeries(outputData),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: OUT },
          itemStyle: { color: OUT },
          yAxisIndex: 1,
        },
      ],
    }
  }, [inputData, outputData, cacheData, compactAt])

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
      onEvents={{
        click: (params: unknown) => {
          if (!onClick) return
          const hit = Array.isArray(params) ? params[0] : params
          const v = (hit as { value?: unknown })?.value
          const x = Array.isArray(v) ? Number(v[0]) : Number(v)
          if (Number.isFinite(x) && x > 0) onClick(x)
        },
      }}
    />
  )
}

/** 每回合 Step 数（Steps per Turn）柱状图：回合号 vs 该回合拆了几步。 */
function TurnStepChart({ data, height }: { data: Array<{ x: number; value: number }>; height: number }) {
  const option = useMemo<EChartsOption>(() => {
    return {
      animation: false,
      grid: { left: 26, right: 10, top: 8, bottom: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(24,25,28,0.94)', borderWidth: 0, textStyle: { color: 'rgba(210,214,220,0.95)', fontSize: 11 } },
      legend: { show: false },
      xAxis: { type: 'category', data: data.map((d) => d.x), boundaryGap: true, axisLabel: { show: data.length <= 40, fontSize: 9, color: 'rgba(160,167,178,0.7)' }, axisLine: { lineStyle: { color: 'rgba(130,140,155,0.25)' } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitNumber: 3, axisLabel: { fontSize: 9, color: 'rgba(160,167,178,0.7)' }, splitLine: { lineStyle: { color: 'rgba(130,140,155,0.12)', type: 'dashed' } } },
      series: [
        {
          name: 'steps',
          type: 'bar',
          data: data.map((d) => d.value),
          itemStyle: { color: 'rgba(124,106,227,0.75)', borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 14,
        },
      ],
    }
  }, [data])
  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge lazyUpdate />
}

// ECharts option 的宽松类型，避免引入 echarts 完整类型依赖
interface EChartsOption {
  animation?: boolean
  grid?: Record<string, unknown>
  tooltip?: Record<string, unknown>
  legend?: Record<string, unknown>
  xAxis?: Record<string, unknown>
  yAxis?: Record<string, unknown> | Array<Record<string, unknown>>
  series?: Array<Record<string, unknown>>
}

/** 侧边栏用量面板：Input/Output 各自独立 Y 轴，展示 Step 用量与回合用量。 */
export function UsagePanel({ useSessionView, sessionView }: UsagePanelProps) {
  const sessionId = useSessionView((state) => (state as { sessionId?: string }).sessionId)
  const [trend, setTrend] = useUsageTrend(useSessionView, sessionView)

  const track = useMemo(() => splitTrendData(trend?.points ?? []), [trend])
  const turns = useMemo(() => aggregateTurns(trend?.points ?? []), [trend])
  const turnData = useMemo(() => turnToTrendData(turns), [turns])
  const turnSteps = useMemo(() => turns.map((t) => ({ x: t.turn, value: t.steps })), [turns])
  const compactSteps = useMemo(
    () => compactToSteps(trend?.compactions ?? [], trend?.points ?? []),
    [trend],
  )
  const last = trend?.points.length ? trend.points[trend.points.length - 1] : undefined
  const totalInput = useMemo(
    () => (trend?.points ?? []).reduce((s, p) => s + p.input, 0),
    [trend],
  )
  const totalOutput = useMemo(
    () => (trend?.points ?? []).reduce((s, p) => s + p.output, 0),
    [trend],
  )
  const totalCache = useMemo(
    () => (trend?.points ?? []).reduce((s, p) => s + p.cache, 0),
    [trend],
  )
  const trackStepPeak = useMemo(() => track.input.reduce((s, d) => Math.max(s, d.value), 0), [track])
  const trackOutputPeak = useMemo(() => track.output.reduce((s, d) => Math.max(s, d.value), 0), [track])
  const turnInputPeak = useMemo(() => turnData.input.reduce((s, d) => Math.max(s, d.value), 0), [turnData])
  const turnOutputPeak = useMemo(() => turnData.output.reduce((s, d) => Math.max(s, d.value), 0), [turnData])

  // 点击 Step/Turn → 加载对应轨迹内容到下方卡片
  const [detailSeq, setDetailSeq] = useState<number | null>(null)
  const [detailEvent, setDetailEvent] = useState<SessionEvent | null>(null)
  const [detailRequest, setDetailRequest] = useState<{ messages: DerivedMessage[]; toolsTokens: number } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  useEffect(() => {
    if (detailSeq == null) {
      setDetailEvent(null)
      setDetailRequest(null)
      return
    }
    let cancelled = false
    setDetailEvent(null)
    setDetailRequest(null)
    setDetailLoading(true)
    void (async () => {
      try {
        const ev = sessionView
          ? await sessionView.fetchEventDetail(detailSeq)
          : sessionId
            ? await loadEventDetail(sessionId, detailSeq)
            : null
        if (cancelled) return
        setDetailEvent(ev)
        if (ev?.type === 'assistant/message') {
          const req = sessionView
            ? await sessionView.fetchEventRequest(detailSeq)
            : sessionId
              ? await loadEventRequest(sessionId, detailSeq)
              : { messages: [], toolsTokens: 0 }
          if (!cancelled) setDetailRequest(req)
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailSeq, sessionId, sessionView])

  const pointsRef = trend?.points ?? []
  const onStepClick = (x: number) => {
    const pt = pointsRef[x - 1]
    if (pt) setDetailSeq(pt.seq)
  }
  const onTurnClick = (x: number) => {
    // 该回合最后一个 assistant 消息
    let last
    for (const p of pointsRef) {
      if (p.turn === x) last = p
    }
    if (last) setDetailSeq(last.seq)
  }

  return (
    <div
      className="usage-panel"
      data-testid="usage-panel"
      {...(sessionId ? pickDomAttrs('usage', sessionId, 'Token usage') : {})}
    >
      <div className="usage-panel-head">
        <div className="usage-panel-title">
          <CircleStackIcon aria-hidden className="size-4" />
          Token usage
        </div>
        <div className="usage-panel-legend">
          <span className="usage-panel-leg">
            <i className="usage-panel-dot" style={{ background: IN }} />
            Input
          </span>
          <span className="usage-panel-leg">
            <i className="usage-panel-dot" style={{ background: CACHE }} />
            Cache
          </span>
          <span className="usage-panel-leg">
            <i className="usage-panel-dot" style={{ background: OUT }} />
            Output
          </span>
        </div>
      </div>

      {trend && trend.points.length > 0 ? (
        <>
          <div
            className="usage-panel-section"
            {...(sessionId ? pickDomAttrs('usage', `${sessionId}:steps`, 'Step Token Usage') : {})}
          >
            <div className="usage-panel-section-title">
              Step Token Usage
              <span className="usage-panel-section-hint">{trend.points.length} calls</span>
            </div>
            <div className="usage-panel-peak">
              <span>最高 Input <b>{fmt(trackStepPeak)}</b></span>
              <span>最高 Output <b>{fmt(trackOutputPeak)}</b></span>
            </div>
            <EChartsDualLine
              inputData={track.input}
              outputData={track.output}
              cacheData={track.cache}
              height={150}
              compactAt={compactSteps.length ? compactSteps : undefined}
              onClick={onStepClick}
            />
          </div>

          <div
            className="usage-panel-section"
            {...(sessionId ? pickDomAttrs('usage', `${sessionId}:turns`, 'Turn Token Usage') : {})}
          >
            <div className="usage-panel-section-title">
              Turn Token Usage
              <span className="usage-panel-section-hint">{turns.length} turns</span>
            </div>
            <div className="usage-panel-peak">
              <span>最高 Input <b>{fmt(turnInputPeak)}</b></span>
              <span>最高 Output <b>{fmt(turnOutputPeak)}</b></span>
            </div>
            <EChartsDualLine
              inputData={turnData.input}
              outputData={turnData.output}
              cacheData={turnData.cache}
              height={130}
              onClick={onTurnClick}
            />
          </div>

          <div
            className="usage-panel-section"
            {...(sessionId ? pickDomAttrs('usage', `${sessionId}:steps-per-turn`, 'Steps per Turn') : {})}
          >
            <div className="usage-panel-section-title">Steps per Turn</div>
            <TurnStepChart data={turnSteps} height={110} />
          </div>

          <div className="usage-panel-meta">
            <div className="usage-panel-meta-input">
              <span className="usage-panel-meta-label">Total Input</span>
              <span className="usage-panel-meta-value" style={{ color: IN }}>
                {fmt(totalInput)}
              </span>
            </div>
            <div className="usage-panel-meta-cache">
              <span className="usage-panel-meta-label">缓存命中</span>
              <span className="usage-panel-meta-value" style={{ color: CACHE }}>
                {fmt(totalCache)}
              </span>
            </div>
            <div className="usage-panel-meta-output">
              <span className="usage-panel-meta-label">Total Output</span>
              <span className="usage-panel-meta-value" style={{ color: OUT }}>
                {fmt(totalOutput)}
              </span>
            </div>
          </div>

          {compactSteps.length > 0 ? (
            <div className="usage-panel-note">
              金色虚线标注上下文重置（压缩点），其后的 token 从头计数。
            </div>
          ) : null}
        </>
      ) : (
        <div className="usage-panel-empty">本会话暂无 usage 数据</div>
      )}
      {last ? (
        <div className="usage-panel-tail">
          <span>最近调用 Input {fmt(last.input)} · Output {fmt(last.output)}</span>
        </div>
      ) : null}

      {detailSeq != null ? (
        <div className="usage-modal-mask" data-testid="usage-modal" onClick={() => setDetailSeq(null)}>
          <div className="usage-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usage-modal-head">
              <span>轨迹详情 · seq {detailSeq}</span>
              <button
                type="button"
                className="usage-modal-close"
                aria-label="关闭"
                onClick={() => setDetailSeq(null)}
              >
                ×
              </button>
            </div>
            <div className="usage-modal-body">
              {detailLoading ? (
                <div className="usage-panel-empty">加载中…</div>
              ) : detailEvent ? (
                <EventDetailBody event={detailEvent} request={detailRequest ?? undefined} />
              ) : (
                <div className="usage-panel-empty">无内容</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 打开面板时一次性拉全量 usage 趋势（含压缩点），失败或切换会话清空。 */
function useUsageTrend(
  useSessionView: UsagePanelProps['useSessionView'],
  sessionView: SessionViewService | undefined,
): [UsageTrend | null, (t: UsageTrend | null) => void] {
  const sessionTop = useSessionView((s) => (s as { sessionId?: string }).sessionId)
  const [trend, setTrend] = useState<UsageTrend | null>(null)

  useEffect(() => {
    let cancelled = false
    setTrend(null)
    if (!sessionTop) return
    const load = sessionView?.fetchUsageTrend
      ? sessionView.fetchUsageTrend()
      : loadUsageTrend(sessionTop)
    void load
      .then((t) => {
        if (!cancelled) setTrend(t)
      })
      .catch(() => {
        if (!cancelled) setTrend({ points: [], compactions: [] })
      })
    return () => {
      cancelled = true
    }
  }, [useSessionView, sessionView, sessionTop])

  return [trend, setTrend]
}
