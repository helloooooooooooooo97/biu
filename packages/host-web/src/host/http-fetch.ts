import { combineSignals, fetchHeaders, stripTags } from './html.ts'
import { WebError, type WebFetchProvider, type WebFetchRequest, type WebFetchResult } from './types.ts'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i
const PRIVATE_V4 = /^(10\.|192\.168\.|169\.254\.|127\.|0\.)|^(172\.(1[6-9]|2\d|3[0-1])\.)/
const MAX_CHARS = 16_000

export function assertHttpUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebError('WEB_INVALID_URL', `invalid url: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError('WEB_INVALID_URL', `only http/https urls are allowed: ${raw}`)
  }
  if (url.username || url.password) {
    throw new WebError('WEB_BLOCKED_URL', `refusing urls with credentials: ${url.origin}`)
  }
  const host = url.hostname
  if (PRIVATE_HOST.test(host) || PRIVATE_V4.test(host)) {
    throw new WebError('WEB_BLOCKED_URL', `refusing private/local url: ${raw}`)
  }
  return url
}

export function httpFetchProvider(): WebFetchProvider {
  return {
    id: 'http',
    available: () => true,
    async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
      const target = assertHttpUrl(request.url)
      let res: Response
      try {
        res = await fetch(target.href, {
          signal: combineSignals(signal),
          headers: fetchHeaders(),
          redirect: 'follow',
        })
      } catch (error) {
        if (error instanceof WebError) throw error
        throw new WebError('WEB_PROVIDER_ERROR', `fetch failed: ${String(error)}`)
      }
      const raw = await res.text()
      const type = (res.headers.get('content-type') ?? '').toLowerCase()
      const html = type.includes('html') || /<html[\s>]/i.test(raw)
      const content = html ? stripTags(raw) : raw.replace(/\s+/g, ' ').trim()
      const truncated = content.length > MAX_CHARS
      return {
        url: res.url || target.href,
        statusCode: res.status,
        body: { kind: html ? 'html' : 'text', content: truncated ? content.slice(0, MAX_CHARS) : content },
        truncated,
      }
    },
  }
}
