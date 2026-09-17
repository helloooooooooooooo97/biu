const React = globalThis.React
const { useCallback, useEffect, useMemo, useRef, useState } = React

export const name = 'data-board'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

type QueryResult = {
  ok: boolean
  columns?: string[]
  rows?: string[][]
  rowCount?: number
  truncated?: boolean
  ms?: number
  ranAt?: number
  resolvedSql?: string
  error?: string
}

type LastRun = { at: number; rows: number; ms: number; ok?: boolean }

const SAMPLE_SQL = [
  'SELECT schedule_type AS 排班类型, COUNT(*) AS 数量',
  'FROM schedules',
  "WHERE schedule_date >= '{{start}}' AND schedule_date <= '{{end}}'",
  'GROUP BY schedule_type',
  'ORDER BY 数量 DESC',
].join('\n')

const DEFAULT_PARAMS: Record<string, string> = { start: '2026-02-01', end: '2026-03-31' }
const DEFAULT_CONN: Record<string, string | number> = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'Abc123456',
  database: 'scheduling_system',
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g

/** 从 SQL 里扫出 {{name}}，出现顺序即输入框顺序。 */
function placeholders(sql: string): string[] {
  const out: string[] = []
  for (const match of String(sql ?? '').matchAll(PLACEHOLDER)) {
    if (!out.includes(match[1])) out.push(match[1])
  }
  return out
}

function numeric(value: string | undefined): number {
  if (value === undefined || value === null || value === '' || value === 'NULL') return 0
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 标签列固定第 0 列；数值列取第一个「有值且全是数字」的列。 */
function pickValueCol(columns: string[], rows: string[][], preferred: unknown): number {
  const want = Number(preferred)
  if (Number.isInteger(want) && want >= 0 && want < columns.length) return want
  for (let i = 0; i < columns.length; i += 1) {
    const cells = rows.map((row) => String(row[i] ?? ''))
    if (!cells.some((cell) => cell !== '')) continue
    if (cells.every((cell) => cell === '' || cell === 'NULL' || Number.isFinite(Number(cell.replace(/,/g, ''))))) return i
  }
  return columns.length > 1 ? 1 : 0
}

function fmtTime(at: number): string {
  try {
    return new Date(at).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return new Date(at).toISOString()
  }
}

const UI = {
  border: 'var(--dsw-border, rgba(0,0,0,.12))',
  fg: 'var(--dsw-label, #1a1a1a)',
  muted: '#6b6b6b',
  soft: 'var(--dsw-sidebar, #f5f5f5)',
  hover: 'var(--dsw-hover, #ececec)',
  accent: '#3f7bd8',
  danger: 'var(--dsw-danger, #cf2d56)',
}

/** 手写 SVG 横向柱状图：不引任何图表库。 */
function BarChart({ columns, rows, valueCol }: { columns: string[]; rows: string[][]; valueCol: number }) {
  const uid = useRef(`db-bar-${Math.random().toString(36).slice(2, 8)}`).current
  const shown = rows.slice(0, 12)
  if (!shown.length) return <div style={{ padding: '18px 12px', color: UI.muted }}>这一期没有数据（0 行）。</div>

  const W = 720
  const LABEL_W = 132
  const VALUE_W = 84
  const ROW_H = 30
  const TOP = 12
  const BAR_H = 16
  const H = TOP + shown.length * ROW_H + 8
  const barMax = Math.max(40, W - LABEL_W - VALUE_W)
  const max = Math.max(1, ...shown.map((row) => numeric(row[valueCol])))

  return (
    <div data-testid="data-board-chart">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" role="img">
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f7fd6" />
            <stop offset="100%" stopColor="#7fb2f0" />
          </linearGradient>
        </defs>
        <line x1={LABEL_W} y1={4} x2={LABEL_W} y2={H - 4} stroke={UI.border} strokeWidth="1" />
        {shown.map((row, i) => {
          const value = numeric(row[valueCol])
          const y = TOP + i * ROW_H
          const width = Math.max(2, (value / max) * barMax)
          return (
            <g key={i}>
              <text x={LABEL_W - 10} y={y + BAR_H / 2} textAnchor="end" dominantBaseline="middle" fontSize="13" fill={UI.fg}>
                {String(row[0] ?? '')}
              </text>
              <rect x={LABEL_W + 1} y={y} width={barMax} height={BAR_H} fill={UI.soft} rx="3" />
              <rect x={LABEL_W + 1} y={y} width={width} height={BAR_H} fill={`url(#${uid})`} rx="3" />
              <text x={LABEL_W + 8 + barMax + 6} y={y + BAR_H / 2} dominantBaseline="middle" fontSize="13" fill={UI.muted}>
                {String(row[valueCol] ?? '')}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>
        {columns[0]} → {columns[valueCol] || `第 ${valueCol + 1} 列`}
        {rows.length > shown.length ? ` · 共 ${rows.length} 行，图上只画前 ${shown.length} 行` : ''}
      </div>
    </div>
  )
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (!rows.length) return <div style={{ padding: '18px 12px', color: UI.muted }}>这一期没有数据（0 行）。</div>
  return (
    <div data-testid="data-board-table" style={{ maxHeight: 320, overflow: 'auto', border: `1px solid ${UI.border}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  position: 'sticky',
                  top: 0,
                  background: UI.soft,
                  color: UI.fg,
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${UI.border}`,
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {columns.map((_, c) => (
                <td key={c} style={{ padding: '5px 10px', borderBottom: `1px solid ${UI.border}`, color: UI.fg }}>
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DataBoardBlock({ data, update, writable }: BlockProps) {
  const ro = !writable
  const storedSql = typeof data.sql === 'string' && data.sql.trim() ? data.sql : SAMPLE_SQL
  const storedParams = (data.params && typeof data.params === 'object' ? data.params : {}) as Record<string, unknown>
  const storedConn = (data.conn && typeof data.conn === 'object' ? data.conn : {}) as Record<string, unknown>
  const view = data.view === 'table' ? 'table' : 'chart'
  const lastRun = (data.lastRun && typeof data.lastRun === 'object' ? data.lastRun : null) as LastRun | null

  const [sql, setSql] = useState(storedSql)
  const [params, setParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { ...DEFAULT_PARAMS }
    for (const [key, value] of Object.entries(storedParams)) init[key] = String(value ?? '')
    return init
  })
  const [conn, setConn] = useState<Record<string, string | number>>(() => ({ ...DEFAULT_CONN, ...storedConn }))
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [showSql, setShowSql] = useState(false)

  // 文档里的值变了（别的 agent 改的 / 载入页面）就同步回来
  useEffect(() => {
    setSql(storedSql)
  }, [storedSql])

  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** SQL / 参数这类连续输入，合并后延迟写回块 data（文档才是唯一事实）。 */
  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      pending.current = { ...pending.current, ...patch }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        const patchNow = pending.current
        pending.current = {}
        update(patchNow)
      }, 400)
    },
    [update],
  )

  const keys = useMemo(() => placeholders(sql), [sql])

  const rows = result?.ok ? result.rows ?? [] : []
  const columns = result?.ok ? result.columns ?? [] : []
  const valueCol = pickValueCol(columns, rows, data.valueCol)

  const run = useCallback(async () => {
    setRunning(true)
    try {
      const response = await fetch('/api/data-board/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql, params, conn }),
      })
      const json = (await response.json()) as QueryResult
      setResult(json)
      update({
        lastRun: {
          at: json.ranAt ?? Date.now(),
          rows: json.ok ? json.rowCount ?? 0 : 0,
          ms: json.ms ?? 0,
          ok: Boolean(json.ok),
        },
      })
    } catch (error) {
      setResult({ ok: false, error: String(error) })
    } finally {
      setRunning(false)
    }
  }, [sql, params, conn, update])

  // 打开页面就跑一次：文档里的「报表」是活的，不是截图
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chip = (active: boolean): Record<string, unknown> => ({
    padding: '3px 10px',
    fontSize: 12,
    borderRadius: 999,
    border: `1px solid ${active ? UI.accent : UI.border}`,
    background: active ? UI.accent : 'transparent',
    color: active ? '#fff' : UI.fg,
    cursor: ro ? 'default' : 'pointer',
  })

  const inputStyle: Record<string, unknown> = {
    padding: '4px 7px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${UI.border}`,
    background: 'transparent',
    color: UI.fg,
    outline: 'none',
  }

  return (
    <div
      data-testid="data-board-block"
      style={{ border: `1px solid ${UI.border}`, borderRadius: 8, padding: '10px 12px 12px', color: UI.fg, font: '13px/1.6 system-ui, -apple-system, "PingFang SC", sans-serif' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>📊 数据看板</span>
        <button style={chip(view === 'chart')} disabled={ro} onClick={() => update({ view: 'chart' })}>
          柱状图
        </button>
        <button style={chip(view === 'table')} disabled={ro} onClick={() => update({ view: 'table' })}>
          表格
        </button>
        <button
          data-testid="data-board-run"
          disabled={ro || running}
          onClick={() => void run()}
          style={{ ...chip(false), borderColor: UI.accent, color: running ? UI.muted : UI.accent, fontWeight: 600 }}
        >
          {running ? '跑着呢…' : '重跑'}
        </button>
        <span data-testid="data-board-lastrun" style={{ fontSize: 12, color: UI.muted }}>
          {lastRun
            ? `上次跑于 ${fmtTime(lastRun.at)} · ${lastRun.rows} 行 · ${lastRun.ms} ms`
            : '还没跑过 · 点「重跑」'}
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: UI.muted, marginBottom: 3 }}>SQL（可以改；改完点「重跑」就是新一期）</div>
        <textarea
          data-testid="data-board-sql"
          value={sql}
          readOnly={ro}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value
            setSql(next)
            commit({ sql: next })
          }}
          style={{
            width: '100%',
            minHeight: 92,
            padding: '7px 9px',
            boxSizing: 'border-box',
            font: '12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace',
            borderRadius: 6,
            border: `1px solid ${UI.border}`,
            background: UI.soft,
            color: UI.fg,
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        {keys.length ? (
          keys.map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: UI.muted }}>
              <code style={{ color: UI.accent }}>{`{{${key}}}`}</code>
              <input
                style={inputStyle}
                value={params[key] ?? ''}
                readOnly={ro}
                placeholder="值"
                onChange={(event) => {
                  const next = { ...params, [key]: event.target.value }
                  setParams(next)
                  commit({ params: next })
                }}
              />
            </label>
          ))
        ) : (
          <span style={{ fontSize: 12, color: UI.muted }}>SQL 里写 {'{{参数名}}'} 就会出现对应输入框</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: 12, color: UI.muted }}>
        <span>库</span>
        {(['host', 'port', 'user', 'database'] as const).map((field) => (
          <input
            key={field}
            style={{ ...inputStyle, width: field === 'host' ? 96 : field === 'database' ? 132 : 62 }}
            value={String(conn[field] ?? '')}
            readOnly={ro}
            title={field}
            onChange={(event) => {
              const next = { ...conn, [field]: event.target.value }
              setConn(next)
              commit({ conn: next })
            }}
          />
        ))}
        <button style={{ ...chip(false), border: 'none', color: UI.muted, padding: '2px 6px' }} onClick={() => setShowSql((v) => !v)}>
          {showSql ? '收起绑定后的 SQL' : '看绑定后的 SQL'}
        </button>
      </div>

      {showSql && result?.resolvedSql ? (
        <pre style={{ margin: '6px 0 0', padding: '7px 9px', background: UI.soft, border: `1px solid ${UI.border}`, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
          {result.resolvedSql}
        </pre>
      ) : null}

      <div style={{ marginTop: 10 }}>
        {result && !result.ok ? (
          <div data-testid="data-board-error" style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(207,45,86,.08)', color: UI.danger, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {result.error || '查询失败'}
          </div>
        ) : !result ? (
          <div style={{ padding: '18px 12px', color: UI.muted }}>{running ? '取数中…' : '等待重跑'}</div>
        ) : view === 'table' ? (
          <DataTable columns={columns} rows={rows} />
        ) : (
          <BarChart columns={columns} rows={rows} valueCol={valueCol} />
        )}
      </div>

      {result?.truncated ? <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>结果超过 2000 行，已截断显示</div> : null}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'data-board',
    plugin: name,
    label: '数据看板',
    blockType: 'data',
    blockTypeLabel: '数据',
    hint: '绑一条 SQL + 一组 {{参数}}：点重跑用真库取数，手写 SVG 柱状图 / 表格随时切换，块里留着「上次跑于 xx · xx 行」',
    aliases: ['data', 'board', 'databoard', '看板', '数据看板', 'sql', 'chart', '图表', '报表'],
    defaults: () => ({
      sql: SAMPLE_SQL,
      params: { ...DEFAULT_PARAMS },
      conn: { ...DEFAULT_CONN },
      view: 'chart',
    }),
    View: DataBoardBlock,
  })
}
