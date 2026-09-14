import { combineSignals, fetchHeaders, parseDuckDuckGoHtml } from './html.ts'
import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult } from './types.ts'

export function duckDuckGoSearchProvider(): WebSearchProvider {
  return {
    id: 'ddg',
    available: () => true,
    async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
      const query = request.query.trim()
      if (!query) throw new WebError('WEB_PROVIDER_ERROR', 'query is required')
      const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      let html: string
      try {
        const res = await fetch(target, { signal: combineSignals(signal), headers: fetchHeaders(), redirect: 'follow' })
        if (!res.ok) throw new WebError('WEB_PROVIDER_ERROR', `DuckDuckGo HTTP ${res.status}`)
        html = await res.text()
      } catch (error) {
        if (error instanceof WebError) throw error
        throw new WebError('WEB_PROVIDER_ERROR', `DuckDuckGo search failed: ${String(error)}`)
      }
      const hits = parseDuckDuckGoHtml(html)
      const max = request.maxResults
      const sources = (max == null ? hits : hits.slice(0, max)).map((hit) => ({
        url: hit.url,
        title: hit.title,
        snippet: hit.snippet || undefined,
      }))
      return { sources, truncated: max != null && hits.length > max }
    },
  }
}
