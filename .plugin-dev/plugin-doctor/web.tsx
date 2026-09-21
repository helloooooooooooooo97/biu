const React = globalThis.React
const { useState } = React

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

const TONE: Record<string, { bg: string; fg: string }> = {
  '合规': { bg: '#e6f6ec', fg: '#1a7f45' },
  '缺 README 示例': { bg: '#fdf3dd', fg: '#9a6a06' },
  '缺引擎': { bg: '#fde8e6', fg: '#b0362a' },
  '空插件': { bg: '#eee9f6', fg: '#6b4fa1' },
}

const th: Record<string, string | number> = { padding: '4px 10px 4px 0', fontWeight: 600 }
const td: Record<string, string | number> = { padding: '6px 10px 6px 0', verticalAlign: 'top' }

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
    <span
      title={props.title}
      style={{
        display: 'inline-block',
        marginRight: 4,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 11,
        lineHeight: '16px',
        background: props.on ? '#e6f0fb' : '#f1f1f1',
        color: props.on ? '#1d64b5' : '#999',
        whiteSpace: 'nowrap',
      }}
    >
      {props.label}
    </span>
  )
}

function DoctorBlock(props: BlockProps) {
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
    <div
      data-testid="plugin-doctor-block"
      style={{
        border: '1px solid #e3e3e3',
        borderRadius: 10,
        padding: '12px 14px',
        font: '13px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
        background: '#fff',
        color: '#222',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{'\u{1FA7A}'} 插件体检</strong>
        {props.writable ? (
          <button
            data-testid="plugin-doctor-run"
            onClick={run}
            disabled={busy}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid #1d64b5',
              background: busy ? '#cfe0f5' : '#1d64b5',
              color: '#fff',
              fontSize: 12,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? '扫描中…' : '体检'}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: '#888' }}>只读态 · 展示上次结果</span>
        )}
        {report ? (
          <span style={{ fontSize: 12, color: '#666' }}>
            共 {report.total} 个插件 · 合规 {report.summary.ok} · 待修 {report.summary.warn} · 坏 {report.summary.broken} · 合计 {kb(report.summary.bytes)} · 扫描于 {clock(report.scannedAt)}
          </span>
        ) : null}
      </div>

      {error ? <div style={{ marginTop: 8, color: '#b0362a', fontSize: 12 }}>{error}</div> : null}

      {!report ? (
        <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          还没有体检结果{props.writable ? '，点「体检」扫一遍 .plugin。' : '。'}
        </div>
      ) : (
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <table data-testid="plugin-doctor-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#666', textAlign: 'left' }}>
                <th style={th}>插件</th>
                <th style={th}>headless</th>
                <th style={th}>host / web</th>
                <th style={th}>大小</th>
                <th style={th}>最近运行</th>
                <th style={th}>README 示例</th>
                <th style={th}>体检结论</th>
              </tr>
            </thead>
            <tbody>
              {report.plugins.map((item) => {
                const tone = TONE[item.conclusion] || { bg: '#f1f1f1', fg: '#666' }
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <code style={{ fontSize: 11 }}>{item.id}</code>
                      <div style={{ color: '#777' }}>{item.name}</div>
                    </td>
                    <td style={td}>
                      <Chip label={item.headless ? '是' : '否'} on={item.headless} />
                    </td>
                    <td style={td}>
                      <Chip label="host" on={item.hasHost} />
                      <Chip label="web" on={item.hasWeb} />
                    </td>
                    <td style={td}>{kb(item.bytes)}</td>
                    <td style={td} title={item.lastRunAt ? clock(item.lastRunAt) : '没有运行记录'}>
                      {when(item.lastRunAt)}
                    </td>
                    <td style={td}>
                      {item.readmeExample ? <Chip label="有" on /> : <Chip label={item.readme ? '缺' : '无 README'} />}
                    </td>
                    <td style={td}>
                      <span
                        title={(item.problems || []).join('；')}
                        style={{
                          padding: '1px 8px',
                          borderRadius: 999,
                          background: tone.bg,
                          color: tone.fg,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.conclusion}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 11, color: '#999' }}>扫描根目录：{report.root}</div>
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
