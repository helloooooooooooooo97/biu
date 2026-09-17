const React = globalThis.React
const { useState, useCallback } = React

export const name = 'db-inspector'
export const inject = ['pageEditor']

type CheckResult = {
  id: string
  label: string
  hint?: string
  ok: boolean
  ms: number
  columns: string[]
  rows: string[][]
  rowCount: number
  error?: string
}

type Report = {
  ok: boolean
  startedAt: string
  finishedAt: string
  ms: number
  bin?: string
  conn?: { host?: string; port?: number; user?: string; database?: string }
  results: CheckResult[]
}

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

const S = {
  wrap: { border: '1px solid var(--biu-border, #e3e3e8)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.5 } as Record<string, unknown>,
  bar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, marginBottom: 10 },
  btn: (active: boolean) => ({
    padding: '5px 14px', borderRadius: 8, border: '1px solid var(--biu-border,#d6d6dd)',
    background: active ? 'var(--biu-accent,#4a6cf7)' : 'transparent',
    color: active ? '#fff' : 'inherit', cursor: active ? 'pointer' : 'not-allowed', font: 'inherit',
  }),
  muted: { opacity: 0.65, fontSize: 12 },
  table: { borderCollapse: 'collapse' as const, width: '100%', marginTop: 6, fontSize: 12 },
  th: { textAlign: 'left' as const, padding: '4px 8px', borderBottom: '1px solid var(--biu-border,#e3e3e8)', fontWeight: 600, whiteSpace: 'nowrap' as const },
  td: { padding: '4px 8px', borderBottom: '1px solid rgba(150,150,160,.25)', whiteSpace: 'nowrap' as const },
  card: { marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(150,150,160,.10)' },
  err: { color: '#d9534f', fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' as const },
}

function num(v: string): number | null {
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) && String(v).trim() !== '' ? n : null
}

/** 对比两次巡检：标量项列差值，行数变化列增减，无主键表列新增。 */
function diffReports(prev: Report, next: Report): string[] {
  const out: string[] = []
  const byId = new Map(prev.results.map((r) => [r.id, r]))
  for (const now of next.results) {
    const before = byId.get(now.id)
    if (!before) { out.push('+ 新增巡检项：' + now.label); continue }
    if (!before.ok && now.ok) out.push('✓ ' + now.label + '：上次失败，这次恢复')
    if (before.ok && !now.ok) out.push('✗ ' + now.label + '：这次失败了')
    if (!before.ok || !now.ok) continue
    if (now.rowCount !== before.rowCount) {
      const d = now.rowCount - before.rowCount
      out.push('• ' + now.label + '：行数 ' + before.rowCount + ' → ' + now.rowCount + '（' + (d > 0 ? '+' : '') + d + '）')
    } else if (now.rows.length === 1 && now.columns.length <= 4) {
      for (let i = 0; i < now.columns.length; i += 1) {
        const a = num(before.rows[0][i])
        const b = num(now.rows[0][i])
        if (a != null && b != null && a !== b) {
          out.push('• ' + now.label + ' · ' + now.columns[i] + '：' + a + ' → ' + b + '（' + (b - a > 0 ? '+' : '') + (b - a) + '）')
        }
      }
    }
    if (now.id === 'nopk' && now.rowCount > 0) {
      const seen = new Set(before.rows.map((r) => r[0]))
      now.rows.filter((r) => !seen.has(r[0])).forEach((r) => out.push('! 新出现的无主键表：' + r[0]))
    }
    if (now.id === 'replication' && (now.rowCount > 0) !== (before.rowCount > 0)) {
      out.push('• 复制拓扑：' + (before.rowCount ? '有复制' : '无复制') + ' → ' + (now.rowCount ? '有复制' : '无复制'))
    }
  }
  return out
}

function ResultTable({ result }: { result: CheckResult }) {
  if (!result.ok) {
    return (
      <div style={S.card} data-testid={'db-inspector-check-' + result.id}>
        <b>✗ {result.label}</b> <span style={S.muted}>{result.ms}ms</span>
        <div style={S.err}>{result.error || '执行失败'}</div>
      </div>
    )
  }
  if (!result.rows.length) {
    return (
      <div style={S.card} data-testid={'db-inspector-check-' + result.id}>
        <b>✓ {result.label}</b> <span style={S.muted}>{result.ms}ms · 0 行</span>
        {result.id === 'replication' ? <div style={S.muted}>无复制（单机），按预期跳过。</div> : null}
        {result.id === 'nopk' ? <div style={S.muted}>没有无主键表，挺好。</div> : null}
        {result.id === 'locks' ? <div style={S.muted}>没有锁等待。</div> : null}
      </div>
    )
  }
  return (
    <div style={S.card} data-testid={'db-inspector-check-' + result.id}>
      <b>✓ {result.label}</b> <span style={S.muted}>{result.ms}ms · {result.rowCount} 行</span>
      <table style={S.table}>
        <thead>
          <tr>{result.columns.map((c, i) => <th key={i} style={S.th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 12).map((row, ri) => (
            <tr key={ri}>{result.columns.map((_, ci) => <td key={ci} style={S.td}>{row[ci] ?? ''}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 12 ? <div style={S.muted}>…还有 {result.rows.length - 12} 行</div> : null}
    </div>
  )
}

function DbInspectorBlock({ data, update, writable }: BlockProps) {
  const report = (data.report ?? null) as Report | null
  const history = (Array.isArray(data.history) ? data.history : []) as Report[]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showIdx, setShowIdx] = useState(-1)

  const shown = showIdx >= 0 ? history[showIdx] : report

  const run = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/db-inspector/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conn: data.conn ?? undefined, extraChecks: data.extraChecks ?? undefined }),
      })
      const next = (await res.json()) as Report
      if (!next || !Array.isArray(next.results)) throw new Error('返回格式不对')
      const prevHistory = (Array.isArray(data.history) ? data.history : []) as Report[]
      update({ report: next, history: [next, ...prevHistory].slice(0, 10) })
      setShowIdx(-1)
    } catch (e) {
      setError('跑巡检失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [data.conn, data.extraChecks, data.history, update])

  const diff = report && history[1] ? diffReports(history[1], report) : []
  const failed = shown ? shown.results.filter((r) => !r.ok).length : 0

  return (
    <div style={S.wrap} data-testid="db-inspector-block">
      <div style={S.bar}>
        <b>数据库巡检</b>
        <button style={S.btn(writable && !busy)} disabled={!writable || busy} onClick={run} data-testid="db-inspector-run">
          {busy ? '巡检中…' : '跑巡检'}
        </button>
        {shown ? (
          <span style={S.muted}>
            {new Date(shown.finishedAt).toLocaleString()} · {shown.results.length} 项 · {failed ? failed + ' 项失败' : '全部通过'} · {shown.ms}ms
            {shown.conn ? ' · ' + shown.conn.user + '@' + shown.conn.host + ':' + shown.conn.port + '/' + (shown.conn.database || '-') : ''}
          </span>
        ) : <span style={S.muted}>还没跑过，点「跑巡检」真连本机 MySQL。</span>}
        {!writable ? <span style={S.muted}>（只读）</span> : null}
      </div>

      {error ? <div style={S.err}>{error}</div> : null}

      {history.length > 1 ? (
        <div style={S.bar}>
          <span style={S.muted}>历史（近 10 次）：</span>
          {history.map((h, i) => (
            <button key={i} style={{ ...S.btn(showIdx === i), padding: '2px 8px', fontSize: 12 }} onClick={() => setShowIdx(i)}>
              {new Date(h.finishedAt).toLocaleString().slice(5, 16)}
            </button>
          ))}
          {showIdx >= 0 ? <button style={{ ...S.btn(false), padding: '2px 8px', fontSize: 12 }} onClick={() => setShowIdx(-1)}>看最新</button> : null}
        </div>
      ) : null}

      {diff.length ? (
        <div style={S.card} data-testid="db-inspector-diff">
          <b>和上一次比：</b>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {diff.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      ) : null}

      {shown ? shown.results.map((r) => <ResultTable key={r.id + r.label} result={r} />) : null}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'db-inspect',
    plugin: name,
    label: '数据库巡检块',
    blockType: 'ops',
    blockTypeLabel: '运维',
    hint: '点「跑巡检」真连本机 MySQL 跑一组巡检 SQL（版本/连接/慢查询/大表/无主键/锁等待/复制），表格展示并存进块数据，能对比两次巡检',
    aliases: ['db', 'mysql', 'inspect', '数据库', '巡检', '体检', '慢查询'],
    defaults: {
      conn: { host: '127.0.0.1', port: 3306, user: 'root', password: 'Abc123456', database: 'scheduling_system' },
      history: [],
    },
    View: DbInspectorBlock,
  })
}
