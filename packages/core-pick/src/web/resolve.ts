import type { PickRef } from './types.ts'
import { pickIdFromText, pickPreview, withHostSource, withPickLocus } from './types.ts'
import { editorHostFromNode } from './editor-host.ts'

const KIND = 'data-biu-kind'
const ID = 'data-biu-id'
const ACTION = 'data-biu-action'
const LABEL = 'data-biu-label'
const PLUGIN = 'data-biu-plugin'

type ClientBox = { left: number; top: number; width: number; height: number }

function isPickIgnored(node: Element | null) {
  return Boolean(node?.closest('[data-biu-ignore]'))
}

function inHiddenPane(node: Element | null) {
  return Boolean(
    node?.closest(
      '.inspector-stage-pane:not(.is-active), .app-stage-pane:not(.is-active), .session-inspector.is-closed, .app-side-bar.is-closed',
    ),
  )
}

function isOpenPickSurface(node: HTMLElement | null): node is HTMLElement {
  return Boolean(node && !node.classList.contains('is-closed'))
}

/** 点落在哪一栏：检查器 / 侧栏 / 中间台。框选和点选都不跨栏。 */
export function pickSurfaceFromNode(node: Element | null): HTMLElement | null {
  if (!node) return null
  return node.closest('[data-testid="session-inspector"], .session-inspector, .app-side-bar')
}

function pointInBox(box: ClientBox, x: number, y: number) {
  return x >= box.left && y >= box.top && x <= box.left + box.width && y <= box.top + box.height
}

function read(el: Element, attr: string) {
  const value = el.getAttribute(attr)
  return value && value.trim() ? value.trim() : undefined
}

/** 从命中节点向上合并 data-biu-*，子覆盖父；必须同时有 kind 与 id。 */
export function resolvePickFromNode(
  start: Element | null,
  route: string,
  surface: Element | null = null,
): { el: HTMLElement; ref: PickRef } | null {
  if (!start || isPickIgnored(start) || inHiddenPane(start)) return null
  if (surface && !surface.contains(start)) return null
  let kind: string | undefined
  let id: string | undefined
  let action: string | undefined
  let label: string | undefined
  let plugin: string | undefined
  let highlight: HTMLElement | null = null
  let node: Element | null = start
  while (node && node !== document.documentElement) {
    if (surface && !surface.contains(node)) break
    if (node instanceof HTMLElement) {
      const nextKind = read(node, KIND)
      const nextId = read(node, ID)
      const nextAction = read(node, ACTION)
      const nextLabel = read(node, LABEL)
      const nextPlugin = read(node, PLUGIN) || read(node, 'data-page-block-plugin') || read(node, 'data-plugin-id')
      if (!highlight && (nextKind || nextId || nextAction || nextLabel || nextPlugin)) highlight = node
      if (!kind) kind = nextKind
      if (!id) id = nextId
      if (!action) action = nextAction
      if (!label) label = nextLabel
      if (!plugin) plugin = nextPlugin
    }
    if (kind && id && highlight) break
    node = node.parentElement
  }
  if (!plugin) {
    const host = start.closest('[data-biu-plugin], [data-page-block-plugin], [data-plugin-id]')
    plugin =
      (host instanceof Element ? read(host, PLUGIN) || read(host, 'data-page-block-plugin') || read(host, 'data-plugin-id') : undefined)
  }
  if (!kind || !id || !highlight) return editorBlockPick(start, route, surface)
  return {
    el: highlight,
    ref: withEditorPickContext(
      {
        kind,
        id,
        ...(action ? { action } : {}),
        ...(plugin ? { plugin } : {}),
        label: label || id,
        title: label || id,
        route,
      },
      highlight,
      start,
    ),
  }
}

const HTML_BLOCK_SEL = '[data-page-block="html"], [data-page-block="htmlframe"]'
const ELEMENT_HTML_CAP = 2000

function stripPickMarks(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll('[data-html-pick], [data-biu-kind], [data-biu-id]')]
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    node.removeAttribute('data-html-pick')
    node.removeAttribute('data-biu-kind')
    node.removeAttribute('data-biu-id')
    node.removeAttribute('data-biu-label')
    node.removeAttribute('data-biu-plugin')
  }
}

/** 被点中的内部节点 HTML，去掉 pick 戳，方便 agent 在围栏里对这一段做替换。 */
export function serializeHtmlPickElement(el: HTMLElement) {
  const clone = el.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return ''
  stripPickMarks(clone)
  const html = clone.outerHTML.replace(/\s+/g, ' ').trim()
  if (!html) return ''
  return html.length > ELEMENT_HTML_CAP ? `${html.slice(0, ELEMENT_HTML_CAP)}…` : html
}

function htmlBlockFrom(node: Element | null) {
  return node?.closest(HTML_BLOCK_SEL) ?? null
}

function innermostHtmlTarget(start: Element, highlight: HTMLElement) {
  const block = htmlBlockFrom(start) || htmlBlockFrom(highlight)
  let stamped: HTMLElement | null = null
  let node: Element | null = start
  const stop = block ?? highlight
  while (node && node !== stop && stop.contains(node)) {
    if (node instanceof HTMLElement && (node.getAttribute('data-biu-kind') === 'html' || node.hasAttribute('data-html-pick'))) {
      stamped = node
      break
    }
    node = node.parentElement
  }
  if (stamped) return stamped
  if (highlight.getAttribute('data-biu-kind') === 'html' || highlight.hasAttribute('data-html-pick')) return highlight
  if (block && start instanceof HTMLElement && block.contains(start) && start !== block) return start
  return null
}

function withHtmlElement(ref: PickRef, start: Element, highlight: HTMLElement): PickRef {
  const target = innermostHtmlTarget(start, highlight)
  if (!target) return ref
  const element = serializeHtmlPickElement(target)
  return element ? { ...ref, element } : ref
}

/** 带 data-biu 的命中也挂上页面 path / markdown 行，和点选 block 一样；id 仍用节点自己的。 */
function withEditorPickContext(ref: PickRef, el: HTMLElement, start: Element = el): PickRef {
  const sourced = withHtmlElement(withHostSource(ref, el), start, el)
  const locus = editorLocusFromNode(el)
  const next = locus ? { ...withPickLocus(sourced, locus), id: ref.id, ...(sourced.element ? { element: sourced.element } : {}) } : sourced
  if (ref.kind !== 'html' || next.selection) return next
  const snippet = pickPreview(el.textContent ?? '', 120)
  return snippet ? { ...next, selection: snippet } : next
}

function editorLocusFromNode(el: HTMLElement) {
  const host = editorHostFromNode(el)
  if (!host) return null
  const direct = host.locusFromElement(el)
  if (direct) return direct
  const block = el.closest('[data-page-block], .page-block')
  if (block instanceof Element && block !== el) return host.locusFromElement(block)
  return null
}

const EDITOR_ROOT = '.tiptap, [data-testid="page-editor"]'

function isEditorBlockEl(el: HTMLElement) {
  if (el.classList.contains('page-block') || el.hasAttribute('data-page-block')) return true
  if (el.getAttribute('data-type') === 'block-math') return true
  return /^(P|H1|H2|H3|LI|BLOCKQUOTE|PRE|HR|IMG|TABLE)$/.test(el.tagName)
}

/** 编辑器顶层块：列表项、引用、插件块、段落/标题。 */
export function editorBlockElFromNode(start: Element | null): HTMLElement | null {
  const root = start?.closest(EDITOR_ROOT)
  if (!root || !(start instanceof Element)) return null
  let found: HTMLElement | null = null
  let el: Element | null = start
  while (el && el !== root) {
    if (el instanceof HTMLElement && isEditorBlockEl(el)) found = el
    el = el.parentElement
  }
  return found
}

function editorBlockPick(
  start: Element | null,
  route: string,
  surface: Element | null,
): { el: HTMLElement; ref: PickRef } | null {
  const el = editorBlockElFromNode(start)
  if (!el || isPickIgnored(el) || inHiddenPane(el)) return null
  if (surface && !surface.contains(el)) return null
  const taggedKind = read(el, KIND)
  const taggedId = read(el, ID)
  const taggedPlugin = read(el, PLUGIN) || read(el, 'data-page-block-plugin') || read(el, 'data-plugin-id')
  if (taggedKind && taggedId) {
    return {
      el,
      ref: withEditorPickContext(
        {
          kind: taggedKind,
          id: taggedId,
          ...(read(el, ACTION) ? { action: read(el, ACTION) } : {}),
          ...(taggedPlugin ? { plugin: taggedPlugin } : {}),
          label: read(el, LABEL) || taggedId,
          route,
        },
        el,
        start instanceof Element ? start : el,
      ),
    }
  }
  const tag = (el.getAttribute('data-page-block') || el.tagName).toLowerCase()
  const text = pickPreview(el.textContent ?? '', 80)
  const hostPlugin = read(el, 'data-page-block-plugin') || taggedPlugin
  return {
    el,
    ref: withPickLocus(
      withHostSource(
        {
          kind: 'block',
          id: `${tag}:${pickIdFromText(text || tag)}`,
          ...(hostPlugin ? { plugin: hostPlugin } : {}),
          label: text || tag,
          route,
        },
        el,
      ),
      editorHostFromNode(el)?.locusFromElement(el) ?? null,
    ),
  }
}

function unignoredAncestor(node: Element, surface: Element | null) {
  let current: Element | null = node
  while (current && isPickIgnored(current)) current = current.parentElement
  if (!current || inHiddenPane(current)) return null
  if (surface && !surface.contains(current)) return null
  return current
}

/** 指针所在栏：检查器或侧栏。中间栏溢出盒可以盖住检查器坐标，不能靠命中栈单独判断。 */
export function pickSurfaceAtPoint(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof Element)) continue
    const surface = pickSurfaceFromNode(el)
    if (isOpenPickSurface(surface)) return surface
  }
  for (const el of document.querySelectorAll('[data-testid="session-inspector"], .session-inspector, .app-side-bar')) {
    if (!(el instanceof HTMLElement) || !isOpenPickSurface(el)) continue
    if (pointInBox(boxOf(el), x, y)) return el
  }
  return null
}

export function resolvePickAtPoint(x: number, y: number, route: string) {
  const stacked = document.elementsFromPoint(x, y)
  if (stacked.some((el) => el instanceof Element && el.closest('[data-testid="chat-overlay-panel"]'))) return null
  const surface = pickSurfaceAtPoint(x, y)
  const pool = surface
    ? stacked.filter((el): el is Element => el instanceof Element && surface.contains(el))
    : stacked.filter((el): el is Element => el instanceof Element && !pickSurfaceFromNode(el))
  for (const el of pool) {
    if (inHiddenPane(el)) continue
    const start = unignoredAncestor(el, surface)
    if (!start) continue
    const hit = resolvePickFromNode(start, route, surface)
    if (!hit) continue
    const vis = visiblePickBox(hit.el)
    if (!vis || !pointInBox(vis, x, y)) continue
    return hit
  }
  return null
}

export function boxFromPoints(ax: number, ay: number, bx: number, by: number): ClientBox {
  const left = Math.min(ax, bx)
  const top = Math.min(ay, by)
  return { left, top, width: Math.abs(bx - ax), height: Math.abs(by - ay) }
}

function boxesOverlap(a: ClientBox, b: ClientBox) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
}

function boxOf(el: Element): ClientBox {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function intersectBoxes(a: ClientBox, b: ClientBox): ClientBox | null {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const width = Math.min(a.left + a.width, b.left + b.width) - left
  const height = Math.min(a.top + a.height, b.top + b.height) - top
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}

function axisClips(computed: string, inline: string) {
  const value = computed && computed !== 'visible' ? computed : inline
  return Boolean(value && value !== 'visible')
}

function clipsOverflow(node: HTMLElement) {
  const style = getComputedStyle(node)
  return (
    axisClips(style.overflowX, node.style.overflowX || node.style.overflow) ||
    axisClips(style.overflowY, node.style.overflowY || node.style.overflow)
  )
}

/** 框选只看露在本栏里的那一块。宽表格行的布局盒会伸进检查器，不能拿来当命中。 */
export function visiblePickBox(el: Element): ClientBox | null {
  let box: ClientBox | null = boxOf(el)
  let node: Element | null = el.parentElement
  while (box && node && node !== document.documentElement) {
    if (node instanceof HTMLElement && clipsOverflow(node)) {
      box = intersectBoxes(box, boxOf(node))
    }
    node = node.parentElement
  }
  return box
}

export const EDITOR_BLOCK_SEL =
  '.tiptap > p, .tiptap > h1, .tiptap > h2, .tiptap > h3, .tiptap > blockquote, .tiptap > pre, .tiptap > hr, .tiptap > img, .tiptap img, .tiptap table, .tiptap [data-type="block-math"], .tiptap .page-block, .tiptap [data-page-block], .tiptap li'

/**
 * 框选：命中所有带 kind+id 的对象节点，以及编辑器里的段落/标题/列表/插件块。
 */
export function resolvePicksInRect(box: ClientBox, route: string, root: ParentNode = document) {
  const nodes = root.querySelectorAll(`[data-biu-kind][data-biu-id], ${EDITOR_BLOCK_SEL}`)
  const seen = new Set<string>()
  const hits: { el: HTMLElement; ref: PickRef }[] = []
  for (const node of Array.from(nodes)) {
    if (!(node instanceof HTMLElement) || isPickIgnored(node) || inHiddenPane(node)) continue
    const vis = visiblePickBox(node)
    if (!vis || !boxesOverlap(box, vis)) continue
    const hit = resolvePickFromNode(node, route)
    if (!hit) continue
    const key = `${hit.ref.kind}:${hit.ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push(hit)
  }
  return hits
}
