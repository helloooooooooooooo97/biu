/**
 * API 调试块（api-playground）
 *
 * 文档里长出来的 Mini-Postman：填 method / url / headers / body，点「发送」，
 * 由 host 侧的 /api/api-playground/send 真发 HTTP 请求（Node fetch），
 * 把状态码、耗时、响应头、响应体（JSON 自动美化）画回块里。
 *
 * 请求历史写进块 data.history（最近 20 条）——跟着文档走，不是跟着浏览器走。
 */
const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'api-playground'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>, opts?: { replace?: boolean }) => void
  writable: boolean
}

type Result = {
  ok: boolean
  method?: string
  url?: string
  finalUrl?: string
  status?: number
  statusText?: string
  ms?: number
  bytes?: number
  truncated?: boolean
  headers?: Record<string, string>
  body?: string
  error?: string
  at?: number
}

type HistoryEntry = {
  at: number
  method: string
  url: string
  headers: string
  body: string
  status: number
  statusText: string
  ms: number
  bytes: number
  truncated: boolean
  error?: string
  /** 响应体前 4000 字，给历史一个可读的回放；完整响应在块里现发一次就有。 */
  preview: string
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
/** 存进文档的响应体上限（字符）：文档不是日志盘，别把 200KB 塞进 md。 */
const STORE_LIMIT = 20000
const HISTORY_LIMIT = 20
const PREVIEW_LIMIT = 4000

const STYLE_ID = 'api-playground-style-v2'
const STYLE_CSS = `
.ap-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-border);
  border-radius: 8px;
  background: var(--dsw-bg);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--dsw-label);
}
.ap-root *, .ap-root *::before, .ap-root *::after { box-sizing: border-box; }
.ap-bar { display: flex; gap: 6px; align-items: center; }
.ap-method, .ap-url {
  height: 26px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--dsw-label);
  background: var(--dsw-input);
  border: 1px solid var(--dsw-border);
  border-radius: 6px;
  padding: 0 8px;
  outline: none;
}
.ap-method { flex: 0 0 92px; cursor: pointer; }
.ap-url { flex: 1 1 auto; min-width: 0; }
.ap-method:focus, .ap-url:focus, .ap-area:focus { border-color: var(--dsw-pick); }
.ap-send {
  flex: none;
  height: 26px;
  font-size: 13px;
  font-weight: 650;
  color: var(--dsw-label);
  background: var(--dsw-hover);
  border: 1px solid var(--dsw-border);
  border-radius: 6px;
  padding: 0 10px;
  cursor: pointer;
}
.ap-send:hover { background: var(--dsw-input); }
.ap-send:disabled { opacity: 0.5; cursor: default; }
.ap-tabs { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.ap-tab {
  height: 26px;
  font-size: 13px;
  font-weight: 650;
  color: var(--dsw-label-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 8px;
  cursor: pointer;
}
.ap-tab-on {
  color: var(--dsw-label);
  border-color: var(--dsw-border);
  background: var(--dsw-hover);
}
.ap-spacer { flex: 1 1 auto; }
.ap-hint { font-size: 12px; color: var(--dsw-label-3); }
.ap-chip {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 650;
  border-radius: 6px;
  padding: 2px 7px;
  border: 1px solid var(--dsw-border);
}
.ap-chip-2 { color: var(--dsw-label); background: color-mix(in srgb, var(--dsw-ok, #3fb950) 16%, transparent); }
.ap-chip-4, .ap-chip-5 { color: var(--dsw-label); background: color-mix(in srgb, var(--dsw-warn, #d29922) 18%, transparent); }
.ap-chip-err { color: var(--dsw-danger); background: color-mix(in srgb, var(--dsw-danger) 14%, transparent); }
.ap-note { font-size: 12px; color: var(--dsw-label-2); }
.ap-pane { display: flex; flex-direction: column; gap: 8px; }
.ap-field { display: flex; flex-direction: column; gap: 4px; }
.ap-label { font-size: 12px; font-weight: 650; color: var(--dsw-label-3); }
.ap-area {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  color: var(--dsw-label);
  background: var(--dsw-input);
  border: 1px solid var(--dsw-border);
  border-radius: 6px;
  padding: 8px;
  outline: none;
  resize: vertical;
}
.ap-head-area { min-height: 62px; }
.ap-body-area { min-height: 84px; }
.ap-pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--dsw-input);
  border: 1px solid var(--dsw-border);
  border-radius: 6px;
  padding: 8px 10px;
  max-height: 280px;
  overflow: auto;
}
.ap-hlist { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow: auto; }
.ap-details { border: 1px solid var(--dsw-border); border-radius: 6px; padding: 6px 8px; }
.ap-details > summary { cursor: pointer; list-style: none; user-select: none; }
.ap-details > summary::-webkit-details-marker { display: none; }
.ap-details > summary::before { content: '▸ '; color: var(--dsw-label-3); }
.ap-details[open] > summary::before { content: '▾ '; }
.ap-details .ap-hlist { margin-top: 8px; }
.ap-hrow { display: flex; gap: 10px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; }
.ap-hkey { flex: 0 0 34%; color: var(--dsw-label-3); word-break: break-all; }
.ap-hval { flex: 1 1 auto; word-break: break-all; }
.ap-err { color: var(--dsw-danger); }
.ap-history { border-top: 1px solid var(--dsw-border); padding-top: 8px; }
.ap-hist-head { display: flex; gap: 6px; align-items: center; }
.ap-ghost {
  height: 26px;
  font-size: 13px;
  font-weight: 650;
  color: var(--dsw-label);
  background: transparent;
  border: 1px solid var(--dsw-border);
  border-radius: 6px;
  padding: 0 8px;
  cursor: pointer;
}
.ap-ghost:hover { background: var(--dsw-hover); }
.ap-hist-list { display: flex; flex-direction: column; gap: 1px; margin-top: 6px; max-height: 180px; overflow: auto; }
.ap-hist-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--dsw-label);
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
}
.ap-hist-row:hover { background: var(--dsw-hover); }
.ap-hist-m { flex: 0 0 52px; font-weight: 650; color: var(--dsw-label-2); }
.ap-hist-u { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-hist-t { flex: 0 0 auto; color: var(--dsw-label-3); }
`

function useStyle() {
  useEffect(() => {
    const stale = document.querySelectorAll('style[id^="api-playground-style"]')
    for (const node of stale) if (node.id !== STYLE_ID) node.remove()
    const existing = document.getElementById(STYLE_ID)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function cap(text: string, limit: number) {
  return text.length > limit ? text.slice(0, limit) : text
}

function pretty(text: string) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { text: '', json: false }
  const first = trimmed[0]
  if (first !== '{' && first !== '[') return { text, json: false }
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), json: true }
  } catch {
    return { text, json: false }
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatClock(at: number) {
  if (!Number.isFinite(at)) return ''
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function statusClass(status: number | undefined, ok: boolean) {
  if (!ok || !status) return 'ap-chip ap-chip-err'
  if (status < 300) return 'ap-chip ap-chip-2'
  if (status < 500) return 'ap-chip ap-chip-4'
  return 'ap-chip ap-chip-5'
}

function readHistory(data: Record<string, unknown>): HistoryEntry[] {
  const raw = data.history
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => item && typeof item === 'object') as HistoryEntry[]
}

function readResult(data: Record<string, unknown>): Result | null {
  const raw = data.last
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Result
}

function ApiPlaygroundBlock({ data, update, writable }: BlockProps) {
  useStyle()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stored = useMemo(() => readResult(data), [data.last])
  const history = useMemo(() => readHistory(data), [data.history])

  const [form, setForm] = useState({
    method: asText(data.method) || 'GET',
    url: asText(data.url),
    headers: asText(data.headers),
    body: asText(data.body),
  })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(() => stored)
  const [tab, setTab] = useState<'request' | 'response'>(stored ? 'response' : 'request')
  const [histOpen, setHistOpen] = useState(false)

  // 外部改了文档（别的 agent / 撤销 / 重开页面）时同步字段，但别抢正在输入的用户。
  useEffect(() => {
    const el = hostRef.current
    if (el && el.contains(document.activeElement)) return
    setForm({
      method: asText(data.method) || 'GET',
      url: asText(data.url),
      headers: asText(data.headers),
      body: asText(data.body),
    })
  }, [data.method, data.url, data.headers, data.body])

  const active = result ?? stored
  const activeHeaders = active?.headers ?? {}
  const bodyView = useMemo(() => pretty(asText(active?.body)), [active?.body])

  const commit = (patch: Record<string, unknown>) => {
    if (!writable) return
    update(patch)
  }

  const patchForm = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  const send = async () => {
    if (sending || !writable) return
    const url = form.url.trim()
    setTab('response')
    if (!url) {
      setResult({ ok: false, error: '先填 url', ms: 0, at: Date.now() })
      return
    }
    setSending(true)
    const started = Date.now()
    let next: Result
    try {
      const res = await fetch('/api/api-playground/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: form.method, url, headers: form.headers, body: form.body }),
      })
      const json = (await res.json()) as Result & { error?: string }
      next = { ...json, at: Date.now() }
      if (!res.ok) next = { ok: false, url, error: String(json?.error ?? `本机路由 HTTP ${res.status}`), ms: Date.now() - started, at: Date.now() }
    } catch (error) {
      next = { ok: false, url, error: String((error as Error)?.message ?? error), ms: Date.now() - started, at: Date.now() }
    }
    setSending(false)
    setResult(next)

    const entry: HistoryEntry = {
      at: next.at ?? Date.now(),
      method: form.method,
      url,
      headers: form.headers,
      body: form.body,
      status: next.status ?? 0,
      statusText: next.statusText ?? '',
      ms: next.ms ?? Date.now() - started,
      bytes: next.bytes ?? 0,
      truncated: Boolean(next.truncated),
      error: next.error,
      preview: cap(asText(next.body), PREVIEW_LIMIT),
    }
    // 写回文档：请求参数 + 最近 20 条历史 + 最后一次响应（有截断，别让文档变日志盘）。
    commit({
      method: form.method,
      url,
      headers: form.headers,
      body: form.body,
      history: [entry, ...history].slice(0, HISTORY_LIMIT),
      last: { ...next, body: cap(asText(next.body), STORE_LIMIT) },
    })
  }

  const onKeyDown = (event: { key: string; metaKey?: boolean; ctrlKey?: boolean; preventDefault: () => void; stopPropagation: () => void }) => {
    event.stopPropagation()
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void send()
    }
  }

  const loadHistory = (entry: HistoryEntry) => {
    patchForm({ method: entry.method, url: entry.url, headers: entry.headers, body: entry.body })
    commit({ method: entry.method, url: entry.url, headers: entry.headers, body: entry.body })
    setResult({
      ok: !entry.error,
      status: entry.status || undefined,
      statusText: entry.statusText,
      ms: entry.ms,
      bytes: entry.bytes,
      truncated: entry.truncated,
      error: entry.error,
      body: entry.preview,
      at: entry.at,
    })
    setTab('response')
  }

  const clearHistory = () => commit({ history: [] })

  const editable = writable

  return (
    <div className="ap-root" ref={hostRef} data-testid="api-playground-block" data-plugin={name}>
      <div className="ap-bar">
        <select
          className="ap-method"
          data-testid="api-playground-method"
          value={form.method}
          disabled={!editable}
          onChange={(event: { target: { value: string } }) => patchForm({ method: event.target.value })}
          onBlur={() => commit({ method: form.method })}
          title="HTTP 方法"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="ap-url"
          data-testid="api-playground-url"
          value={form.url}
          spellCheck={false}
          placeholder="http://127.0.0.1:3141/api/page-terminal/shell"
          disabled={!editable}
          onChange={(event: { target: { value: string } }) => patchForm({ url: event.target.value })}
          onBlur={() => commit({ url: form.url })}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="ap-send"
          data-testid="api-playground-send"
          disabled={!editable || sending}
          onClick={() => void send()}
          title="发送请求（⌘/Ctrl + ↵）"
        >
          {sending ? '发送中…' : '发送'}
        </button>
      </div>

      <div className="ap-tabs">
        <button
          type="button"
          className={tab === 'request' ? 'ap-tab ap-tab-on' : 'ap-tab'}
          data-testid="api-playground-tab-request"
          onClick={() => setTab('request')}
        >
          请求
        </button>
        <button
          type="button"
          className={tab === 'response' ? 'ap-tab ap-tab-on' : 'ap-tab'}
          data-testid="api-playground-tab-response"
          onClick={() => setTab('response')}
        >
          响应
        </button>
        {active && !sending ? (
          <span className={statusClass(active.status, active.ok)} data-testid="api-playground-status">
            {active.ok ? `${active.status} ${active.statusText || ''}`.trim() : '请求失败'}
          </span>
        ) : null}
        {sending ? <span className="ap-note">请求中…</span> : null}
        <span className="ap-spacer" />
        <span className="ap-hint">⌘/Ctrl + ↵ 发送</span>
      </div>

      {tab === 'request' ? (
        <div className="ap-pane" data-testid="api-playground-request-pane">
          <label className="ap-field">
            <span className="ap-label">请求头 headers</span>
            <textarea
              className="ap-area ap-head-area"
              data-testid="api-playground-headers"
              spellCheck={false}
              value={form.headers}
              placeholder={'Content-Type: application/json\nAuthorization: Bearer ...'}
              disabled={!editable}
              onChange={(event: { target: { value: string } }) => patchForm({ headers: event.target.value })}
              onBlur={() => commit({ headers: form.headers })}
              onKeyDown={onKeyDown}
            />
          </label>
          <label className="ap-field">
            <span className="ap-label">请求体 body</span>
            <textarea
              className="ap-area ap-body-area"
              data-testid="api-playground-body"
              spellCheck={false}
              value={form.body}
              placeholder={'{\n  "name": "biu"\n}'}
              disabled={!editable}
              onChange={(event: { target: { value: string } }) => patchForm({ body: event.target.value })}
              onBlur={() => commit({ body: form.body })}
              onKeyDown={onKeyDown}
            />
          </label>
        </div>
      ) : (
        <div className="ap-pane" data-testid="api-playground-response-pane">
          {!active ? (
            <div className="ap-note">还没发过请求。填好上面的 url，点「发送」。</div>
          ) : active.error ? (
            <div className="ap-err" data-testid="api-playground-error">
              {active.error}
            </div>
          ) : (
            <React.Fragment>
              <div className="ap-tabs">
                <span className="ap-note">{active.ms ?? 0} ms</span>
                <span className="ap-note">{formatBytes(active.bytes ?? 0)}</span>
                {active.truncated ? (
                  <span className="ap-note" data-testid="api-playground-truncated">
                    已截断：只回传前 200 KB
                  </span>
                ) : null}
                {active.finalUrl && active.finalUrl !== active.url ? (
                  <span className="ap-note">重定向到 {active.finalUrl}</span>
                ) : null}
              </div>
              {Object.keys(activeHeaders).length ? (
                <details className="ap-details" data-testid="api-playground-res-headers-wrap">
                  <summary className="ap-label">
                    响应头 · {Object.keys(activeHeaders).length} 条
                  </summary>
                  <div className="ap-hlist" data-testid="api-playground-res-headers">
                    {Object.entries(activeHeaders).map(([key, value]) => (
                      <div className="ap-hrow" key={key}>
                        <span className="ap-hkey">{key}</span>
                        <span className="ap-hval">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <div className="ap-field">
                <span className="ap-label">
                  响应体{bodyView.json ? ' · 已自动美化 JSON' : ''}
                </span>
                <pre className="ap-pre" data-testid="api-playground-res-body">
                  {bodyView.text || '（空响应体）'}
                </pre>
              </div>
            </React.Fragment>
          )}
        </div>
      )}

      <div className="ap-history" data-testid="api-playground-history">
        <div className="ap-hist-head">
          <button
            type="button"
            className="ap-ghost"
            data-testid="api-playground-history-toggle"
            onClick={() => setHistOpen((v: boolean) => !v)}
          >
            {histOpen ? '收起历史' : `历史（${history.length}）`}
          </button>
          {history.length ? (
            <button type="button" className="ap-ghost" disabled={!editable} onClick={clearHistory}>
              清空
            </button>
          ) : null}
          <span className="ap-spacer" />
          <span className="ap-hint">历史存在块数据里，跟文档一起版本化</span>
        </div>
        {histOpen && history.length ? (
          <div className="ap-hist-list">
            {history.map((entry: HistoryEntry, index: number) => (
              <button
                type="button"
                className="ap-hist-row"
                key={`${entry.at}-${index}`}
                onClick={() => loadHistory(entry)}
                title="载回这次请求"
              >
                <span className="ap-hist-m">{entry.method}</span>
                <span className="ap-hist-u">{entry.url}</span>
                <span className={statusClass(entry.status, !entry.error)}>{entry.error ? 'ERR' : entry.status}</span>
                <span className="ap-hist-t">{entry.ms}ms · {formatClock(entry.at)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'api-play',
    plugin: name,
    label: 'API 调试块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '填 method / url / headers / body，点发送，host 侧真发 HTTP 请求，状态码 / 耗时 / 响应头 / 响应体都显示在块里；历史存进块数据',
    aliases: ['api', 'http', 'request', 'curl', 'postman', '接口', '调试'],
    defaults: () => ({
      title: 'API 调试',
      method: 'GET',
      url: 'http://127.0.0.1:3141/api/page-terminal/shell',
      headers: 'Content-Type: application/json',
      body: '',
      history: [],
    }),
    View: ApiPlaygroundBlock,
  })
}
