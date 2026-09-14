export function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

export function stripTags(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export type SearchHit = { url: string; title: string; snippet: string }

export function unwrapDuckHref(href: string) {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const uddg = url.searchParams.get('uddg')
    if (uddg) return uddg
    return url.href
  } catch {
    return href
  }
}

export function unwrapBingHref(href: string) {
  try {
    const url = new URL(href, 'https://www.bing.com')
    const raw = url.searchParams.get('u')
    if (raw?.startsWith('a1')) {
      return Buffer.from(raw.slice(2), 'base64').toString('utf8')
    }
    if (/^https?:/i.test(href) && !/bing\.com\/ck\//i.test(href)) return href
    return url.href
  } catch {
    return href
  }
}

export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const blockRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/gi
  for (const match of html.matchAll(blockRe)) {
    const url = unwrapDuckHref(decodeEntities(match[1] ?? ''))
    const title = stripTags(match[2] ?? '')
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i.exec(match[3] ?? '')
    const snippet = stripTags(snippetMatch?.[1] ?? '')
    if (!title || !url || seen.has(url)) continue
    seen.add(url)
    hits.push({ title, url, snippet })
  }
  return hits
}

export function parseBingHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const blockRe = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/li>/gi
  for (const match of html.matchAll(blockRe)) {
    const url = unwrapBingHref(decodeEntities(match[1] ?? ''))
    const title = stripTags(match[2] ?? '')
    const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(match[3] ?? '')
    const snippet = stripTags(snippetMatch?.[1] ?? '')
    if (!title || !/^https?:/i.test(url) || /bing\.com\/(ck|search|aclick)/i.test(url) || seen.has(url)) continue
    seen.add(url)
    hits.push({ title, url, snippet })
  }
  return hits
}

export function parseWikiOpenSearch(raw: unknown): SearchHit[] {
  if (!Array.isArray(raw) || raw.length < 4) return []
  const titles = raw[1]
  const snippets = raw[2]
  const urls = raw[3]
  if (!Array.isArray(titles) || !Array.isArray(urls)) return []
  const hits: SearchHit[] = []
  for (let i = 0; i < titles.length; i += 1) {
    const title = String(titles[i] ?? '').trim()
    const url = String(urls[i] ?? '').trim()
    const snippet = String(Array.isArray(snippets) ? snippets[i] ?? '' : '').trim()
    if (!title || !url) continue
    hits.push({ title, url, snippet })
  }
  return hits
}

export const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

export function fetchHeaders(extra?: Record<string, string>) {
  return { ...BROWSER_HEADERS, ...extra }
}

export function combineSignals(signal?: AbortSignal, timeoutMs = 12_000) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
