import { Service, type Context } from 'cordis'
import {
  WebError,
  type WebConfig,
  type WebFetchProvider,
  type WebFetchRequest,
  type WebFetchResult,
  type WebSearchProvider,
  type WebSearchRequest,
  type WebSearchResult,
} from './types.ts'

export class WebService extends Service {
  private searchProviders = new Map<string, WebSearchProvider>()
  private fetchProviders = new Map<string, WebFetchProvider>()

  constructor(
    ctx: Context,
    public config: WebConfig = {},
  ) {
    super(ctx, 'web')
  }

  searchProviderId() {
    return this.config.searchProvider?.trim() || process.env.BIU_WEB_SEARCH_PROVIDER?.trim() || ''
  }

  fetchProviderId() {
    return this.config.fetchProvider?.trim() || process.env.BIU_WEB_FETCH_PROVIDER?.trim() || ''
  }

  searchMaxResults() {
    const n = Number(this.config.searchMaxResults ?? 8)
    if (!Number.isFinite(n)) return 8
    return Math.min(Math.max(Math.round(n), 1), 12)
  }

  registerSearchProvider(provider: WebSearchProvider) {
    return this.ctx.effect(() => {
      if (this.searchProviders.has(provider.id)) {
        throw new WebError('WEB_DUPLICATE_PROVIDER', `search provider already registered: ${provider.id}`)
      }
      this.searchProviders.set(provider.id, provider)
      return () => this.searchProviders.delete(provider.id)
    }, `web.search ${provider.id}`)
  }

  registerFetchProvider(provider: WebFetchProvider) {
    return this.ctx.effect(() => {
      if (this.fetchProviders.has(provider.id)) {
        throw new WebError('WEB_DUPLICATE_PROVIDER', `fetch provider already registered: ${provider.id}`)
      }
      this.fetchProviders.set(provider.id, provider)
      return () => this.fetchProviders.delete(provider.id)
    }, `web.fetch ${provider.id}`)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const provider = pickProvider(this.searchProviders, this.searchProviderId(), 'search')
    const result = await provider.search(request, signal)
    const max = request.maxResults
    if (max == null || result.sources.length <= max) {
      return { ...result, truncated: result.truncated || false }
    }
    return { ...result, sources: result.sources.slice(0, max), truncated: true }
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const provider = pickProvider(this.fetchProviders, this.fetchProviderId(), 'fetch')
    return provider.fetch(request, signal)
  }
}

function pickProvider<T extends { id: string; available(): boolean }>(
  registry: Map<string, T>,
  configured: string,
  kind: 'search' | 'fetch',
): T {
  if (configured) {
    const hit = registry.get(configured)
    if (!hit) throw new WebError('WEB_PROVIDER_CONFIGURED_MISSING', `${kind} provider not registered: ${configured}`)
    if (!hit.available()) {
      throw new WebError('WEB_PROVIDER_CONFIGURED_UNAVAILABLE', `${kind} provider unavailable: ${configured}`)
    }
    return hit
  }
  const usable = [...registry.values()].filter((item) => item.available())
  if (usable.length === 1) return usable[0]!
  if (usable.length === 0) throw new WebError('WEB_PROVIDER_UNAVAILABLE', `no usable ${kind} provider`)
  throw new WebError(
    'WEB_PROVIDER_AMBIGUOUS',
    `multiple ${kind} providers: ${usable.map((item) => item.id).join(', ')}`,
  )
}
