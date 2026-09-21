import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Image } from 'antd'
import {
  ArrowsPointingOutIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { CopyIconButton } from './copy-icon-button.tsx'
import type { ChatToolPart } from '@biu/web-session-view'
import { pickDomAttrs } from '@biu/core-pick/web'
import {
  diffStats,
  formatToolDetail,
  lineDiff,
  parseToolCall,
  prettyJsonString,
  shouldAutoOpenTool,
  toolOutputChars,
  toolSummary,
  toolTitle,
  type DiffLine,
  type FormattedDetail,
  type ParsedToolCall,
} from './tool-format.ts'

function DiffBlock({ lines, path }: { lines: DiffLine[]; path?: string }) {
  const stats = diffStats(lines)
  return (
    <div className="overflow-hidden rounded-[10px] bg-(--dsw-sidebar)">
      {path ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0 truncate font-mono text-(length:--dsw-chat-ui-font-size) text-(--dsw-icon)">{path}</span>
          <span className="shrink-0 font-mono text-(length:--dsw-chat-ui-font-size) tabular-nums text-(--dsw-label-3)">
            {stats.removed ? <span className="text-(--dsw-danger)">−{stats.removed}</span> : null}
            {stats.removed && stats.added ? ' ' : null}
            {stats.added ? <span className="text-(--dsw-ok)">+{stats.added}</span> : null}
          </span>
        </div>
      ) : null}
      <pre className="max-h-80 overflow-auto py-1 font-mono text-(length:--dsw-chat-ui-font-size) leading-5">
        {lines.map((line, index) => {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '
          const rowClass =
            line.type === 'add'
              ? 'bg-[color-mix(in_srgb,#448361_22%,transparent)] text-[#448361]'
              : line.type === 'remove'
                ? 'bg-[color-mix(in_srgb,#c4554d_22%,transparent)] text-[#c4554d]'
                : 'text-(--dsw-label-2)'
          return (
            <div key={`${index}-${line.type}`} className={`flex whitespace-pre-wrap break-all px-2 ${rowClass}`}>
              <span className="w-4 shrink-0 select-none opacity-70">{prefix}</span>
              <span className="min-w-0 flex-1">{line.text || ' '}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function ArtifactGallery({ artifacts }: { artifacts: NonNullable<Extract<FormattedDetail, { kind: 'bash' }>['artifacts']> }) {
  if (!artifacts.length) return null
  return (
    <Image.PreviewGroup>
      <div className="tool-artifacts" aria-label="Artifacts">
        {artifacts.map((item) => (
          <div key={item.url} className="tool-artifact">
            <Image
              className="tool-artifact-img"
              src={item.url}
              alt={item.name}
              loading="lazy"
              style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }}
            />
            <span className="tool-artifact-caption">{item.source || item.name}</span>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  )
}

function fmtChartY(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

function MetricChart({ detail, tall = false }: { detail: Extract<FormattedDetail, { kind: 'chart' }>; tall?: boolean }) {
  const width = 800
  const height = tall ? 460 : 200
  const padL = 50
  const padR = 12
  const padT = 18
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  let yMin = Infinity
  let yMax = -Infinity
  let xMin = Infinity
  let xMax = -Infinity
  for (const series of detail.series) {
    for (const point of series.points) {
      xMin = Math.min(xMin, point.x)
      xMax = Math.max(xMax, point.x)
      if (point.y != null && Number.isFinite(point.y)) {
        yMin = Math.min(yMin, point.y)
        yMax = Math.max(yMax, point.y)
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0
    yMax = 1
  }
  if (yMin === yMax) {
    yMin = Math.min(0, yMin)
    yMax = yMax || 1
  }
  const yPad = (yMax - yMin) * 0.1
  yMin = yMin - yPad
  yMax = yMax + yPad
  if (!Number.isFinite(xMin) || xMin === xMax) {
    xMin = 0
    xMax = 1
  }
  const xScale = (x: number) => (xMin === xMax ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW)
  const yScale = (y: number) => plotH - ((y - yMin) / (yMax - yMin)) * plotH
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4)
  const axisPts = detail.series[0]?.points ?? []
  const labelCount = Math.min(6, axisPts.length)
  const xLabels: { x: number; label: string }[] = []
  if (labelCount > 1) {
    for (let i = 0; i < labelCount; i += 1) {
      const point = axisPts[Math.floor(((axisPts.length - 1) * i) / (labelCount - 1))]
      if (!point) continue
      xLabels.push({
        x: point.x,
        label: new Date(point.x).toLocaleTimeString('zh-CN', { hour12: false }),
      })
    }
  }

  return (
    <div className="tool-chart">
      <div className="tool-chart-head">
        <span>{detail.title}</span>
        <span>{detail.series.length} 条曲线</span>
      </div>
      <svg className="tool-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {ticks.map((tick) => {
          const y = padT + yScale(tick)
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} className="tool-chart-grid" />
              <text x={padL - 4} y={y + 3} textAnchor="end" className="tool-chart-label">
                {fmtChartY(tick)}
              </text>
            </g>
          )
        })}
        {xLabels.map((item) => (
          <text key={`${item.x}-${item.label}`} x={padL + xScale(item.x)} y={height - 6} textAnchor="middle" className="tool-chart-label">
            {item.label}
          </text>
        ))}
        {detail.series.map((series) => {
          const valid = series.points.filter((p) => p.y != null && Number.isFinite(p.y)) as { x: number; y: number }[]
          if (valid.length < 2) return null
          const d = valid
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${padL + xScale(p.x)} ${padT + yScale(p.y)}`)
            .join(' ')
          const last = valid[valid.length - 1]!
          return (
            <g key={series.name}>
              <path d={d} fill="none" stroke={series.color} strokeWidth="1.6" />
              <circle cx={padL + xScale(last.x)} cy={padT + yScale(last.y)} r="2.2" fill={series.color} />
            </g>
          )
        })}
        {detail.series.map((series, i) => (
          <g key={`legend-${series.name}`}>
            <rect x={padL + i * 130} y="3" width="10" height="3" rx="1" fill={series.color} />
            <text x={padL + i * 130 + 14} y="8" className="tool-chart-label">
              {series.name.length > 16 ? `${series.name.slice(0, 16)}…` : series.name}
            </text>
          </g>
        ))}
      </svg>
      {detail.stats.length ? (
        <div className="tool-chart-stats">
          {detail.stats.map((stat) => (
            <span key={stat.name}>
              <b>{stat.name}</b> min={fmtChartY(stat.min)} max={fmtChartY(stat.max)} avg={fmtChartY(stat.avg)}
            </span>
          ))}
        </div>
      ) : null}
      <details className="tool-chart-json">
        <summary>原始 JSON</summary>
        <pre>{detail.text}</pre>
      </details>
    </div>
  )
}

function DetailView({ detail, tall = false }: { detail: FormattedDetail; tall?: boolean }) {
  if (detail.kind === 'chart') {
    return <MetricChart detail={detail} tall={tall} />
  }

  if (detail.kind === 'bash') {
    const hasOut = Boolean(detail.stdout)
    const hasErr = Boolean(detail.stderr)
    const artifacts = detail.artifacts ?? []
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-[10px] bg-(--dsw-sidebar)">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="font-mono text-(length:--dsw-chat-ui-font-size) tracking-wide text-(--dsw-label-3) uppercase">output</span>
            <span
              className={`font-mono text-(length:--dsw-chat-ui-font-size) tabular-nums ${
                detail.code === 0 || detail.code == null ? 'text-(--dsw-ok)' : 'text-(--dsw-danger)'
              }`}
            >
              exit {detail.code ?? '—'}
            </span>
          </div>
          <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-(length:--dsw-chat-ui-font-size) leading-5 text-(--dsw-label-2)">
            {hasOut ? <span className="whitespace-pre-wrap">{detail.stdout.replace(/\n$/, '')}</span> : null}
            {hasOut && hasErr ? '\n\n' : null}
            {hasErr ? <span className="whitespace-pre-wrap text-(--dsw-danger)">{detail.stderr.replace(/\n$/, '')}</span> : null}
            {!hasOut && !hasErr ? <span className="text-(--dsw-label-3)">(empty)</span> : null}
          </pre>
        </div>
        <ArtifactGallery artifacts={artifacts} />
      </div>
    )
  }

  if (detail.kind === 'json') {
    return (
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] bg-(--dsw-sidebar) px-3 py-2 font-mono text-(length:--dsw-chat-ui-font-size) leading-5 text-(--dsw-label-2)">
        {detail.text}
      </pre>
    )
  }

  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] bg-(--dsw-sidebar) px-3 py-2 font-mono text-(length:--dsw-chat-ui-font-size) leading-5 text-(--dsw-label)">
      {detail.text}
    </pre>
  )
}

function ToolBody({
  parsed,
  rawArguments,
  detail,
  tall = false,
}: {
  parsed: ParsedToolCall
  rawArguments: string
  detail?: string
  tall?: boolean
}) {
  const formatted = formatToolDetail(detail, parsed.kind)

  if (parsed.kind === 'str_replace') {
    const lines = lineDiff(parsed.oldStr, parsed.newStr)
    return (
      <div className="space-y-2">
        <DiffBlock path={parsed.path} lines={lines} />
        {formatted && formatted.kind === 'text' && !formatted.text.startsWith('The file ') ? (
          <DetailView detail={formatted} tall={tall} />
        ) : null}
      </div>
    )
  }

  if (parsed.kind === 'create') {
    const lines = lineDiff('', parsed.fileText)
    return (
      <div className="space-y-2">
        <DiffBlock path={parsed.path} lines={lines} />
        {formatted && formatted.kind === 'text' && !formatted.text.startsWith('File created') ? (
          <DetailView detail={formatted} tall={tall} />
        ) : null}
      </div>
    )
  }

  if (parsed.kind === 'insert') {
    const lines = lineDiff('', parsed.newStr)
    return (
      <div className="space-y-2">
        <DiffBlock path={`${parsed.path} · after line ${parsed.insertLine}`} lines={lines} />
        {formatted && formatted.kind === 'text' && !formatted.text.startsWith('The file ') ? (
          <DetailView detail={formatted} tall={tall} />
        ) : null}
      </div>
    )
  }

  if (parsed.kind === 'bash') {
    return (
      <div className="space-y-2">
        <pre className="overflow-x-auto rounded-[10px] bg-(--dsw-sidebar) px-3 py-2 font-mono text-(length:--dsw-chat-ui-font-size) leading-5 text-(--dsw-label-2)">
          <span className="text-(--dsw-label-3)">$ </span>
          {parsed.command}
        </pre>
        {formatted ? <DetailView detail={formatted} tall={tall} /> : null}
      </div>
    )
  }

  if (parsed.kind === 'view') {
    return (
      <div className="space-y-2">
        <div className="font-mono text-(length:--dsw-chat-ui-font-size) text-(--dsw-label-3)">
          {parsed.path}
          {parsed.viewRange ? `:${parsed.viewRange[0]}-${parsed.viewRange[1]}` : ''}
        </div>
        {formatted ? <DetailView detail={formatted} tall={tall} /> : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rawArguments ? (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[10px] bg-(--dsw-sidebar) px-3 py-2 font-mono text-(length:--dsw-chat-ui-font-size) leading-5 text-(--dsw-label-2)">
          {prettyJsonString(rawArguments)}
        </pre>
      ) : null}
      {formatted ? <DetailView detail={formatted} tall={tall} /> : null}
    </div>
  )
}

/**
 * 工具结果放大层：沿用 .biu-float 浮层皮，内容仍是同一个 ToolBody。
 * 挂到 document.body，避免被工具卡自身的 overflow 和检查器的 z-index 裁掉。
 */
function ToolZoom({
  title,
  parsed,
  rawArguments,
  detail,
  onClose,
}: {
  title: string
  parsed: ParsedToolCall
  rawArguments: string
  detail?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="biu-float-overlay tool-zoom-overlay" data-testid="tool-zoom" onClick={onClose}>
      <div
        className="biu-float tool-zoom"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 全屏`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="biu-float-head">
          <h2 className="biu-float-title">{title}</h2>
          <button type="button" className="biu-float-close" title="关闭" aria-label="关闭" onClick={onClose}>
            <XMarkIcon className="size-4" aria-hidden />
          </button>
        </div>
        <div className="tool-zoom-body">
          <ToolBody parsed={parsed} rawArguments={rawArguments} detail={detail} tall />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ToolCard({
  node,
  onInspect,
  live = false,
}: {
  node: ChatToolPart
  onInspect: (callId: string) => void
  /** 所在回复仍在流式输出时，无 result 才算运行中 */
  live?: boolean
}) {
  const parsed = useMemo(() => parseToolCall(node.name, node.arguments), [node.name, node.arguments])
  const formatted = useMemo(
    () => formatToolDetail(node.result?.detail, parsed.kind),
    [node.result?.detail, parsed.kind],
  )
  const [open, setOpen] = useState(() => shouldAutoOpenTool(parsed, node.result?.detail))
  const [zoom, setZoom] = useState(false)
  const summary = toolSummary(parsed, node.result?.detail || node.arguments || '…')
  const title = toolTitle(parsed, node.name)
  const previewLines = useMemo(() => {
    if (parsed.kind !== 'str_replace' || open) return null
    return lineDiff(parsed.oldStr, parsed.newStr).filter((line) => line.type !== 'equal').slice(0, 4)
  }, [parsed, open])
  const collapsedArtifacts =
    !open && formatted?.kind === 'bash' && formatted.artifacts?.length ? formatted.artifacts : null
  const collapsedChart = !open && formatted?.kind === 'chart' ? formatted : null

  const running = !node.result || Boolean(node.result.streaming)
  const status = running
    ? live
      ? { label: '运行中', className: 'is-running' }
      : { label: '成功', className: 'is-ok' }
    : node.result?.ok
      ? { label: '成功', className: 'is-ok' }
      : { label: '失败', className: 'is-fail' }

  const copyTextValue = (node.result?.detail || node.arguments || '').trim()

  return (
    <div className="tool-call" {...pickDomAttrs('tool', node.callId, title)}>
      <div className={`tool-call-head${open ? ' is-open' : ''} ${status.className}`}>
        <button
          type="button"
          className="tool-call-toggle"
          aria-expanded={open}
          title={status.label}
          aria-label={`${title}，${status.label}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={`tool-call-chevron ${status.className}`} aria-hidden>
            {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
          </span>
          <span className="tool-call-title">{title}</span>
          {open ? null : <span className="tool-call-summary">{summary}</span>}
        </button>
        {parsed.kind === 'bash' || parsed.kind === 'create' || node.result?.streaming ? (
          <span className="tool-call-chars" title="输出字数" data-testid="tool-call-chars">
            {parsed.kind === 'create' ? parsed.fileText.length : toolOutputChars(node.result?.detail, parsed.kind)}
          </span>
        ) : null}
        <div className="tool-call-tools">
        <button
          type="button"
          className="tool-call-inspect"
          title="全屏查看结果"
          aria-label={`全屏查看 ${title} 的结果`}
          data-testid="tool-call-zoom"
          onClick={() => setZoom(true)}
        >
          <ArrowsPointingOutIcon className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="tool-call-inspect"
          title="在轨迹中查看"
          aria-label="在轨迹中查看"
          onClick={() => onInspect(node.callId)}
        >
          <MapIcon className="size-3.5" aria-hidden />
        </button>
        {copyTextValue ? (
          <CopyIconButton className="tool-call-copy" text={copyTextValue} label="复制工具输出" />
        ) : null}
        </div>
      </div>
      {!open && previewLines && previewLines.length > 0 ? (
        <div className="tool-call-body">
          <DiffBlock path={parsed.kind === 'str_replace' ? parsed.path : undefined} lines={previewLines} />
        </div>
      ) : null}
      {collapsedArtifacts ? (
        <div className="tool-call-body">
          <ArtifactGallery artifacts={collapsedArtifacts} />
        </div>
      ) : null}
      {collapsedChart ? (
        <div className="tool-call-body">
          <MetricChart detail={collapsedChart} />
        </div>
      ) : null}
      {open ? (
        <div className="tool-call-body">
          <ToolBody parsed={parsed} rawArguments={node.arguments} detail={node.result?.detail} />
        </div>
      ) : null}
      {zoom ? (
        <ToolZoom
          title={title}
          parsed={parsed}
          rawArguments={node.arguments}
          detail={node.result?.detail}
          onClose={() => setZoom(false)}
        />
      ) : null}
    </div>
  )
}
