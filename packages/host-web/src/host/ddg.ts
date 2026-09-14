import { parseBingHtml, parseDuckDuckGoHtml, parseWikiOpenSearch, type SearchHit } from './html.ts'
import { loadJson, loadText } from './http.ts'
import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult } from './types.ts'

type Engine = {
  id: string
  search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>
}

const engines: Engine[] = [
  {
    id: 'ddg',
    async search(query, signal) {
      const html = await loadText('https://html.duckduckgo.com/html/', {
        method: 'POST',
        body: new URLSearchParams({ q: query, b: '' }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://html.duckduckgo.com/',
        },
        signal,
      })
      return parseDuckDuckGoHtml(html)
    },
  },
  {
    id: 'bing',
    async search(query, signal) {
      const html = await loadText(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`,
        { signal },
      )
      return parseBingHtml(html)
    },
  },
  {
    id: 'wikipedia',
    async search(query, signal) {
      const json = await loadJson(
        `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`,
        signal,
      )
      return parseWikiOpenSearch(json)
    },
  },
]

export function duckDuckGoSearchProvider(): WebSearchProvider {
  return {
    id: 'ddg',
    available: () => true,
    async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
      const query = request.query.trim()
      if (!query) throw new WebError('WEB_PROVIDER_ERROR', 'query is required')
      const errors: string[] = []
      for (const engine of engines) {
        try {
          const hits = await engine.search(query, signal)
          if (!hits.length) {
            errors.push(`${engine.id}: no results`)
            continue
          }
          const max = request.maxResults
          const sliced = max == null ? hits : hits.slice(0, max)
          return {
            sources: sliced.map((hit) => ({
              url: hit.url,
              title: hit.title,
              snippet: hit.snippet || undefined,
            })),
            truncated: max != null && hits.length > max,
          }
        } catch (error) {
          if (signal?.aborted) throw new WebError('WEB_ABORTED', 'search aborted')
          errors.push(`${engine.id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      throw new WebError('WEB_PROVIDER_ERROR', `search failed (${errors.join(' · ') || 'no engine'})`)
    },
  }
}
