import { normalizeUrl } from './url.ts'

export const BROWSER_OPEN_EVENT = 'biu:browser-open'
export const BROWSER_TAB_ID = 'browser'

let pendingUrl = ''

export function takePendingBrowserUrl() {
  const url = pendingUrl
  pendingUrl = ''
  return url
}

export function nativeBrowserAvailable() {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { biuBrowser?: { available?: boolean } }
  return Boolean(w.biuBrowser?.available)
}

/** 打开右侧检查器浏览器并跳到 url。Electron 用原生视图；网页版退回系统标签。 */
export function openSidebarBrowser(url: string) {
  const next = normalizeUrl(url)
  if (!next) return false
  pendingUrl = next
  if (typeof window === 'undefined') return true
  const w = window as unknown as { biuBrowser?: { available?: boolean; navigate?: (url: string) => void } }
  if (w.biuBrowser?.available && typeof w.biuBrowser.navigate === 'function') {
    window.dispatchEvent(new Event('biu:inspector-open'))
    window.dispatchEvent(new CustomEvent('biu:inspector-tab', { detail: BROWSER_TAB_ID }))
    window.dispatchEvent(new CustomEvent(BROWSER_OPEN_EVENT, { detail: { url: next } }))
    w.biuBrowser.navigate(next)
    return true
  }
  window.open(next, '_blank', 'noopener')
  return false
}
