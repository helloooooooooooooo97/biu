import { editorHostFromNode } from './editor-host.ts'

export type PickRef = {
  kind: string
  id: string
  action?: string
  label: string
  route: string
  /** 页面 / 记录 / Tab 标题，给 agent 认对象。 */
  title?: string
  /** db_content 路径，如 /pages/p002。 */
  path?: string
  /** Markdown 源码行号（1-based），不是可视编辑器行。 */
  start_line?: number
  end_line?: number
  /** 对应源码整行。 */
  text?: string
  /** 用户高亮的片段。 */
  selection?: string
  /** 无选区时：当前 markdown 行里插入点（0-based，插在 text[insert] 之前）。 */
  insert?: number
  /** 登记这块 UI 的插件 id，改呈现/卡片时对着它 sandbox。 */
  plugin?: string
  /** HTML 块内被点中的节点 outerHTML（已去掉 pick 戳），text 仍是整块围栏。 */
  element?: string
}

export function pickKey(ref: PickRef) {
  return `${ref.kind}:${ref.id}:${ref.action ?? ''}`
}

function objectKey(ref: PickRef) {
  return `${ref.kind}:${ref.id}`
}

/** 同一 kind+id 只保留一条；后写覆盖，并保留已有 action/label。 */
export function dedupePicks(refs: PickRef[]): PickRef[] {
  const map = new Map<string, PickRef>()
  for (const ref of refs) {
    const key = objectKey(ref)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, ref)
      continue
    }
    map.set(key, {
      kind: ref.kind,
      id: ref.id,
      label: ref.label || prev.label,
      title: ref.title || prev.title,
      route: ref.route || prev.route,
      ...(ref.action || prev.action ? { action: ref.action || prev.action } : {}),
      ...(ref.plugin || prev.plugin ? { plugin: ref.plugin || prev.plugin } : {}),
      ...locusFields(ref.start_line != null ? ref : prev),
      ...sourceFields(ref.path ? ref : prev),
      ...(ref.element || prev.element ? { element: ref.element || prev.element } : {}),
    })
  }
  return [...map.values()]
}

export function formatPicks(refs: PickRef[]) {
  return dedupePicks(refs)
    .map((ref) => `<pick>${encodePickJson(pickPayload(ref))}</pick>`)
    .join('\n')
}

function pickPayload(ref: PickRef) {
  const data: Record<string, unknown> = { kind: ref.kind, id: ref.id }
  if (ref.action) data.action = ref.action
  if (ref.route) data.route = ref.route
  if (ref.title) data.title = ref.title
  if (ref.kind !== 'text' && ref.label) data.label = ref.label
  if (ref.path) data.path = ref.path
  if (ref.plugin) data.plugin = ref.plugin
  if (ref.start_line != null) data.start_line = ref.start_line
  if (ref.end_line != null) data.end_line = ref.end_line
  if (ref.text) data.text = ref.text
  if (ref.selection) data.selection = ref.selection
  else if (ref.insert != null) data.insert = ref.insert
  if (ref.element) data.element = ref.element
  return data
}

function encodePickJson(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const PICK_ANY = /<pick>([\s\S]*?)<\/pick>|<pick\b((?:[^>"']|"[^"]*"|'[^']*')*)\s*\/?>/gi
const ATTR = /(\w+)="([^"]*)"/g

function unescapeAttr(value: string) {
  return value
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function parsePickAttrs(raw: string): PickRef | null {
  const attrs: Record<string, string> = {}
  ATTR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR.exec(raw))) {
    attrs[match[1]] = unescapeAttr(match[2])
  }
  const kind = attrs.kind?.trim()
  const id = attrs.id?.trim()
  if (!kind || !id) return null
  const start = Number(attrs.start_line)
  const end = Number(attrs.end_line)
  const text = attrs.text?.trim() ?? ''
  const selection = attrs.selection?.trim() ?? ''
  const insert = Number(attrs.insert)
  return {
    kind,
    id,
    ...(attrs.action?.trim() ? { action: attrs.action.trim() } : {}),
    label: attrs.label?.trim() || (kind === 'text' ? selection || text : '') || (Number.isInteger(Number(attrs.start_line)) ? `L${attrs.start_line}` : '') || id,
    route: attrs.route?.trim() || '',
    ...(attrs.title?.trim() ? { title: attrs.title.trim() } : {}),
    ...(attrs.plugin?.trim() ? { plugin: attrs.plugin.trim() } : {}),
    ...sourceFields({ path: attrs.path?.trim() }),
    ...locusFields({
      start_line: Number.isInteger(start) && start >= 1 ? start : undefined,
      end_line: Number.isInteger(end) && end >= 1 ? end : undefined,
      text: text || undefined,
      selection: selection || undefined,
      insert: !selection && Number.isInteger(insert) && insert >= 0 ? insert : undefined,
    }),
    ...(attrs.element?.trim() ? { element: attrs.element.trim() } : {}),
  }
}

function sourceFields(ref: { path?: string; title?: string }) {
  const path = ref.path?.trim()
  const title = ref.title?.trim()
  return {
    ...(path ? { path } : {}),
    ...(title ? { title } : {}),
  }
}

function locusFields(ref: { start_line?: number; end_line?: number; text?: string; selection?: string; insert?: number }) {
  const start = ref.start_line
  const end = ref.end_line
  const text = ref.text?.trim()
  const selection = ref.selection?.trim()
  const insert = ref.insert
  return {
    ...(start != null ? { start_line: start } : {}),
    ...(end != null ? { end_line: end } : {}),
    ...(text ? { text } : {}),
    ...(selection ? { selection } : {}),
    ...(!selection && insert != null ? { insert } : {}),
  }
}

function parsePickToken(jsonBody: string | undefined, attrBody: string | undefined): PickRef | null {
  if (jsonBody != null && jsonBody !== '') {
    try {
      const data = JSON.parse(jsonBody) as Record<string, unknown>
      return pickRefFromAttrs(data)
    } catch {
      return null
    }
  }
  if (attrBody != null) return parsePickAttrs(attrBody)
  return null
}

export function formatPick(ref: PickRef) {
  return formatPicks([ref])
}

/** 按原文顺序拆成文字段和 pick 块，供输入框混排还原。 */
export function splitPickStream(text: string): Array<{ type: 'text'; value: string } | { type: 'pick'; ref: PickRef }> {
  const parts: Array<{ type: 'text'; value: string } | { type: 'pick'; ref: PickRef }> = []
  PICK_ANY.lastIndex = 0
  let last = 0
  let match: RegExpExecArray | null
  while ((match = PICK_ANY.exec(text))) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    const ref = parsePickToken(match[1], match[2])
    if (ref) parts.push({ type: 'pick', ref })
    else parts.push({ type: 'text', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}
export function parsePicks(text: string): { refs: PickRef[]; rest: string } {
  const refs: PickRef[] = []
  PICK_ANY.lastIndex = 0
  const rest = text
    .replace(PICK_ANY, (all, jsonBody: string | undefined, attrBody: string | undefined) => {
      const ref = parsePickToken(jsonBody, attrBody)
      if (ref) refs.push(ref)
      return '\n'
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { refs: dedupePicks(refs), rest }
}

export function lineSpanLabel(ref: PickRef) {
  if (ref.start_line == null) return ''
  if (ref.end_line != null && ref.end_line !== ref.start_line) return `${ref.start_line}-${ref.end_line}`
  return String(ref.start_line)
}

/** 有源码行号用行号；纯文本选区/长粘贴用字数。 */
export function chipSpanLabel(ref: PickRef) {
  const lines = lineSpanLabel(ref)
  if (lines) return lines
  if (ref.kind !== 'text') return ''
  const n = (ref.selection || ref.text || '').length
  return n > 0 ? String(n) : ''
}

function pickChipName(ref: PickRef) {
  if (ref.kind === 'html' && ref.label?.trim()) return ref.label.trim()
  if (ref.title?.trim()) return ref.title.trim()
  const file = ref.path?.split('/').filter(Boolean).pop() ?? ''
  if (file.includes('.')) return file
  if (ref.kind === 'text') {
    return pickPreview(ref.selection || ref.text || ref.label, 24) || file || '选区'
  }
  return ref.label || file || ref.id
}

export function chipCaption(ref: PickRef) {
  if (ref.action === 'banner') return { name: ref.label || '背景', span: '' }
  if (ref.action === 'view') return { name: ref.label || '呈现方式', span: '' }
  return { name: ref.action ? `${ref.label} · ${ref.action}` : pickChipName(ref), span: chipSpanLabel(ref) }
}

export function chipLabel(ref: PickRef) {
  const { name, span } = chipCaption(ref)
  return span ? `${name} (${span})` : name
}

export function pickPreview(text: string, max = 48) {
  const value = text.replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function pickIdFromText(raw: string) {
  let hash = 0
  const key = raw.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

export function withPickLocus(ref: PickRef, locus: { start_line: number; end_line: number; text: string; selection?: string; insert?: number } | null | undefined): PickRef {
  if (!locus) return ref
  return {
    ...ref,
    id: pickIdFromText(`${locus.start_line}:${locus.end_line}:${locus.selection || locus.text || ''}:${locus.insert ?? ''}`),
    ...sourceFields(ref),
    ...locusFields({
      ...locus,
      selection: locus.selection || ref.selection,
    }),
  }
}

export function withHostSource(ref: PickRef, node: Node | null): PickRef {
  const host = editorHostFromNode(node)
  return {
    ...ref,
    ...sourceFields({ path: host?.path || ref.path, title: host?.title || ref.title }),
  }
}

export function textPickFromPlain(route: string, raw: string): PickRef | null {
  const selection = raw.trim()
  const label = pickPreview(selection, 80)
  if (!label) return null
  return { kind: 'text', id: pickIdFromText(raw), label, route, selection }
}

/** 选取态下划到的一段正文；空选区返回 null。编辑器选区附带 Markdown 源码行号。 */
export function textPickFromSelection(
  route: string,
  selection: Pick<Selection, 'isCollapsed' | 'toString' | 'rangeCount'> | null = typeof window === 'undefined' ? null : window.getSelection(),
): PickRef | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const raw = selection.toString()
  const base = textPickFromPlain(route, raw)
  if (!base) return null
  const anchor = 'anchorNode' in selection ? (selection as Selection).anchorNode : null
  const host = editorHostFromNode(anchor)
  const locus = host ? host.locusFromSelection() : null
  return withPickLocus(withHostSource(base, anchor), locus)
}

export function pickChipAttrs(ref: PickRef) {
  return {
    kind: ref.kind,
    id: ref.id,
    label: ref.label,
    route: ref.route,
    action: ref.action ?? null,
    path: ref.path ?? null,
    plugin: ref.plugin ?? null,
    title: ref.title ?? null,
    start_line: ref.start_line ?? null,
    end_line: ref.end_line ?? null,
    text: ref.text ?? null,
    selection: ref.selection ?? null,
    insert: ref.insert ?? null,
    element: ref.element ?? null,
  }
}

export function pickRefFromAttrs(attrs: Record<string, unknown>): PickRef | null {
  const kind = String(attrs.kind ?? '').trim()
  const id = String(attrs.id ?? '').trim()
  if (!kind || !id) return null
  const action = String(attrs.action ?? '').trim()
  const path = String(attrs.path ?? '').trim()
  const start = Number(attrs.start_line)
  const end = Number(attrs.end_line)
  const text = typeof attrs.text === 'string' ? attrs.text.trim() : ''
  const selection = typeof attrs.selection === 'string' ? attrs.selection.trim() : ''
  const insert = Number(attrs.insert)
  return {
    kind,
    id,
    label: String(attrs.label ?? '').trim() || (kind === 'text' ? selection || text : '') || id,
    route: String(attrs.route ?? ''),
    ...(action ? { action } : {}),
    ...sourceFields({ path, title: String(attrs.title ?? '').trim() }),
    ...(String(attrs.plugin ?? '').trim() ? { plugin: String(attrs.plugin).trim() } : {}),
    ...locusFields({
      start_line: Number.isInteger(start) && start >= 1 ? start : undefined,
      end_line: Number.isInteger(end) && end >= 1 ? end : undefined,
      text: text || undefined,
      selection: selection || undefined,
      insert: !selection && Number.isInteger(insert) && insert >= 0 ? insert : undefined,
    }),
    ...(typeof attrs.element === 'string' && attrs.element.trim() ? { element: attrs.element.trim() } : {}),
  }
}

export function pickDomAttrs(kind: string, id: string, label?: string, plugin?: string) {
  return {
    'data-biu-kind': kind,
    'data-biu-id': id,
    ...(label ? { 'data-biu-label': label } : {}),
    ...(plugin ? { 'data-biu-plugin': plugin } : {}),
  }
}
