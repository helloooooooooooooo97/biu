const React = globalThis.React
const { useState, useCallback, useEffect } = React

export const name = 'page-regression'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

type Assert = {
  id: string
  type: string
  selector?: string
  expect?: string
  method?: string
  url?: string
  status?: number | string
  note?: string
}

type ItemResult = {
  id: string
  type: string
  status: 'pass' | 'fail'
  ms: number
  actual: string
  delta?: 'fixed' | 'broken'
}

type Run = {
  at: number
  ms: number
  total: number
  passed: number
  failed: number
  items: ItemResult[]
}

const TYPES = [
  { id: 'exists', label: '存在' },
  { id: 'text', label: '文案匹配' },
  { id: 'count', label: '数量相等' },
  { id: 'http', label: '接口状态' },
]

const MAX_RUNS = 10
const MAX_ACTUAL = 72
const STYLE_ID = 'page-regression-style-v2'
const STYLE_CSS = `
.rg-root{border:1px solid var(--dsw-border);border-radius:8px;padding:10px 12px;font-family:var(--font-sans);font-size:14px;color:var(--dsw-label);background:var(--dsw-bg);user-select:text}
.rg-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rg-title{font-size:13px;font-weight:650}
.rg-meta{color:var(--dsw-label-3);font-family:var(--font-mono);font-size:12px}
.rg-grow{flex:1}
.rg-btn{flex:none;height:26px;padding:0 8px;border:1px solid var(--dsw-border);border-radius:6px;background:transparent;color:var(--dsw-label);font-size:13px;font-weight:650;cursor:pointer}
.rg-btn:hover{background:var(--dsw-hover)}
.rg-btn:disabled{opacity:.5;cursor:default}
.rg-rows{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.rg-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rg-idx{flex:none;width:18px;color:var(--dsw-label-3);font-family:var(--font-mono);font-size:12px}
.rg-input{min-width:0;flex:1 1 140px;box-sizing:border-box;height:26px;padding:0 8px;border:1px solid var(--dsw-border);border-radius:6px;background:var(--dsw-input);color:var(--dsw-label);font-family:var(--font-mono);font-size:12px}
.rg-chip{flex:none;min-width:96px;padding:2px 6px;border:1px solid var(--dsw-border);border-radius:6px;font-family:var(--font-mono);font-size:11px;white-space:nowrap;color:var(--dsw-label)}
.rg-chip.is-pass{color:var(--dsw-label);background:color-mix(in srgb,var(--dsw-ok,#3fb950) 14%,transparent)}
.rg-chip.is-fail{color:var(--dsw-danger);background:color-mix(in srgb,var(--dsw-danger) 12%,transparent)}
.rg-actual{flex:1 1 100%;padding-left:24px;color:var(--dsw-label-3);font-family:var(--font-mono);font-size:11px}
.rg-actual.is-fail{color:var(--dsw-danger)}
.rg-empty{color:var(--dsw-label-3);font-size:13px}
.rg-hist{margin-top:8px;border-top:1px solid var(--dsw-border);padding-top:6px}
.rg-hist-row{display:flex;gap:8px;font-family:var(--font-mono);font-size:12px;color:var(--dsw-label-2)}
`

function useRgStyle() {
  useEffect(() => {
    const existing = document.getElementById(STYLE_ID)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function newId() {
  return 'a' + Math.random().toString(36).slice(2, 7)
}

function clip(value: unknown, max = MAX_ACTUAL) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

/** 一条断言：真去读 DOM / 真去发请求，返回 通过|失败 + 实际值 + 耗时。 */
async function runAssert(item: Assert): Promise<{ status: 'pass' | 'fail'; actual: string; ms: number }> {
  const started = nowMs()
  const done = (status: 'pass' | 'fail', actual: string) => ({
    status,
    actual: clip(actual),
    ms: Math.max(1, Math.round(nowMs() - started)),
  })
  const selector = String(item.selector ?? '').trim()
  try {
    if (item.type === 'exists') {
      if (!selector) return done('fail', '没写选择器')
      const el = document.querySelector(selector)
      return el ? done('pass', `<${el.tagName.toLowerCase()}> 命中`) : done('fail', `没找到 ${selector}`)
    }
    if (item.type === 'text') {
      if (!selector) return done('fail', '没写选择器')
      const el = document.querySelector(selector)
      if (!el) return done('fail', `没找到 ${selector}`)
      const got = clip(el.textContent, 200)
      const want = String(item.expect ?? '')
      return done(got.includes(want) ? 'pass' : 'fail', `实际：${got || '(空)'}`)
    }
    if (item.type === 'count') {
      const n = selector ? document.querySelectorAll(selector).length : -1
      const want = Number(item.expect)
      return done(n === want ? 'pass' : 'fail', `实际 ${n} 个，期望 ${Number.isFinite(want) ? want : '(没写)'} 个`)
    }
    if (item.type === 'http') {
      const method = String(item.method || 'GET').toUpperCase()
      const url = String(item.url ?? '').trim()
      if (!url) return done('fail', '没写 url')
      const res = await fetch('/api/page-regression/http', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, url }),
      })
      const payload = (await res.json()) as { status?: number; statusText?: string; body?: string; ms?: number }
      const want = Number(item.status ?? 200)
      const hit = payload.status === want
      return done(
        hit ? 'pass' : 'fail',
        `${method} ${url} → ${payload.status ?? 0} ${payload.statusText ?? ''}${hit ? '' : `（期望 ${want}）`}`,
      )
    }
    return done('fail', `不认识的断言类型：${item.type}`)
  } catch (error) {
    return done('fail', String(error))
  }
}

/** 和上一次跑的结果逐条对齐：上次失败这次通过 = fixed，反过来 = broken。 */
function markDeltas(prev: Run | null, items: ItemResult[]): ItemResult[] {
  if (!prev) return items
  const before = new Map(prev.items.map((item) => [item.id, item.status]))
  return items.map((item) => {
    const was = before.get(item.id)
    if (was === 'fail' && item.status === 'pass') return { ...item, delta: 'fixed' as const }
    if (was === 'pass' && item.status === 'fail') return { ...item, delta: 'broken' as const }
    return item
  })
}

function fmtTime(at: number) {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function Chip({ item }: { item?: ItemResult }) {
  if (!item) return <span className="rg-chip">—</span>
  const pass = item.status === 'pass'
  return (
    <span className={pass ? 'rg-chip is-pass' : 'rg-chip is-fail'}>
      {pass ? '通过' : '失败'} {item.ms}ms
      {item.delta ? <b style={{ marginLeft: 6 }}>{item.delta}</b> : null}
    </span>
  )
}

export function RegressionBlock({ data, update, writable }: BlockProps) {
  useRgStyle()
  const asserts = Array.isArray(data.asserts) ? (data.asserts as Assert[]) : []
  const runs = Array.isArray(data.runs) ? (data.runs as Run[]) : []
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const last = runs.length ? runs[runs.length - 1] : null
  const prev = runs.length > 1 ? runs[runs.length - 2] : null
  const resultOf = (id: string) => last?.items.find((item) => item.id === id)

  const patchAssert = (id: string, patch: Record<string, unknown>) =>
    update({ asserts: asserts.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

  const runAll = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const started = nowMs()
    try {
      const items: ItemResult[] = []
      for (const item of asserts) {
        const result = await runAssert(item)
        items.push({ id: item.id, type: item.type, ...result })
      }
      const marked = markDeltas(prev, items)
      const run: Run = {
        at: Date.now(),
        ms: Math.round(nowMs() - started),
        total: marked.length,
        passed: marked.filter((item) => item.status === 'pass').length,
        failed: marked.filter((item) => item.status === 'fail').length,
        items: marked,
      }
      update({ runs: [...runs, run].slice(-MAX_RUNS) })
    } finally {
      setBusy(false)
    }
  }, [busy, asserts, prev, runs, update])

  const fixed = last ? last.items.filter((item) => item.delta === 'fixed').length : 0
  const broken = last ? last.items.filter((item) => item.delta === 'broken').length : 0

  return (
    <div data-testid="regression-block" className="rg-root">
      <div className="rg-head">
        <b className="rg-title">页面回归检查</b>
        <span data-testid="regression-summary" className="rg-meta">
          {last
            ? `${last.passed}/${last.total} 通过 · ${last.failed} 失败 · ${last.ms}ms · ${fmtTime(last.at)}${
                fixed ? ` · fixed ${fixed}` : ''
              }${broken ? ` · broken ${broken}` : ''}`
            : `${asserts.length} 条断言 · 还没跑过`}
        </span>
        <span className="rg-grow" />
        {writable ? (
          <button type="button" data-testid="regression-add" onClick={() => update({ asserts: [...asserts, { id: newId(), type: 'exists', selector: '' }] })} className="rg-btn">
            加断言
          </button>
        ) : null}
        <button type="button" data-testid="regression-run" disabled={busy} onClick={() => void runAll()} className="rg-btn">
          {busy ? '跑…' : '跑一遍'}
        </button>
        {runs.length ? (
          <button type="button" data-testid="regression-history" onClick={() => setShowHistory(!showHistory)} className="rg-btn">
            历史 {runs.length}
          </button>
        ) : null}
      </div>

      <div className="rg-rows">
        {asserts.map((item, i) => {
          const result = resultOf(item.id)
          return (
            <div key={item.id} data-testid="regression-row" className="rg-row">
              <span className="rg-idx">{i + 1}</span>
              <select
                value={item.type}
                disabled={!writable}
                onChange={(event) => patchAssert(item.id, { type: event.target.value })}
                className="rg-input"
                style={{ flex: '0 0 88px' }}
              >
                {TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
              {item.type === 'http' ? (
                <>
                  <select
                    value={String(item.method || 'GET')}
                    disabled={!writable}
                    onChange={(event) => patchAssert(item.id, { method: event.target.value })}
                    className="rg-input"
                    style={{ flex: '0 0 74px' }}
                  >
                    {['GET', 'POST', 'PUT', 'DELETE'].map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  <input
                    value={String(item.url ?? '')}
                    disabled={!writable}
                    placeholder="/api/… 或 http://…"
                    onChange={(event) => patchAssert(item.id, { url: event.target.value })}
                    className="rg-input"
                    style={{ flex: '1 1 200px' }}
                  />
                  <input
                    value={String(item.status ?? 200)}
                    disabled={!writable}
                    onChange={(event) => patchAssert(item.id, { status: event.target.value })}
                    className="rg-input"
                    style={{ flex: '0 0 54px' }}
                  />
                </>
              ) : (
                <>
                  <input
                    value={String(item.selector ?? '')}
                    disabled={!writable}
                    placeholder="选择器，如 h1 / [data-testid=xxx]"
                    onChange={(event) => patchAssert(item.id, { selector: event.target.value })}
                    className="rg-input"
                    style={{ flex: '1 1 180px' }}
                  />
                  {item.type === 'exists' ? null : (
                    <input
                      value={String(item.expect ?? '')}
                      disabled={!writable}
                      placeholder={item.type === 'count' ? '期望个数' : '期望文案（子串）'}
                      onChange={(event) => patchAssert(item.id, { expect: event.target.value })}
                      className="rg-input"
                      style={{ flex: '0 0 130px' }}
                    />
                  )}
                </>
              )}
              <input
                value={String(item.note ?? '')}
                disabled={!writable}
                placeholder="说明"
                onChange={(event) => patchAssert(item.id, { note: event.target.value })}
                className="rg-input"
                style={{ flex: '0 0 96px', fontFamily: 'inherit' }}
              />
              <Chip item={result} />
              {writable ? (
                <button type="button" title="删掉这条断言" onClick={() => update({ asserts: asserts.filter((a) => a.id !== item.id) })} className="rg-btn">
                  删除
                </button>
              ) : null}
              {result ? <span className={result.status === 'pass' ? 'rg-actual' : 'rg-actual is-fail'}>{result.actual}</span> : null}
            </div>
          )
        })}
        {asserts.length ? null : <span className="rg-empty">还没有断言，点右上「加断言」加一条。</span>}
      </div>

      {showHistory && runs.length ? (
        <div data-testid="regression-history-list" className="rg-hist">
          {runs
            .slice()
            .reverse()
            .map((run) => (
              <div key={run.at} className="rg-hist-row">
                <span>{fmtTime(run.at)}</span>
                <span>
                  {run.passed}/{run.total}
                </span>
                <span>{run.ms}ms</span>
                <span>
                  {run.items.filter((item) => item.delta === 'fixed').length ? 'fixed ' + run.items.filter((item) => item.delta === 'fixed').length : ''}
                  {run.items.filter((item) => item.delta === 'broken').length ? ' broken ' + run.items.filter((item) => item.delta === 'broken').length : ''}
                </span>
              </div>
            ))}
        </div>
      ) : null}
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
    kind: 'run',
    plugin: name,
    label: '页面回归检查块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '写一组断言（元素存在 / 文案匹配 / 数量相等 / 接口状态码），点「跑一遍」逐条出通过失败，结果存进块 data.runs 并能和上一次对比（fixed / broken）',
    aliases: ['run', 'regression', 'test', 'assert', '回归', '断言', '检查'],
    defaults: {
      asserts: [
        { id: 'a1', type: 'exists', selector: 'h1', note: '标题在' },
        { id: 'a2', type: 'text', selector: 'h1', expect: '举例说明', note: '标题文案' },
        { id: 'a3', type: 'count', selector: 'h1', expect: '1', note: '只有一个 h1' },
        { id: 'a4', type: 'http', method: 'GET', url: '/api/db/stat?path=/pages/p005', status: 200, note: '页面可读' },
      ],
      runs: [],
    },
    View: RegressionBlock,
  })
}
