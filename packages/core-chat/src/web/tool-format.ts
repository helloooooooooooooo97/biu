export type DiffLine = { type: 'add' | 'remove' | 'equal'; text: string }

export type ParsedToolCall =
  | { kind: 'str_replace'; path: string; oldStr: string; newStr: string }
  | { kind: 'create'; path: string; fileText: string }
  | { kind: 'insert'; path: string; insertLine: number; newStr: string }
  | { kind: 'view'; path: string; viewRange?: [number, number] }
  | { kind: 'bash'; command: string }
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

export type FormattedDetail =
  | { kind: 'bash'; code: number | null; stdout: string; stderr: string; artifacts?: ToolArtifact[] }
  | { kind: 'text'; text: string }
  | { kind: 'json'; text: string }

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

  if (name === 'bash' || name === 'shell' || name === 'run_terminal_cmd') {
    const command = asString(args?.command) ?? asString(args?.cmd) ?? argumentsJson.trim()
    return { kind: 'bash', command }
  }

  if (name === 'str_replace_editor' || name === 'StrReplace' || name === 'str_replace') {
    const command = asString(args?.command) ?? (name === 'str_replace' || name === 'StrReplace' ? 'str_replace' : undefined)
    const path = asString(args?.path) ?? asString(args?.file_path) ?? 'unknown'
    if (command === 'str_replace' || (!command && asString(args?.old_str) != null)) {
      return {
        kind: 'str_replace',
        path,
        oldStr: asString(args?.old_str) ?? asString(args?.old_string) ?? '',
        newStr: asString(args?.new_str) ?? asString(args?.new_string) ?? '',
      }
    }
    if (command === 'create') {
      return { kind: 'create', path, fileText: asString(args?.file_text) ?? '' }
    }
    if (command === 'insert') {
      return {
        kind: 'insert',
        path,
        insertLine: asInt(args?.insert_line) ?? 0,
        newStr: asString(args?.new_str) ?? '',
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
    const path = asString(args?.path) ?? asString(args?.file_path) ?? 'unknown'
    const fileText = asString(args?.contents) ?? asString(args?.content) ?? asString(args?.file_text) ?? ''
    return { kind: 'create', path, fileText }
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
    case 'raw':
      return name
  }
}

export function shouldAutoOpenTool(parsed: ParsedToolCall, detail?: string): boolean {
  if (parsed.kind === 'str_replace' || parsed.kind === 'create' || parsed.kind === 'insert') return true
  if (!detail) return false
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
