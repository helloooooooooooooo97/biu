/**
 * 页面块插件的全屏放大：fixed 覆盖层直接挂在 body，
 * 并临时把沿途祖先的 overflow/包含块限制改写掉（只动内联样式，退出时原样还原）。
 * 不依赖 HTML 页面块的 :::pageBlock 约定，纯 DOM。
 */

const OWN = 'data-page-zoom-own'
const PREV = 'data-page-zoom-prev-style'
const CLOSE = 'data-page-zoom-close'

type Prev = { overflow: string; position: string }
const restored = new WeakMap<HTMLElement, Prev>()
const watched = new Set<HTMLElement>()

function key(el: HTMLElement) {
  return el.tagName + '|' + el.className
}

/** 需要临时放开的祖先：会裁剪、或会当 fixed 包含块/层叠上下文的都可能挡住覆盖层。 */
function shouldPatch(el: HTMLElement) {
  if (el === document.body || el === document.documentElement) return false
  if (el.closest('[data-page-zoom-own]')) return false
  return true
}

export function unlockAncestors(from: HTMLElement) {
  const chain: HTMLElement[] = []
  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.body && el !== document.documentElement) {
    if (shouldPatch(el) && !watched.has(el)) chain.push(el)
    el = el.parentElement
  }
  for (const node of chain) {
    restored.set(node, { overflow: node.style.overflow, position: node.style.position })
    node.setAttribute(PREV, JSON.stringify(restored.get(node)))
    node.style.overflow = 'visible'
    node.style.position = 'static'
    watched.add(node)
    node.style.setProperty('position', 'static', 'important')
    node.style.setProperty('overflow', 'visible', 'important')
  }
}

export function relockAncestors() {
  for (const node of [...watched]) {
    const prev = restored.get(node)
    node.style.removeProperty('position')
    node.style.removeProperty('overflow')
    if (prev) {
      node.style.position = prev.position
      node.style.overflow = prev.overflow
    }
    node.removeAttribute(PREV)
    restored.delete(node)
    watched.delete(node)
  }
}

/** 覆盖层：position: fixed, inset: 0，最高层级，底色由调用方给。 */
export function makeOverlay(testId: string, background: string) {
  const el = document.createElement('div')
  el.setAttribute('data-testid', testId)
  el.setAttribute(OWN, '')
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100%',
    'height:100%',
    'max-width:none',
    'max-height:none',
    'margin:0',
    'padding:0',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    `background:${background}`,
    'z-index:2147483000',
  ].join(';')
  document.body.appendChild(el)
  return el
}

export function raiseOverlay(el: HTMLElement) {
  document.body.appendChild(el)
}

/** 放大期间：吃掉 Esc（留给插件自己关），并保证覆盖层始终是 body 的最后一个孩子。 */
export function watchZoom(onEscape: () => void, overlay: HTMLElement) {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onEscape()
  }
  const observer = new MutationObserver(() => raiseOverlay(overlay))
  window.addEventListener('keydown', onKey, true)
  observer.observe(document.body, { childList: true })
  return () => {
    window.removeEventListener('keydown', onKey, true)
    observer.disconnect()
  }
}

export function markCloseButton(button: HTMLElement) {
  button.setAttribute(CLOSE, '')
}
