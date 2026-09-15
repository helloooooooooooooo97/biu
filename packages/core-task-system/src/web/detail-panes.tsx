import { useEffect, useState } from 'react'
import {
  ArrowPathIcon,
  BoltIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  CursorArrowRippleIcon,
  PlayIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import type { FsDetailPaneProps } from '@biu/type-file-system/ui'

async function patchRecord(id: string, content: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/tasks/${id}`, content }),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  window.dispatchEvent(new Event('fsdb:change'))
}

type Trigger = {
  enabled?: boolean
  cron?: string | null
  at?: number | null
  on?: string[]
  state?: string
  lastRun?: number | null
}

type Report = {
  sessionId?: string
  sessionName?: string
  turn?: number | null
  status?: string
  note?: string
  ts?: number
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; totalTokens?: number }
}

function parseCronFields(cron: string | null | undefined): (string | null)[] {
  if (!cron) return []
  const parts = cron.trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.map((p) => (p === '*' ? null : p)) : []
}

function cronFieldWord(f: string): string {
  if (f === '*') return '每次'
  const sl = f.match(/^\*\/(\d+)$/)
  if (sl) return `每${sl[1]}`
  const range = f.match(/^(\d+)-(\d+)$/)
  if (range) return `${range[1]}到${range[2]}`
  return f
}

function cronPreview(cron: string | null | undefined): string {
  const f = parseCronFields(cron)
  const fieldNames = ['分钟', '小时', '日', '月', '星期']
  if (f.length === 6) {
    const sec = cronFieldWord(f[0] ?? '*')
    const nonSec = f.slice(1)
    if (nonSec.every((x) => x == null)) return `每${sec}触发一次`
    const rest = nonSec.map((x, i) => (x ? `${fieldNames[i]}${cronFieldWord(x)}` : null)).filter(Boolean).join('，')
    return `每${sec}，${rest}时触发`
  }
  if (f.length === 5) {
    const min = f[0]
    const hour = f[1]
    const day = f[2]
    const month = f[3]
    const week = f[4]
    const isNumeric = (v: string | null) => v != null && /^\d+$/.test(v)
    if (isNumeric(hour) && isNumeric(min) && !day && !month && !week) return `每天${hour}时${min}分触发`
    if (week && !day && !month && /^\d$/.test(week)) {
      return `每周${['日', '一', '二', '三', '四', '五', '六'][Number(week)] ?? week}触发`
    }
    const nonStar = f.map((x, i) => (x ? `${fieldNames[i]}${cronFieldWord(x)}` : null)).filter(Boolean)
    return nonStar.length ? `满足 ${nonStar.join('，')} 时触发` : '每分钟触发一次'
  }
  return f.length ? `cron: ${cron}` : '未设置'
}

const CRON_FIELD_RE = /^(\*|\*\/\d+|\d+|\d+-\d+)$/
function cronFieldValid(v: string) {
  return !v || CRON_FIELD_RE.test(v.trim())
}
function composeCron(s: string, m: string, h: string, d: string, mo: string, w: string) {
  const fields = [m || '*', h || '*', d || '*', mo || '*', w || '*']
  if (s && s !== '*') fields.unshift(s)
  return fields.join(' ')
}
function spawnCronFields(cron: string) {
  const f = parseCronFields(cron)
  if (f.length === 6) return { s: f[0] ?? '', m: f[1] ?? '', h: f[2] ?? '', d: f[3] ?? '', mo: f[4] ?? '', w: f[5] ?? '' }
  if (f.length === 5) return { s: '', m: f[0] ?? '', h: f[1] ?? '', d: f[2] ?? '', mo: f[3] ?? '', w: f[4] ?? '' }
  return { s: '', m: '', h: '', d: '', mo: '', w: '' }
}
function inferTriggerMode(cron: string) {
  const f = parseCronFields(cron)
  if (f.length === 6 && f[0] != null && f[0].startsWith('*/') && f.slice(1).every((x) => x == null)) return 'sec'
  if (f.length === 5) {
    const [m, h, d, mo, w] = f
    if (m != null && m.startsWith('*/') && !h && !d && !mo && !w) return 'min'
    if (h != null && h.startsWith('*/') && !m && !d && !mo && !w) return 'hour'
    if (h && m && !d && !mo && !w) return 'day'
    if (w && !m && !h && !d && !mo) return 'week'
  }
  return 'custom'
}
function inferN(cron: string, def: number) {
  const first = parseCronFields(cron).find((x) => x && x.startsWith('*/'))
  return first?.match(/^\*\/(\d+)$/)?.[1] || String(def)
}
function inferH(cron: string, def = '10') {
  const f = parseCronFields(cron)
  const v = f[f.length === 6 ? 2 : 1]
  return v && /^\d+$/.test(v) ? v : String(def)
}
function inferM(cron: string, def = '0') {
  const f = parseCronFields(cron)
  const v = f[f.length === 6 ? 1 : 0]
  return v && /^\d+$/.test(v) ? v : String(def)
}
function inferW(cron: string, def = '1') {
  const f = parseCronFields(cron)
  const w = f.length === 6 ? f[5] : f[4]
  return w && /^\d$/.test(w) ? w : def
}
function presetCron(mode: string, fields: ReturnType<typeof spawnCronFields>, n: string, hh: string, mm: string, wk: string) {
  if (mode === 'sec') return `*/${n} * * * * *`
  if (mode === 'min') return `*/${n} * * * *`
  if (mode === 'hour') return `0 */${n} * * *`
  if (mode === 'day') return `${mm || '0'} ${hh || '0'} * * *`
  if (mode === 'week') return `0 0 * * ${wk || '1'}`
  return composeCron(fields.s, fields.m, fields.h, fields.d, fields.mo, fields.w)
}
function triggerSummary(cron: string, at: number | null | undefined, on: string[]) {
  const parts: string[] = []
  if (cron) parts.push(cronPreview(cron))
  if (at) {
    const d = new Date(at)
    parts.push(`在 ${d.getMonth() + 1}月${d.getDate()}日 触发`)
  }
  for (const e of on) parts.push(e === 'dep:done' ? '依赖完成' : e === 'turn:end' ? '回合结束' : e)
  return parts.length ? parts.join('，') : '配置自动化规则'
}
function formatWhen(ts: number | null | undefined) {
  if (!ts) return '—'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleString()
}
function timeUntilLabel(ts: number) {
  const diff = ts - Date.now()
  if (diff <= 0) return '立即'
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}秒后`
  const min = Math.round(s / 60)
  if (min < 60) return `${min}分钟后`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}小时后`
  return `${Math.round(hr / 24)}天后`
}
function formatDueInput(ts: number) {
  const date = new Date(ts)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function formatTokens(n: number) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function asTrigger(record: DbRecord): Trigger {
  const raw = record.trigger
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Trigger) : {}
}

function asReports(record: DbRecord): Report[] {
  return Array.isArray(record.reports) ? (record.reports as Report[]) : []
}

export function ScriptPane({ record }: FsDetailPaneProps) {
  const trigger = asTrigger(record)
  const [enabled, setEnabled] = useState(Boolean(trigger.enabled))
  const [cron, setCron] = useState(trigger.cron ?? '')
  const [at, setAt] = useState(trigger.at ? formatDueInput(trigger.at) : '')
  const [on, setOn] = useState<string[]>(Array.isArray(trigger.on) ? trigger.on : [])
  const [mode, setMode] = useState(() => inferTriggerMode(trigger.cron ?? ''))
  const [fields, setFields] = useState(() => spawnCronFields(trigger.cron ?? ''))
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    setEnabled(Boolean(trigger.enabled))
    setCron(trigger.cron ?? '')
    setAt(trigger.at ? formatDueInput(trigger.at) : '')
    setOn(Array.isArray(trigger.on) ? trigger.on : [])
    setMode(inferTriggerMode(trigger.cron ?? ''))
    setFields(spawnCronFields(trigger.cron ?? ''))
    setAddOpen(false)
  }, [record.id, record.updatedAt])

  const save = (patch: Record<string, unknown>) => void patchRecord(record.id, { trigger: patch })
  const hasAuto = Boolean(cron || at || on.length)
  const show = enabled || hasAuto

  return (
    <div className="tasks-detail-pane">
      <div className="tasks-field tasks-l-field tasks-automation">
        <div className="tasks-auto-head">
          <span className="tasks-auto-title">
            <ClockIcon aria-hidden className="size-[14px]" /> 自动触发
          </span>
          <label className={`tasks-auto-switch${enabled ? ' is-on' : ''}`} title={enabled ? '点击关闭此规则' : '点击开启此规则'}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                const next = event.target.checked
                setEnabled(next)
                save({ enabled: next })
              }}
            />
            <span className="tasks-auto-switch-track">
              <span className="tasks-auto-switch-knob" />
            </span>
          </label>
        </div>
        {show ? (
          <>
            <div className="tasks-auto-summary">
              <span className="tasks-auto-summary-dot" />
              <span>{triggerSummary(cron, trigger.at, on)}</span>
            </div>
            <div className="tasks-auto-sec-head">
              <CursorArrowRippleIcon aria-hidden className="size-[14px]" /> Trigger · 触发
            </div>
            <div className="tasks-auto-sec">
              <div className="tasks-auto-cond-list">
                {cron ? (
                  <div className="tasks-auto-cond">
                    <div className="tasks-auto-cond-head">
                      <span className="tasks-auto-cond-type">
                        <CalendarDaysIcon aria-hidden className="size-[14px]" /> 定时
                      </span>
                      <button
                        type="button"
                        className="tasks-auto-cond-del"
                        title="删除定时条件"
                        onClick={() => {
                          setCron('')
                          setMode('min')
                          setFields(spawnCronFields(''))
                          save({ cron: null })
                        }}
                      >
                        <XMarkIcon aria-hidden className="size-[14px]" />
                      </button>
                    </div>
                    <div className="tasks-auto-cond-body">
                      <div className="tasks-trigger-field">
                        <span>频率</span>
                        <div className="tasks-auto-seg tasks-auto-preset">
                          {(['sec', 'min', 'hour', 'day', 'week', 'custom'] as const).map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={mode === item ? 'is-active' : ''}
                              onClick={() => {
                                setMode(item)
                                const cronStr = presetCron(item, fields, '5', '10', '0', '1')
                                setCron(cronStr)
                                setFields(spawnCronFields(cronStr))
                                save({ cron: cronStr || null })
                              }}
                            >
                              {{ sec: '每N秒', min: '每N分钟', hour: '每小时', day: '每天', week: '每周', custom: '自定义' }[item]}
                            </button>
                          ))}
                        </div>
                      </div>
                      {mode === 'sec' || mode === 'min' || mode === 'hour' ? (
                        <label className="tasks-trigger-field">
                          <span>{mode === 'hour' ? '每 N 小时' : mode === 'min' ? '间隔（分钟）' : '间隔（秒）'}</span>
                          <input
                            className="tasks-field-input tasks-cron-num"
                            type="number"
                            min={1}
                            defaultValue={inferN(cron, mode === 'hour' ? 1 : 5)}
                            onChange={(event) => {
                              const n = event.target.value || '5'
                              const cronStr =
                                mode === 'sec' ? `*/${n} * * * * *` : mode === 'min' ? `*/${n} * * * *` : `0 */${n} * * *`
                              setCron(cronStr)
                              save({ cron: cronStr })
                            }}
                          />
                        </label>
                      ) : mode === 'day' ? (
                        <div className="tasks-trigger-field">
                          <span>每天时间</span>
                          <div className="tasks-trigger-time">
                            <input
                              className="tasks-field-input tasks-cron-num"
                              type="number"
                              min={0}
                              max={23}
                              defaultValue={inferH(cron)}
                              onChange={(event) => {
                                const cronStr = `${inferM(cron)} ${event.target.value || '0'} * * *`
                                setCron(cronStr)
                                save({ cron: cronStr })
                              }}
                            />
                            <span className="tasks-trigger-time-sep">:</span>
                            <input
                              className="tasks-field-input tasks-cron-num"
                              type="number"
                              min={0}
                              max={59}
                              defaultValue={inferM(cron)}
                              onChange={(event) => {
                                const cronStr = `${event.target.value || '0'} ${inferH(cron)} * * *`
                                setCron(cronStr)
                                save({ cron: cronStr })
                              }}
                            />
                          </div>
                        </div>
                      ) : mode === 'week' ? (
                        <label className="tasks-trigger-field">
                          <span>星期几</span>
                          <select
                            className="tasks-trigger-mode tasks-cron-week"
                            value={inferW(cron)}
                            onChange={(event) => {
                              const cronStr = `0 0 * * ${event.target.value}`
                              setCron(cronStr)
                              save({ cron: cronStr })
                            }}
                          >
                            {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                              <option key={i} value={String(i)}>
                                周{w}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="tasks-trigger-field">
                          <span>高级 cron（秒 分 时 日 月 周）</span>
                          <div className="tasks-trigger-cronfield">
                            {(['s', 'm', 'h', 'd', 'mo', 'w'] as const).map((key) => (
                              <label key={key} className={`tasks-cron-field${fields[key] && !cronFieldValid(fields[key]) ? ' is-invalid' : ''}`}>
                                <span>{{ s: '秒', m: '分', h: '时', d: '日', mo: '月', w: '周' }[key]}</span>
                                <input
                                  className="tasks-field-input"
                                  value={fields[key]}
                                  placeholder="*"
                                  onChange={(event) => {
                                    const next = { ...fields, [key]: event.target.value }
                                    setFields(next)
                                    const cronStr = composeCron(next.s, next.m, next.h, next.d, next.mo, next.w)
                                    const invalid = Object.values(next).some((f) => f && !cronFieldValid(f))
                                    setCron(invalid ? '' : cronStr)
                                    if (!invalid) save({ cron: cronStr })
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="tasks-trigger-field">
                        <span>解读</span>
                        <span className="tasks-trigger-preview">{cronPreview(cron)}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
                {at ? (
                  <div className="tasks-auto-cond">
                    <div className="tasks-auto-cond-head">
                      <span className="tasks-auto-cond-type">
                        <ClockIcon aria-hidden className="size-[14px]" /> 特定时间
                      </span>
                      <button
                        type="button"
                        className="tasks-auto-cond-del"
                        onClick={() => {
                          setAt('')
                          save({ at: null })
                        }}
                      >
                        <XMarkIcon aria-hidden className="size-[14px]" />
                      </button>
                    </div>
                    <div className="tasks-auto-cond-body">
                      <label className="tasks-trigger-field">
                        <span>日期</span>
                        <input
                          className="tasks-field-input"
                          type="date"
                          value={at}
                          onChange={(event) => setAt(event.target.value)}
                          onBlur={() => save({ at: at.trim() ? new Date(`${at}T00:00:00`).getTime() : null })}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
                {on.map((ev) => (
                  <div key={ev} className="tasks-auto-cond">
                    <div className="tasks-auto-cond-head">
                      <span className="tasks-auto-cond-type">
                        <BoltIcon aria-hidden className="size-[14px]" /> {ev === 'dep:done' ? '依赖完成' : '回合结束'}
                      </span>
                      <button
                        type="button"
                        className="tasks-auto-cond-del"
                        onClick={() => {
                          const next = on.filter((item) => item !== ev)
                          setOn(next)
                          save({ on: next })
                        }}
                      >
                        <XMarkIcon aria-hidden className="size-[14px]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="tasks-auto-add">
                {addOpen ? (
                  <div className="tasks-auto-seg">
                    <button
                      type="button"
                      onClick={() => {
                        const cronStr = '*/5 * * * * *'
                        setMode('sec')
                        setFields(spawnCronFields(cronStr))
                        setCron(cronStr)
                        setAddOpen(false)
                        save({ cron: cronStr })
                      }}
                    >
                      <CalendarDaysIcon aria-hidden className="size-[14px]" /> 定时
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const atStr = formatDueInput(Date.now())
                        setAt(atStr)
                        setAddOpen(false)
                        save({ at: new Date(`${atStr}T00:00:00`).getTime() })
                      }}
                    >
                      <ClockIcon aria-hidden className="size-[14px]" /> 特定时间
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = on.includes('dep:done') ? on : [...on, 'dep:done']
                        setOn(next)
                        setAddOpen(false)
                        save({ on: next })
                      }}
                    >
                      依赖完成
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = on.includes('turn:end') ? on : [...on, 'turn:end']
                        setOn(next)
                        setAddOpen(false)
                        save({ on: next })
                      }}
                    >
                      回合结束
                    </button>
                  </div>
                ) : (
                  <button type="button" className="tasks-auto-add-btn" onClick={() => setAddOpen(true)}>
                    <PlusIcon aria-hidden className="size-[14px]" /> 触发条件
                  </button>
                )}
              </div>
            </div>
            <div className="tasks-auto-sec-head">
              <PlayIcon aria-hidden className="size-[14px]" /> Then · 执行
            </div>
            <div className="tasks-auto-sec tasks-auto-then">
              <span className="tasks-auto-then-arrow">
                <PlayIcon aria-hidden className="size-[14px]" />
              </span>
              <span className="tasks-auto-then-text">自动派工给执行人并开始执行任务</span>
            </div>
            <div className="tasks-trigger-status">
              <span className={`tasks-trigger-state-pill is-${trigger.state ?? 'idle'}`}>
                <span className="tasks-trigger-state-dot" />
                {trigger.state ?? 'idle'}
              </span>
              <div className="tasks-trigger-times">
                {typeof record.nextTriggerAt === 'number' ? (
                  <span className="tasks-trigger-next">
                    <span className="tasks-trigger-tk">下次触发</span>
                    <span className="tasks-trigger-tv">{timeUntilLabel(Number(record.nextTriggerAt))}</span>
                    <span className="tasks-trigger-ts">{new Date(Number(record.nextTriggerAt)).toLocaleString()}</span>
                  </span>
                ) : null}
                {trigger.lastRun ? (
                  <span className="tasks-trigger-last">
                    <span className="tasks-trigger-tk">上次触发</span>
                    <span className="tasks-trigger-tv">{formatWhen(trigger.lastRun)}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function ReportsPane({ record }: FsDetailPaneProps) {
  const reports = asReports(record)
  return (
    <div className="tasks-detail-pane">
      <div className="tasks-detail-meta">
        {reports.length ? (
          <>
            <div className="tasks-exec-timeline-head">执行报告</div>
            <ul className="tasks-report-timeline">
              {[...reports].reverse().map((item, i) => {
                const usage = item.usage
                const total = Number(usage?.totalTokens) || 0
                return (
                  <li key={`${item.ts}-${i}`} className={`tasks-report-item is-${item.status ?? 'doing'}`}>
                    <span className="tasks-report-node">
                      {item.status === 'done' ? (
                        <CheckCircleIcon aria-hidden className="size-[14px]" />
                      ) : (
                        <ArrowPathIcon aria-hidden className="size-[14px]" />
                      )}
                    </span>
                    <span className="tasks-report-rail" />
                    <div className="tasks-report-content">
                      {item.note ? <div className="tasks-report-note">{item.note}</div> : null}
                      <div className="tasks-report-usage">
                        <span className="tasks-report-time">
                          {formatWhen(item.ts)}
                          {item.sessionName || item.sessionId ? ` · ${item.sessionName || String(item.sessionId).slice(0, 8)}` : ''}
                          {item.turn != null ? ` · T${item.turn}` : ''}
                        </span>
                        {total > 0 ? (
                          <span className="traj-usage">
                            <span className="traj-usage-in">{formatTokens(Number(usage?.inputTokens) || 0)}</span>
                            <span className="traj-usage-arrow">→</span>
                            <span className="traj-usage-out">{formatTokens(Number(usage?.outputTokens) || 0)}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="tasks-auto-then-text">还没有进度汇报。</p>
        )}
      </div>
    </div>
  )
}
