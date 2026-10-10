export const HTML_DECK_SEL = '[data-page-block="html"], [data-page-block="htmlframe"]'

export type HtmlSlide = {
  kind: 'html' | 'htmlframe'
  html: string
  width?: number | string
  height?: number | string
  /** 默认 true；false 时不进放映。 */
  deck?: boolean
}

export function cssBoxSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${Math.round(value)}px`
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

/** 海报式 HTML：根节点 height:100% + overflow:hidden，子级全 absolute，百分比高度相对 auto 父级为 0。 */
export const HTML_FILL_HOST_PX = 280

export function htmlLooksFillLayout(html: string) {
  const head = html.trim().slice(0, 1600)
  const pct = /\bheight\s*:\s*100%\b/i.test(head) || /\bheight\s*:\s*100vh\b/i.test(head)
  const clipped = /\boverflow\s*:\s*hidden\b/i.test(head)
  const abs = (html.match(/\bposition\s*:\s*absolute\b/gi) ?? []).length >= 3
  return (pct && clipped) || (pct && abs) || (clipped && abs)
}

export function htmlDeckEnabled(deck: unknown) {
  return deck !== false
}

const bound = new WeakMap<Element, HtmlSlide>()

export function bindHtmlSlide(host: Element | null, slide: HtmlSlide | null) {
  if (!host) return
  if (slide) bound.set(host, slide)
  else bound.delete(host)
}

export function collectHtmlSlides(from: Element | null): Array<HtmlSlide & { host: HTMLElement }> {
  const root =
    from?.closest('.tiptap, [data-testid="page-editor"]') ??
    (from?.ownerDocument ?? (typeof document === 'undefined' ? null : document))
  if (!root || !('querySelectorAll' in root)) return []
  const list: Array<HtmlSlide & { host: HTMLElement }> = []
  for (const el of root.querySelectorAll(HTML_DECK_SEL)) {
    if (!(el instanceof HTMLElement)) continue
    const slide = bound.get(el)
    if (!slide || !htmlDeckEnabled(slide.deck)) continue
    list.push({ ...slide, host: el })
  }
  return list
}

export function htmlDeckIndex(slides: Array<{ host: Element }>, host: Element | null) {
  if (!host) return 0
  const at = slides.findIndex((slide) => slide.host === host)
  return at < 0 ? 0 : at
}

export function stepHtmlDeck(index: number, delta: number, length: number) {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

/** 方向键 / Page / Home / End / Esc。空格下一张。 */
export function htmlDeckKeyAction(key: string): 'close' | 'first' | 'last' | -1 | 1 | null {
  if (key === 'Escape') return 'close'
  if (key === 'Home') return 'first'
  if (key === 'End') return 'last'
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') return 1
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') return -1
  return null
}
