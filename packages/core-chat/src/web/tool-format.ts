export type DiffLine = { type: 'add' | 'remove' | 'equal'; text: string }

export type ParsedToolCall =
  | { kind: 'str_replace'; path: string; oldStr: string; newStr: string }
  | { kind: 'create'; path: string; fileText: string }
  | { kind: 'insert'; path: string; insertLine: number; newStr: string }
  | { kind: 'view'; path: string; viewRange?: [number, number] }
  | { kind: 'bash'; command: string }
  | { kind: 'mcp'; server: string; tool: string; raw: string }
  | { kind: 'raw'; label: string; raw: string }

const DIFF_LINE_CAP = 400

/** 行级 LCS diff；超大块退化为整段删除 + 整段新增，避免卡 UI。 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText === newText) {
    return oldText === '' ? [] : oldText.split('\n').map((text) => ({ type: 'equal' as const, text }))
  }
  const a = oldText.split('\n')
  const b = newText.split('\n')
  if (a.length * b.length > DIFF_LINE_CAP * DIFF_LINE_CAP) {
    return [
      ...a.map((text) => ({ type: 'remove' as const, text })),
      ...b.map((text) => ({ type: 'add' as const, text })),
    ]
  }

  const n = a.length
  const m = b.length
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? (dp[i + 1]![j + 1]! + 1) : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'equal', text: a[i]! })
      i += 1
      j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'remove', text: a[i]! })
      i += 1
    } else {
      out.push({ type: 'add', text: b[j]! })
      j += 1
    }
  }
  while (i < n) {
    out.push({ type: 'remove', text: a[i]! })
    i += 1
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j]! })
    j += 1
  }
  return out
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim()
  if (!text.startsWith('{')) return null
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

/** 流式 tool/call 参数还不是完整 JSON 时，抽出已经写出的字符串字段。 */
export function extractPartialJsonString(raw: string, key: string): string | undefined {
  const needle = `"${key}"`
  const keyAt = raw.indexOf(needle)
  if (keyAt < 0) return undefined
  let i = keyAt + needle.length
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1
  if (raw[i] !== ':') return undefined
  i += 1
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1
  if (raw[i] !== '"') return undefined
  i += 1
  let out = ''
  while (i < raw.length) {
    const ch = raw[i]!
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next == null) break
      if (next === 'u' && raw.length >= i + 6) {
        const code = Number.parseInt(raw.slice(i + 2, i + 6), 16)
        if (Number.isFinite(code)) out += String.fromCharCode(code)
        i += 6
        continue
      }
      const escaped =
        next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next === '"' ? '"' : next === '\\' ? '\\' : next
      out += escaped
      i += 2
      continue
    }
    if (ch === '"') break
    out += ch
    i += 1
  }
  return out
}

function argString(args: Record<string, unknown> | null, raw: string, key: string): string | undefined {
  return asString(args?.[key]) ?? extractPartialJsonString(raw, key)
}

function parseJsonValue(raw: string): unknown | undefined {
  const text = raw.trim()
  if (!text || (text[0] !== '{' && text[0] !== '[' && text[0] !== '"' && text !== 'true' && text !== 'false' && text !== 'null' && !/^-?\d/.test(text))) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** 把工具结果里的 JSON 变得可读；bash 特判 stdout/stderr。 */
export type ToolArtifact = {
  name: string
  url: string
  mime?: string
  source?: string
}

export type ChartPoint = { x: number; y: number | null }

export type ChartSeries = { name: string; color: string; points: ChartPoint[] }

export type ChartStat = { name: string; min: number; max: number; avg: number }

export type FormattedDetail =
  | { kind: 'bash'; code: number | null; stdout: string; stderr: string; artifacts?: ToolArtifact[] }
  | { kind: 'text'; text: string }
  | { kind: 'json'; text: string }
  | { kind: 'chart'; title: string; series: ChartSeries[]; stats: ChartStat[]; text: string }

const TIME_KEYS = ['timestamp', 'time', 'ts', 'datetime', 'date']
const SKIP_METRIC_KEYS = new Set([
  ...TIME_KEYS,
  'id',
  'rank',
  'port',
  'index',
  'idx',
  'pid',
  'thread',
  'year',
  'month',
  'day',
  'hour',
  'minute',
])
const RECORD_LIST_KEYS = ['records', 'rows', 'results', 'metrics', 'points', 'items', 'list', 'data']
const CHART_COLORS = [
  'var(--dsw-pick)',
  'var(--dsw-ok)',
  'var(--dsw-danger)',
  '#c9a227',
  '#7c5cbf',
  '#3aa6a0',
  '#d67e30',
  '#4c8eb5',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function toFinite(value: unknown): number | null {
  if (typeof value === 'boolean') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseTs(value: unknown, index: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 1e12 ? value * 1000 : value
  }
  const raw = String(value ?? '')
  const direct = Date.parse(raw)
  if (!Number.isNaN(direct)) return direct
  const tod = Date.parse(`1970-01-01T${raw}`)
  if (!Number.isNaN(tod)) return tod + index
  return index
}

function unwrapToolPayload(raw: unknown): unknown {
  const obj = asRecord(raw)
  if (!obj || !Array.isArray(obj.content)) return raw
  const texts = obj.content
    .map((item) => {
      const row = asRecord(item)
      return typeof row?.text === 'string' ? row.text : null
    })
    .filter((item): item is string => Boolean(item))
  if (texts.length !== 1) return raw
  const inner = parseJsonValue(texts[0]!)
  return inner !== undefined ? inner : texts[0]
}

function prettyUnknown(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return fallback
  }
}

function findTimeKey(row: Record<string, unknown>): string | null {
  for (const key of TIME_KEYS) {
    if (row[key] != null && row[key] !== '') return key
  }
  return null
}

function metricKeys(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((key) => {
    if (SKIP_METRIC_KEYS.has(key)) return false
    return toFinite(row[key]) != null
  })
}

function chartStats(name: string, points: ChartPoint[]): ChartStat | null {
  const vals = points.map((p) => p.y).filter((y): y is number => y != null && Number.isFinite(y))
  if (!vals.length) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return { name, min, max, avg }
}

function finishChart(title: string, series: ChartSeries[], text: string): Extract<FormattedDetail, { kind: 'chart' }> | null {
  const usable = series.filter((s) => s.points.filter((p) => p.y != null).length >= 2).slice(0, 8)
  if (!usable.length) return null
  return {
    kind: 'chart',
    title,
    series: usable,
    stats: usable.map((s) => chartStats(s.name, s.points)).filter((s): s is ChartStat => Boolean(s)),
    text,
  }
}

function chartFromRecords(rows: unknown[], text: string): Extract<FormattedDetail, { kind: 'chart' }> | null {
  if (rows.length < 2) return null
  const first = asRecord(rows[0])
  if (!first) return null
  const timeKey = findTimeKey(first)
  if (!timeKey) return null
  const names = metricKeys(first)
  if (!names.length) return null
  const series = names.map((name, i) => ({
    name,
    color: CHART_COLORS[i % CHART_COLORS.length]!,
    points: rows.map((row, idx) => {
      const item = asRecord(row) ?? {}
      return { x: parseTs(item[timeKey], idx), y: toFinite(item[name]) }
    }),
  }))
  return finishChart(`监控指标 (${rows.length} 点)`, series, text)
}

function chartFromPairs(name: string, list: unknown[], text: string): Extract<FormattedDetail, { kind: 'chart' }> | null {
  if (list.length < 2) return null
  const points: ChartPoint[] = []
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i]
    if (Array.isArray(row) && row.length >= 2) {
      points.push({ x: parseTs(row[0], i), y: toFinite(row[1]) })
      continue
    }
    const item = asRecord(row)
    if (!item) return null
    const x = item.time ?? item.timestamp ?? item.ts
    const y = item.count ?? item.value ?? item.y
    if (x == null || y == null) return null
    points.push({ x: parseTs(x, i), y: toFinite(y) })
  }
  return finishChart(name, [{ name, color: CHART_COLORS[0]!, points }], text)
}

function findRecordList(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data
  const obj = asRecord(data)
  if (!obj) return null
  for (const key of RECORD_LIST_KEYS) {
    const nested = obj[key]
    if (Array.isArray(nested) && nested.length >= 2 && asRecord(nested[0])) return nested
  }
  const inner = asRecord(obj.data)
  if (inner) {
    for (const key of RECORD_LIST_KEYS) {
      const nested = inner[key]
      if (Array.isArray(nested) && nested.length >= 2 && asRecord(nested[0])) return nested
    }
  }
  return null
}

function findPairList(data: Record<string, unknown>): { name: string; list: unknown[] } | null {
  const timeline = asRecord(data.active_counts_timeline)
  const active = timeline?.active_counts
  if (Array.isArray(active) && active.length >= 2) return { name: 'active_count', list: active }
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value) || value.length < 2) continue
    const first = value[0]
    const looksPair =
      (Array.isArray(first) && first.length >= 2 && toFinite(first[1]) != null) ||
      (asRecord(first) != null && (asRecord(first)?.count != null || asRecord(first)?.value != null))
    if (looksPair && !asRecord(first)?.timestamp) return { name: key, list: value }
  }
  const inner = asRecord(data.data)
  return inner ? findPairList(inner) : null
}

function extractChart(data: unknown, text: string): Extract<FormattedDetail, { kind: 'chart' }> | null {
  const rows = findRecordList(data)
  if (rows) {
    const chart = chartFromRecords(rows, text)
    if (chart) return chart
  }
  const obj = asRecord(data)
  if (!obj) return null
  const pair = findPairList(obj)
  if (!pair) return null
  return chartFromPairs(pair.name, pair.list, text)
}

function parseArtifacts(raw: unknown): ToolArtifact[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const items: ToolArtifact[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name : ''
    const url = typeof item.url === 'string' ? item.url : ''
    if (!name || !url) continue
    items.push({
      name,
      url,
      ...(typeof item.mime === 'string' ? { mime: item.mime } : {}),
      ...(typeof item.source === 'string' ? { source: item.source } : {}),
    })
  }
  return items.length ? items : undefined
}

export function formatToolDetail(detail: string | undefined, toolKind?: ParsedToolCall['kind']): FormattedDetail | null {
  if (detail == null || detail === '') return null
  const trimmed = detail.trim()

  if (toolKind === 'bash' || trimmed.startsWith('{')) {
    const obj = parseJsonObject(trimmed)
    if (obj && ('stdout' in obj || 'stderr' in obj || 'code' in obj || 'artifacts' in obj)) {
      const codeRaw = obj.code
      const code =
        typeof codeRaw === 'number'
          ? codeRaw
          : codeRaw === null
            ? null
            : typeof codeRaw === 'string' && /^-?\d+$/.test(codeRaw)
              ? Number(codeRaw)
              : null
      const artifacts = parseArtifacts(obj.artifacts)
      return {
        kind: 'bash',
        code,
        stdout: typeof obj.stdout === 'string' ? obj.stdout : obj.stdout != null ? String(obj.stdout) : '',
        stderr: typeof obj.stderr === 'string' ? obj.stderr : obj.stderr != null ? String(obj.stderr) : '',
        ...(artifacts ? { artifacts } : {}),
      }
    }
  }

  const parsed = parseJsonValue(trimmed)
  if (parsed !== undefined && (typeof parsed === 'object' || Array.isArray(parsed))) {
    const payload = unwrapToolPayload(parsed)
    const text = prettyUnknown(payload, JSON.stringify(parsed, null, 2))
    const chart = extractChart(payload, text)
    if (chart) return chart
    if (payload !== parsed) return { kind: 'json', text }
    return { kind: 'json', text: JSON.stringify(parsed, null, 2) }
  }
  return { kind: 'text', text: detail }
}

/** Bash 回复字数：stdout+stderr；其它工具用 detail 全文。折叠时也能看它是否在涨。 */
export function toolOutputChars(detail: string | undefined, kind?: ParsedToolCall['kind']): number {
  if (!detail) return 0
  const formatted = formatToolDetail(detail, kind)
  if (formatted?.kind === 'bash') return formatted.stdout.length + formatted.stderr.length
  return detail.length
}

export function prettyJsonString(raw: string): string {
  const parsed = parseJsonValue(raw)
  if (parsed === undefined) return raw
  try {
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

export function parseToolCall(name: string, argumentsJson: string): ParsedToolCall {
  const args = parseJsonObject(argumentsJson)
  const field = (key: string) => argString(args, argumentsJson, key)

  if (name === 'bash' || name === 'shell' || name === 'run_terminal_cmd') {
    const command = field('command') ?? field('cmd') ?? argumentsJson.trim()
    return { kind: 'bash', command }
  }

  if (name === 'str_replace_editor' || name === 'StrReplace' || name === 'str_replace') {
    const command = field('command') ?? (name === 'str_replace' || name === 'StrReplace' ? 'str_replace' : undefined)
    const path = field('path') ?? field('file_path') ?? 'unknown'
    if (command === 'str_replace' || (!command && field('old_str') != null)) {
      return {
        kind: 'str_replace',
        path,
        oldStr: field('old_str') ?? field('old_string') ?? '',
        newStr: field('new_str') ?? field('new_string') ?? '',
      }
    }
    if (command === 'create') {
      return { kind: 'create', path, fileText: field('file_text') ?? '' }
    }
    if (command === 'insert') {
      return {
        kind: 'insert',
        path,
        insertLine: asInt(args?.insert_line) ?? asInt(extractPartialJsonString(argumentsJson, 'insert_line')) ?? 0,
        newStr: field('new_str') ?? '',
      }
    }
    if (command === 'view') {
      const range = Array.isArray(args?.view_range) ? args.view_range : undefined
      const start = range ? asInt(range[0]) : undefined
      const end = range && range.length > 1 ? asInt(range[1]) : start
      return {
        kind: 'view',
        path,
        viewRange: start != null && end != null ? [start, end] : undefined,
      }
    }
  }

  if (name === 'fs_write' || name === 'Write') {
    const path = field('path') ?? field('file_path') ?? 'unknown'
    const fileText = field('contents') ?? field('content') ?? field('file_text') ?? ''
    return { kind: 'create', path, fileText }
  }

  if (name === 'mcp_call' || name === 'execute_tools') {
    const gateway = asString(args?.name) ?? asString(args?.tool_name) ?? name
    const inner = asRecord(args?.arguments)
    const nested = asString(inner?.tool_name) ?? asString(inner?.name)
    const tool =
      nested && (gateway === 'execute_tools' || gateway === 'mcp_call' || name === 'execute_tools')
        ? nested
        : gateway
    return {
      kind: 'mcp',
      server: asString(args?.server) ?? '',
      tool,
      raw: argumentsJson,
    }
  }

  return { kind: 'raw', label: name, raw: argumentsJson }
}

function clip(text: string, max = 72): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

function recordLabel(value: Record<string, unknown>): string | undefined {
  for (const key of ['title', 'name', 'label', 'path', 'query', 'command', 'id']) {
    const text = asString(value[key])?.trim()
    if (text) return text
  }
  return undefined
}

function summarizeList(items: unknown[]): string {
  const labels = items
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? recordLabel(item as Record<string, unknown>) : typeof item === 'string' ? item : undefined))
    .filter((item): item is string => Boolean(item))
  const head = labels[0]
  if (!items.length) return '空列表'
  if (items.length === 1) return clip(head || '1 条')
  return clip(head ? `${items.length} 条 · ${head}` : `${items.length} 条`)
}

function summarizeRecord(value: Record<string, unknown>): string {
  for (const key of ['items', 'tasks', 'views', 'records', 'rows', 'results', 'sources', 'data', 'list']) {
    const nested = value[key]
    if (Array.isArray(nested)) return summarizeList(nested)
  }
  const parts: string[] = []
  for (const key of Object.keys(value)) {
    if (parts.length >= 3) break
    const nested = value[key]
    if (nested == null || nested === '') continue
    if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
      parts.push(`${key} ${nested}`)
      continue
    }
    if (Array.isArray(nested)) {
      parts.push(summarizeList(nested))
      continue
    }
    if (typeof nested === 'object') {
      const label = recordLabel(nested as Record<string, unknown>)
      if (label) parts.push(label)
    }
  }
  return parts.length ? clip(parts.join(' · ')) : ''
}

/** 把 JSON 参数/结果收成一行可读摘要，避免把花括号铺在标题旁。 */
export function compactJsonSummary(raw: string): string {
  const parsed = parseJsonValue(raw.trim())
  if (parsed === undefined) return clip(raw)
  if (Array.isArray(parsed)) return summarizeList(parsed)
  if (parsed && typeof parsed === 'object') return summarizeRecord(parsed as Record<string, unknown>)
  return clip(String(parsed))
}

export function toolSummary(parsed: ParsedToolCall, fallback: string): string {
  switch (parsed.kind) {
    case 'str_replace':
      return `Edited ${parsed.path}`
    case 'create':
      return `Created ${parsed.path}`
    case 'insert':
      return `Inserted @${parsed.insertLine} · ${parsed.path}`
    case 'view':
      return parsed.viewRange
        ? `View ${parsed.path}:${parsed.viewRange[0]}-${parsed.viewRange[1]}`
        : `View ${parsed.path}`
    case 'bash': {
      const one = parsed.command.replace(/\s+/g, ' ').trim()
      return one.length > 72 ? `${one.slice(0, 72)}…` : one || compactJsonSummary(fallback)
    }
    case 'mcp': {
      const args = parseJsonObject(parsed.raw)
      const gatewayArgs = asRecord(args?.arguments)
      const leaf = gatewayArgs?.arguments ?? args?.arguments
      const inner = leaf != null ? JSON.stringify(leaf) : fallback
      return compactJsonSummary(inner) || parsed.tool
    }
    case 'raw':
      return compactJsonSummary(fallback) || '…'
  }
}

export function toolTitle(parsed: ParsedToolCall, name: string): string {
  switch (parsed.kind) {
    case 'str_replace':
      return 'Edit'
    case 'create':
      return 'Create'
    case 'insert':
      return 'Insert'
    case 'view':
      return 'View'
    case 'bash':
      return 'Bash'
    case 'mcp':
      return parsed.tool
    case 'raw':
      return name
  }
}

export function shouldAutoOpenTool(parsed: ParsedToolCall, detail?: string): boolean {
  if (parsed.kind === 'str_replace' || parsed.kind === 'create' || parsed.kind === 'insert') return true
  if (!detail) return false
  const formatted = formatToolDetail(detail, parsed.kind)
  if (formatted?.kind === 'chart') return true
  if (formatted?.kind === 'bash' && formatted.artifacts?.length) return true
  try {
    const obj = JSON.parse(detail) as { artifacts?: unknown }
    return Array.isArray(obj.artifacts) && obj.artifacts.length > 0
  } catch {
    return false
  }
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'add') added += 1
    else if (line.type === 'remove') removed += 1
  }
  return { added, removed }
}
