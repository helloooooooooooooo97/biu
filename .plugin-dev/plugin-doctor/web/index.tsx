const React = globalThis.React
const { useState, useEffect } = React

export const name = 'plugin-doctor'
export const inject = ['pageEditor']

type PluginReport = {
  id: string
  name: string
  headless: boolean
  hasHost: boolean
  hasWeb: boolean
  bytes: number
  files: number
  enabled: boolean
  lastRunAt: number | null
  readme: boolean
  readmeExample: boolean
  conclusion: string
  problems: string[]
}

type ScanResult = {
  scannedAt: number
  root: string
  total: number
  summary: { ok: number; warn: number; broken: number; bytes: number }
  plugins: PluginReport[]
}

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

const STYLE_ID = 'plugin-doctor-style-v2'
const STYLE_CSS = `
.pd-root{border:1px solid var(--dsw-border);border-radius:8px;padding:10px 12px;font-family:var(--font-sans);font-size:14px;line-height:1.5;background:var(--dsw-bg);color:var(--dsw-label)}
.pd-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pd-title{font-size:13px;font-weight:650}
.pd-btn{height:26px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-border);background:transparent;color:var(--dsw-label);font-size:13px;font-weight:650;cursor:pointer}
.pd-btn:hover{background:var(--dsw-hover)}
.pd-btn:disabled{opacity:.5;cursor:default}
.pd-meta{font-size:12px;color:var(--dsw-label-3)}
.pd-err{margin-top:8px;color:var(--dsw-danger);font-size:13px}
.pd-empty{margin-top:8px;color:var(--dsw-label-3);font-size:13px}
.pd-table-wrap{margin-top:8px;overflow-x:auto}
.pd-table{border-collapse:collapse;width:100%;font-size:13px}
.pd-table th{padding:4px 10px 4px 0;font-weight:650;color:var(--dsw-label-3);text-align:left}
.pd-table td{padding:6px 10px 6px 0;vertical-align:top;border-top:1px solid var(--dsw-border)}
.pd-id{font-family:var(--font-mono);font-size:12px}
.pd-name{color:var(--dsw-label-3)}
.pd-chip{display:inline-block;margin-right:4px;padding:1px 6px;border-radius:6px;font-size:11px;line-height:16px;border:1px solid var(--dsw-border);background:var(--dsw-hover);color:var(--dsw-label-3);white-space:nowrap}
.pd-chip.is-on{color:var(--dsw-label);background:var(--dsw-input)}
.pd-tone{padding:1px 8px;border-radius:6px;white-space:nowrap;border:1px solid var(--dsw-border);background:var(--dsw-hover);color:var(--dsw-label)}
.pd-tone.warn{color:var(--dsw-label)}
.pd-tone.bad{color:var(--dsw-danger)}
`

function usePdStyle() {
  useEffect(() => {
    const existing = document.getElementById(STYLE_ID)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function kb(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function when(ts: number | null) {
  if (!ts) return '从没跑过'
  const diff = Date.now() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + ' 分钟前'
  if (diff < day) return Math.round(diff / 3600000) + ' 小时前'
  return Math.round(diff / day) + ' 天前'
}

function clock(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function Chip(props: { label: string; on?: boolean; title?: string }) {
  return (
    <span title={props.title} className={props.on ? 'pd-chip is-on' : 'pd-chip'}>
      {props.label}
    </span>
  )
}

function DoctorBlock(props: BlockProps) {
  usePdStyle()
  const report = (props.data && props.data.report ? props.data.report : null) as ScanResult | null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/plugin-doctor/scan')
      const body = (await res.json()) as ScanResult & { error?: string }
      if (!res.ok || body.error) throw new Error(body.error || 'HTTP ' + res.status)
      if (props.writable) props.update({ report: body })
      else setError('只读态：这里只展示上次体检结果')
    } catch (e) {
      setError(String((e && (e as Error).message) || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="plugin-doctor-block" className="pd-root">
      <div className="pd-head">
        <strong className="pd-title">插件体检</strong>
        {props.writable ? (
          <button data-testid="plugin-doctor-run" onClick={run} disabled={busy} className="pd-btn">
            {busy ? '扫描中…' : '体检'}
          </button>
        ) : (
          <span className="pd-meta">只读态 · 展示上次结果</span>
        )}
        {report ? (
          <span className="pd-meta">
            共 {report.total} 个插件 · 合规 {report.summary.ok} · 待修 {report.summary.warn} · 坏 {report.summary.broken} · 合计 {kb(report.summary.bytes)} · 扫描于 {clock(report.scannedAt)}
          </span>
        ) : null}
      </div>

      {error ? <div className="pd-err">{error}</div> : null}

      {!report ? (
        <div className="pd-empty">
          还没有体检结果{props.writable ? '，点「体检」扫一遍 .plugin。' : '。'}
        </div>
      ) : (
        <div className="pd-table-wrap">
          <table data-testid="plugin-doctor-table" className="pd-table">
            <thead>
              <tr>
                <th>插件</th>
                <th>headless</th>
                <th>host / web</th>
                <th>大小</th>
                <th>最近运行</th>
                <th>README 示例</th>
                <th>体检结论</th>
              </tr>
            </thead>
            <tbody>
              {report.plugins.map((item) => {
                const tone = item.conclusion === '合规' ? 'pd-tone' : item.conclusion === '缺引擎' || item.conclusion === '空插件' ? 'pd-tone bad' : 'pd-tone warn'
                return (
                  <tr key={item.id}>
                    <td>
                      <code className="pd-id">{item.id}</code>
                      <div className="pd-name">{item.name}</div>
                    </td>
                    <td>
                      <Chip label={item.headless ? '是' : '否'} on={item.headless} />
                    </td>
                    <td>
                      <Chip label="host" on={item.hasHost} />
                      <Chip label="web" on={item.hasWeb} />
                    </td>
                    <td>{kb(item.bytes)}</td>
                    <td title={item.lastRunAt ? clock(item.lastRunAt) : '没有运行记录'}>
                      {when(item.lastRunAt)}
                    </td>
                    <td>
                      {item.readmeExample ? <Chip label="有" on /> : <Chip label={item.readme ? '缺' : '无 README'} />}
                    </td>
                    <td>
                      <span title={(item.problems || []).join('；')} className={tone}>
                        {item.conclusion}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="pd-meta" style={{ marginTop: 6 }}>扫描根目录：{report.root}</div>
        </div>
      )}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'plugin-doctor',
    plugin: name,
    label: '插件体检',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '扫一遍已安装插件，给出合规结论',
    aliases: ['doctor', '体检', '插件体检', 'scan'],
    defaults: () => ({ report: null }),
    View: DoctorBlock,
  })
}
