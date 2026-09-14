import type { WebFetchResult, WebSearchResult } from './types.ts'

export function hostnameOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function presentSearch(queries: string[], batches: WebSearchResult[]) {
  const sources = batches.flatMap((batch) => batch.sources)
  const seen = new Set<string>()
  const unique = sources.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
  const content = batches.map((batch) => batch.content).filter(Boolean).join('\n\n')
  return {
    queries,
    content: content || undefined,
    sources: unique.map((item) => ({
      url: item.url,
      title: item.title || hostnameOf(item.url),
      snippet: item.snippet,
      publishedAt: item.publishedAt,
    })),
    truncated: batches.some((batch) => batch.truncated),
  }
}

export function presentFetch(result: WebFetchResult) {
  const file = result.body.kind === 'file'
    ? { path: result.body.path, mime: result.body.mime, bytes: result.body.bytes }
    : undefined
  return {
    url: result.url,
    status: result.statusCode,
    title: hostnameOf(result.url),
    text: result.body.content,
    ...(file ? { file } : {}),
    ...(result.images?.length ? { images: [...result.images] } : {}),
    truncated: result.truncated,
  }
}
