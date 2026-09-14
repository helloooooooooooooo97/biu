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

export function parseDuckDuckGoHtml(html: string) {
  const hits: Array<{ url: string; title: string; snippet: string }> = []
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

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (compatible; BiuBot/0.1; +https://github.com/helloooooooooooooo97/biu) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

export function fetchHeaders() {
  return FETCH_HEADERS
}

export function combineSignals(signal?: AbortSignal, timeoutMs = 15_000) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
