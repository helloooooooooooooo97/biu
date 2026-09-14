/** 地址归一化 + 常用站点别名（浏览器卡片用）。 */

export function searchUrl(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query.trim())}`
}

export function normalizeUrl(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text)) return `https://${text}`
  if (/^localhost(:\d+)?(\/\S*)?$/.test(text)) return `http://${text}`
  if (text.startsWith('/')) return text
  return searchUrl(text)
}

export const BOOKMARKS: Array<{ label: string; url: string }> = [
  { label: 'example.com', url: 'https://example.com' },
  { label: 'Wikipedia', url: 'https://zh.wikipedia.org' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
]

export const BLOCKED_HINT = '该站点禁止被嵌入（X-Frame-Options / CSP frame-ancestors）'
