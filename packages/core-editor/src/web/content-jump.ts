import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { CONTENT_JUMP_EVENT, parseContentJump, type ContentJump } from '@biu/type-file-system'
import { applyAgentEditMark } from './agent-edit-plugin.ts'
import { editorHostIsLive } from './editor-live.ts'
import { scrollOutlineTarget } from '@biu/public-ui'

let pending: ContentJump | null = null
let consumeTimer = 0

function jumpMatchesRecord(jump: ContentJump, recordId: string) {
  const id = String(recordId ?? '').trim()
  const path = String(jump.path ?? '').trim()
  if (!id || !path) return true
  return path === `/${id}` || path.endsWith(`/${id}`)
}

export function rememberContentJump(raw: unknown) {
  const jump = parseContentJump(raw)
  if (!jump) return
  pending = jump
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
}

export function consumeContentJump(recordId: string): ContentJump | null {
  if (!pending) return null
  if (!jumpMatchesRecord(pending, recordId)) return null
  const jump = pending
  pending = null
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
  return jump
}

export function peekContentJump() {
  return pending
}

export function contentJumpForRecord(recordId: string) {
  if (!pending || !jumpMatchesRecord(pending, recordId)) return null
  return pending
}

export function clearContentJump() {
  pending = null
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
}

function jumpHostOk(editor: Editor) {
  const el = editor.view?.dom
  if (!(el instanceof HTMLElement) || !el.isConnected) return true
  return editorHostIsLive(editor)
}

function scheduleConsume(ms = 0) {
  if (typeof window === 'undefined') {
    pending = null
    return
  }
  if (consumeTimer) window.clearTimeout(consumeTimer)
  consumeTimer = window.setTimeout(() => {
    consumeTimer = 0
    pending = null
  }, ms)
}

export function stripMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/`+/g, '')
    .trim()
}

export function snippetAtLine(markdown: string, line: number) {
  const lines = markdown.split('\n')
  const i = Math.min(Math.max(1, line), Math.max(lines.length, 1)) - 1
  for (let k = i; k < lines.length; k++) {
    const text = stripMarkdownLine(lines[k] ?? '')
    if (text) return text
  }
  for (let k = i - 1; k >= 0; k--) {
    const text = stripMarkdownLine(lines[k] ?? '')
    if (text) return text
  }
  return ''
}

export function posAtSnippet(doc: PmNode, snippet: string): number | null {
  const range = posRangeForOverlap(doc, snippet)
  return range?.from ?? null
}

function flattenVisible(doc: PmNode) {
  const chars: Array<{ ch: string; pos: number }> = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (let i = 0; i < node.text.length; i++) {
      const ch = node.text[i]!
      if (/\s/.test(ch)) continue
      chars.push({ ch, pos: pos + i })
    }
  })
  return chars
}

function compactNeedle(raw: string) {
  return raw.replace(/\s+/g, '')
}

/** 新增字符串与编辑器可见文字的重叠：起点到终点之间整段高亮。 */
export function posRangeForOverlap(doc: PmNode, added: string): { from: number; to: number } | null {
  const needle = compactNeedle(added)
  if (!needle) return null
  const chars = flattenVisible(doc)
  if (!chars.length) return null
  const hay = chars.map((item) => item.ch).join('')
  const exact = hay.indexOf(needle)
  if (exact >= 0) {
    const last = chars[exact + needle.length - 1]
    const first = chars[exact]
    if (!first || !last) return null
    return { from: first.pos, to: last.pos + 1 }
  }
  const headLen = Math.min(32, needle.length)
  const tailLen = Math.min(32, needle.length)
  const headAt = hay.indexOf(needle.slice(0, headLen))
  if (headAt < 0) return null
  let tailAt = hay.lastIndexOf(needle.slice(-tailLen))
  if (tailAt < headAt) tailAt = hay.indexOf(needle.slice(-tailLen), headAt)
  const first = chars[headAt]
  const last = chars[tailAt >= headAt ? tailAt + tailLen - 1 : headAt + headLen - 1]
  if (!first || !last || last.pos < first.pos) return null
  return { from: first.pos, to: last.pos + 1 }
}

function jumpNeedle(markdown: string, jump: ContentJump) {
  if (jump.text?.trim()) return jump.text
  const lines = markdown.split('\n')
  const last = Math.max(lines.length, 1)
  const a = Math.min(Math.max(1, jump.start_line), last) - 1
  const b = Math.min(Math.max(a, (jump.end_line ?? jump.start_line) - 1), last - 1)
  return lines
    .slice(a, b + 1)
    .map((line) => stripMarkdownLine(line))
    .filter(Boolean)
    .join('\n')
}

export function tryContentJump(editor: Editor, markdown: string, recordId: string, force = false) {
  if (!pending || editor.isDestroyed) return false
  if (!jumpMatchesRecord(pending, recordId)) return false
  if (!jumpHostOk(editor)) return false
  const needle = jumpNeedle(markdown, pending)
  if (!force && needle && posRangeForOverlap(editor.state.doc, needle) == null) return false
  applyContentJump(editor, markdown, pending, { navigate: pending.navigate === true })
  scheduleConsume(pending.navigate ? 400 : 0)
  return true
}

export function posRangeForJump(doc: PmNode, markdown: string, jump: ContentJump): { from: number; to: number } | null {
  const needle = jumpNeedle(markdown, jump)
  const overlap = posRangeForOverlap(doc, needle)
  if (overlap) return overlap
  const startSnippet = snippetAtLine(markdown, jump.start_line)
  const from = posAtSnippet(doc, startSnippet)
  if (from == null) return null
  return { from, to: Math.min(doc.content.size, from + Math.max(1, compactNeedle(startSnippet).length || 1)) }
}

/** Agent 写正文：只标改动，不 focus、不滚视口。navigate 仅给用户主动跳转。 */
export function applyContentJump(
  editor: Editor,
  markdown: string,
  jump: ContentJump,
  opts?: { navigate?: boolean },
) {
  const range = posRangeForJump(editor.state.doc, markdown, jump)
  applyAgentEditMark(editor, range)
  if (!opts?.navigate) return
  const pos = safeTextPos(editor.state.doc, range?.from ?? 1)
  try {
    editor.chain().focus().setTextSelection(pos).run()
  } catch {
    editor.commands.focus()
  }
  try {
    editor.commands.scrollIntoView()
  } catch {
    /* jsdom 没有 layout */
  }
  scrollCaret(editor, pos)
  applyAgentEditMark(editor, range)
}

function scrollCaret(editor: Editor, pos: number) {
  const mapped = editor.view.domAtPos(pos)
  const node = mapped.node
  const el = node instanceof Element ? node : node.parentElement
  if (!(el instanceof HTMLElement)) return
  const block =
    el.closest('h1, h2, h3, p, li, blockquote, pre, table, .page-block') ?? el
  scrollOutlineTarget(block)
}

function safeTextPos(doc: PmNode, pos: number) {
  const size = doc.content.size
  const clamped = Math.min(Math.max(1, pos), Math.max(1, size))
  try {
    const $pos = doc.resolve(clamped)
    if ($pos.parent.inlineContent) return $pos.pos
  } catch {
    /* fall through */
  }
  let found = 1
  doc.descendants((node, at) => {
    if (node.isTextblock) {
      found = Math.min(at + 1, size)
      return false
    }
  })
  return found
}

if (typeof window !== 'undefined') {
  window.addEventListener(CONTENT_JUMP_EVENT, (event) => {
    rememberContentJump((event as CustomEvent).detail)
  })
}
