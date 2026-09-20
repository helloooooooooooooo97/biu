export type TocHeading = {
  id: string
  text: string
  level: 1 | 2 | 3
}

const SKIP = ['.fsdb-detail-title', '.fsdb-detail-extra-title']

function asLevel(n: number): 1 | 2 | 3 {
  if (n === 1) return 1
  if (n === 2) return 2
  return 3
}

function headingElements(root: ParentNode, skipHost?: Element | null): HTMLElement[] {
  return [...root.querySelectorAll('h1, h2, h3')].filter((el) => {
    if (!(el instanceof HTMLElement)) return false
    if (SKIP.some((sel) => el.closest(sel))) return false
    if (skipHost && (el === skipHost || skipHost.contains(el))) return false
    return true
  }) as HTMLElement[]
}

function itemFromEl(el: HTMLElement, index: number): TocHeading | null {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { id: `heading-${index}`, text, level: asLevel(Number(el.tagName.slice(1))) }
}

/** 从目录块宿主找到当前页面正文根。没有页面 DOM 时返回 null。 */
export function pageRootFrom(host: Element | null): ParentNode | null {
  if (!host) return null
  const main = host.closest('.fsdb-detail-main')
  if (main) return main
  const editor = host.closest('.page-editor')
  if (editor) return editor.querySelector('.tiptap') ?? editor
  const doc = host.ownerDocument
  if (!doc) return null
  return doc.querySelector('.fsdb-detail-main, .page-editor .tiptap, .page-editor')
}

export function headingsFromPage(root: ParentNode, skipHost?: Element | null): TocHeading[] {
  const items: TocHeading[] = []
  for (const el of headingElements(root, skipHost)) {
    const item = itemFromEl(el, items.length)
    if (item) items.push(item)
  }
  return items
}

export function headingElById(root: ParentNode, id: string, skipHost?: Element | null): HTMLElement | null {
  const items: TocHeading[] = []
  for (const el of headingElements(root, skipHost)) {
    const item = itemFromEl(el, items.length)
    if (!item) continue
    if (item.id === id) return el
    items.push(item)
  }
  return null
}

export function sameTocItems(a: TocHeading[], b: TocHeading[]) {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return other && item.id === other.id && item.text === other.text && item.level === other.level
    })
  )
}
