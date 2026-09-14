export const DEFAULT_VIEW_WINDOW = 80

export type ContentCommand = 'view' | 'str_replace' | 'replace_lines' | 'insert' | 'write'

export function asContentText(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function resolveContentCommand(args: Record<string, unknown>): ContentCommand {
  const raw = String(args.command ?? '').trim()
  if (raw) {
    if (raw === 'view' || raw === 'str_replace' || raw === 'replace_lines' || raw === 'insert' || raw === 'write') return raw
    throw new Error(`unsupported command: ${raw}`)
  }
  return args.value !== undefined ? 'write' : 'view'
}

export function numberLines(text: string) {
  const lines = text.split('\n')
  const width = String(Math.max(lines.length, 1)).length
  return lines.map((line, index) => `${String(index + 1).padStart(width)}\t${line}`)
}

export function viewContent(text: string, viewRange: unknown) {
  const lines = text.split('\n')
  const total = lines.length
  const numbered = numberLines(text)
  const range = parseViewRange(viewRange, total)
  const truncated = range.start > 1 || range.end < total
  return {
    start: range.start,
    end: range.end,
    total,
    truncated,
    text: numbered.slice(range.start - 1, range.end).join('\n'),
  }
}

function parseViewRange(viewRange: unknown, lineCount: number) {
  if (!Array.isArray(viewRange) || viewRange.length === 0) {
    return { start: 1, end: Math.min(DEFAULT_VIEW_WINDOW, Math.max(lineCount, 1)) }
  }
  const start = Number(viewRange[0])
  const endRaw = viewRange.length > 1 ? Number(viewRange[1]) : start
  if (!Number.isInteger(start) || start < 1) throw new Error('view_range start must be a positive integer')
  const end = endRaw === -1 ? lineCount : endRaw
  if (!Number.isInteger(end) || end < start) throw new Error('invalid view_range')
  return { start, end: Math.min(end, Math.max(lineCount, 1)) }
}

export type ContentLocus = { start_line: number; end_line: number; text?: string }

export function lineAtOffset(text: string, offset: number) {
  if (offset <= 0) return 1
  return text.slice(0, offset).split('\n').length
}

function stripJumpLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

export function withJumpText(next: string, locus: ContentLocus): ContentLocus {
  const lines = next.split('\n')
  const last = Math.max(lines.length, 1)
  const a = Math.min(Math.max(1, locus.start_line), last) - 1
  const b = Math.min(Math.max(a, (locus.end_line ?? locus.start_line) - 1), last - 1)
  const text = lines
    .slice(a, b + 1)
    .map((line) => stripJumpLine(line))
    .filter(Boolean)
    .join('\n')
  return { ...locus, ...(text ? { text } : {}) }
}

export function changedOffsets(before: string, after: string) {
  let i = 0
  const min = Math.min(before.length, after.length)
  while (i < min && before[i] === after[i]) i += 1
  let j = 0
  while (j < min - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j += 1
  return { start: i, end: after.length - j }
}

export function locusFromRange(text: string, start: number, end: number): ContentLocus {
  const from = Math.max(0, start)
  const to = Math.max(from, end)
  return withJumpText(text, {
    start_line: lineAtOffset(text, from),
    end_line: lineAtOffset(text, to > from ? to - 1 : from),
  })
}

export function mutationLocus(
  command: ContentCommand,
  before: string,
  next: string,
  args: Record<string, unknown>,
): ContentLocus | null {
  if (command === 'view') return null
  if (command === 'str_replace') {
    const oldStr = String(args.old_str ?? '')
    const added = typeof args.new_str === 'string' ? args.new_str : ''
    const at = before.indexOf(oldStr)
    if (at < 0) return withJumpText(next, { start_line: 1, end_line: 1 })
    return locusFromRange(next, at, at + added.length)
  }
  if (command === 'insert') {
    const start_line = Number(args.insert_line) + 1
    const added = String(args.new_str ?? '')
    const span = Math.max(1, added.split('\n').length)
    return withJumpText(next, { start_line, end_line: start_line + span - 1 })
  }
  if (command === 'replace_lines') {
    const start_line = Number(args.start_line)
    const added = String(args.new_str ?? '')
    if (!added) return withJumpText(next, { start_line, end_line: start_line })
    return withJumpText(next, { start_line, end_line: start_line + added.split('\n').length - 1 })
  }
  if (command === 'write') {
    const { start, end } = changedOffsets(before, next)
    return locusFromRange(next, start, end)
  }
  return null
}

export function strReplaceText(text: string, oldStr: unknown, newStr: unknown) {
  if (typeof oldStr !== 'string' || !oldStr) throw new Error('old_str is required for str_replace')
  const nextNew = typeof newStr === 'string' ? newStr : ''
  const occurrences = countOccurrences(text, oldStr)
  if (occurrences === 0) throw new Error('old_str not found')
  if (occurrences > 1) throw new Error(`old_str is not unique (${occurrences} matches)`)
  return text.replace(oldStr, nextNew)
}

export function insertText(text: string, insertLine: unknown, newStr: unknown) {
  if (typeof newStr !== 'string') throw new Error('new_str is required for insert')
  const line = Number(insertLine)
  if (!Number.isInteger(line) || line < 0) throw new Error('insert_line must be a non-negative integer')
  const lines = text.split('\n')
  if (line > lines.length) throw new Error(`insert_line ${line} is beyond end of content (${lines.length} lines)`)
  lines.splice(line, 0, newStr)
  return lines.join('\n')
}

export function replaceLinesText(text: string, startLine: unknown, endLine: unknown, newStr: unknown) {
  if (typeof newStr !== 'string') throw new Error('new_str is required for replace_lines')
  const start = Number(startLine)
  const end = Number(endLine)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error('replace_lines needs 1-based start_line and end_line')
  }
  const lines = text.split('\n')
  if (start > lines.length) throw new Error(`start_line ${start} is beyond end of content (${lines.length} lines)`)
  const last = Math.min(end, lines.length)
  const parts = newStr === '' ? [] : newStr.split('\n')
  lines.splice(start - 1, last - start + 1, ...parts)
  return lines.join('\n')
}

function countOccurrences(haystack: string, needle: string) {
  let count = 0
  let from = 0
  while (true) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    count += 1
    from = idx + needle.length
  }
  return count
}

export function writeContentText(value: unknown) {
  if (typeof value !== 'string') throw new Error('write needs string value')
  return value
}
