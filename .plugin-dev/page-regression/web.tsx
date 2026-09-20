const React = globalThis.React
const { useState, useCallback } = React

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
const COLOR = { pass: '#3FB950', fail: '#F85149', fixed: '#58A6FF', broken: '#D29922' }

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

const inputStyle = {
  minWidth: 0,
  flex: '1 1 140px',
  boxSizing: 'border-box' as const,
  padding: '4px 7px',
  border: '1px solid var(--dsw-border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 12,
}

function Chip({ item }: { item?: ItemResult }) {
  if (!item) return <span style={{ ...chipStyle, color: 'var(--dsw-label)' }}>—</span>
  const pass = item.status === 'pass'
  return (
    <span style={{ ...chipStyle, color: pass ? COLOR.pass : COLOR.fail, borderColor: pass ? COLOR.pass : COLOR.fail }}>
      {pass ? '通过' : '失败'} {item.ms}ms
      {item.delta ? (
        <b style={{ marginLeft: 6, color: item.delta === 'fixed' ? COLOR.fixed : COLOR.broken }}>{item.delta}</b>
      ) : null}
    </span>
  )
}

const chipStyle = {
  flex: 'none',
  minWidth: 96,
  padding: '2px 6px',
  border: '1px solid var(--dsw-border)',
  borderRadius: 6,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  whiteSpace: 'nowrap' as const,
}

export function RegressionBlock({ data, update, writable }: BlockProps) {
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
    <div
      data-testid="regression-block"
      style={{
        border: '1px solid var(--dsw-border)',
        borderRadius: 10,
        padding: '10px 12px',
        fontFamily: 'var(--font-sans, sans-serif)',
        fontSize: 13,
        userSelect: 'text',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>页面回归检查</b>
        <span data-testid="regression-summary" style={{ color: 'var(--dsw-label)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
          {last
            ? `${last.passed}/${last.total} 通过 · ${last.failed} 失败 · ${last.ms}ms · ${fmtTime(last.at)}${
                fixed ? ` · fixed ${fixed}` : ''
              }${broken ? ` · broken ${broken}` : ''}`
            : `${asserts.length} 条断言 · 还没跑过`}
        </span>
        <span style={{ flex: 1 }} />
        {writable ? (
          <button type="button" data-testid="regression-add" onClick={() => update({ asserts: [...asserts, { id: newId(), type: 'exists', selector: '' }] })} style={btnStyle}>
            ＋ 断言
          </button>
        ) : null}
        <button
          type="button"
          data-testid="regression-run"
          disabled={busy}
          onClick={() => void runAll()}
          style={{ ...btnStyle, borderColor: COLOR.pass, color: busy ? 'var(--dsw-label)' : COLOR.pass }}
        >
          {busy ? '跑…' : '跑一遍'}
        </button>
        {runs.length ? (
          <button type="button" data-testid="regression-history" onClick={() => setShowHistory(!showHistory)} style={btnStyle}>
            历史 {runs.length}
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {asserts.map((item, i) => {
          const result = resultOf(item.id)
          return (
            <div key={item.id} data-testid="regression-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ flex: 'none', width: 18, color: 'var(--dsw-label)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{i + 1}</span>
              <select
                value={item.type}
                disabled={!writable}
                onChange={(event) => patchAssert(item.id, { type: event.target.value })}
                style={{ ...inputStyle, flex: '0 0 88px' }}
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
                    style={{ ...inputStyle, flex: '0 0 74px' }}
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
                    style={{ ...inputStyle, flex: '1 1 200px' }}
                  />
                  <input
                    value={String(item.status ?? 200)}
                    disabled={!writable}
                    onChange={(event) => patchAssert(item.id, { status: event.target.value })}
                    style={{ ...inputStyle, flex: '0 0 54px' }}
                  />
                </>
              ) : (
                <>
                  <input
                    value={String(item.selector ?? '')}
                    disabled={!writable}
                    placeholder="选择器，如 h1 / [data-testid=xxx]"
                    onChange={(event) => patchAssert(item.id, { selector: event.target.value })}
                    style={{ ...inputStyle, flex: '1 1 180px' }}
                  />
                  {item.type === 'exists' ? null : (
                    <input
                      value={String(item.expect ?? '')}
                      disabled={!writable}
                      placeholder={item.type === 'count' ? '期望个数' : '期望文案（子串）'}
                      onChange={(event) => patchAssert(item.id, { expect: event.target.value })}
                      style={{ ...inputStyle, flex: '0 0 130px' }}
                    />
                  )}
                </>
              )}
              <input
                value={String(item.note ?? '')}
                disabled={!writable}
                placeholder="说明"
                onChange={(event) => patchAssert(item.id, { note: event.target.value })}
                style={{ ...inputStyle, flex: '0 0 96px', fontFamily: 'inherit' }}
              />
              <Chip item={result} />
              {writable ? (
                <button
                  type="button"
                  title="删掉这条断言"
                  onClick={() => update({ asserts: asserts.filter((a) => a.id !== item.id) })}
                  style={{ ...btnStyle, flex: 'none', padding: '2px 6px' }}
                >
                  ✕
                </button>
              ) : null}
              {result ? (
                <span style={{ flex: '1 1 100%', paddingLeft: 24, color: result.status === 'pass' ? 'var(--dsw-label)' : COLOR.fail, fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                  {result.actual}
                </span>
              ) : null}
            </div>
          )
        })}
        {asserts.length ? null : <span style={{ color: 'var(--dsw-label)', fontSize: 12 }}>还没有断言，点右上「＋ 断言」加一条。</span>}
      </div>

      {showHistory && runs.length ? (
        <div data-testid="regression-history-list" style={{ marginTop: 8, borderTop: '1px solid var(--dsw-border)', paddingTop: 6 }}>
          {runs
            .slice()
            .reverse()
            .map((run) => (
              <div key={run.at} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--dsw-label)' }}>
                <span>{fmtTime(run.at)}</span>
                <span style={{ color: run.failed ? COLOR.fail : COLOR.pass }}>
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

const btnStyle = {
  flex: 'none',
  padding: '3px 8px',
  border: '1px solid var(--dsw-border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
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
