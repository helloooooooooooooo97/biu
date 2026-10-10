import type { Context } from 'cordis'

export const name = 'api-playground'
export const inject = ['http']

/** 请求超时：15s。 */
const TIMEOUT_MS = 15000
/** 响应体最多回传 200KB，超了截断并打标。 */
const MAX_BODY = 200 * 1024

type SendRequest = {
  method?: string
  url?: string
  headers?: unknown
  body?: string | null
}

const BODYLESS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  if (typeof raw === 'string') {
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim()
      if (!text || text.startsWith('#')) continue
      const at = text.indexOf(':')
      if (at <= 0) continue
      out[text.slice(0, at).trim()] = text.slice(at + 1).trim()
    }
    return out
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (Array.isArray(item) && item.length >= 2) out[String(item[0])] = String(item[1])
      else if (item && typeof item === 'object') {
        const entry = item as { name?: unknown; key?: unknown; value?: unknown }
        const key = String(entry.name ?? entry.key ?? '').trim()
        if (key) out[key] = String(entry.value ?? '')
      }
    }
    return out
  }
  if (typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const name = key.trim()
      if (!name) continue
      out[name] = Array.isArray(value) ? value.map((v) => String(v)).join(', ') : String(value ?? '')
    }
  }
  return out
}

function fail(message: string) {
  return { ok: false as const, error: message }
}

export function apply(ctx: Context) {
  ctx.http.route('GET', '/api/api-playground/health', async (route) => {
    route.send(200, { ok: true, plugin: name, timeoutMs: TIMEOUT_MS, maxBody: MAX_BODY })
  })

  ctx.http.route('POST', '/api/api-playground/send', async (route) => {
    let payload: SendRequest
    try {
      payload = await route.json<SendRequest>()
    } catch {
      route.send(400, fail('请求体不是合法 JSON'))
      return
    }

    const method = String(payload.method ?? 'GET').trim().toUpperCase() || 'GET'
    const rawUrl = String(payload.url ?? '').trim()
    if (!rawUrl) {
      route.send(400, fail('缺少 url'))
      return
    }

    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      route.send(400, fail(`URL 解析失败：${rawUrl}`))
      return
    }
    // 安全：只允许 http / https。
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      route.send(400, fail(`只允许 http/https，收到 ${target.protocol}`))
      return
    }

    const headers = normalizeHeaders(payload.headers)
    const bodyText = typeof payload.body === 'string' ? payload.body : ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const started = Date.now()

    try {
      const init: RequestInit = {
        method,
        headers,
        redirect: 'follow',
        signal: controller.signal,
      }
      if (!BODYLESS.has(method) && bodyText.trim()) init.body = bodyText
      const res = await fetch(target.toString(), init)
      const ms = Date.now() - started

      const buf = Buffer.from(await res.arrayBuffer())
      const bytes = buf.length
      const truncated = bytes > MAX_BODY
      const text = (truncated ? buf.subarray(0, MAX_BODY) : buf).toString('utf8')

      route.send(200, {
        ok: true,
        method,
        url: rawUrl,
        finalUrl: res.url || target.toString(),
        status: res.status,
        statusText: res.statusText,
        ms,
        bytes,
        truncated,
        headers: Object.fromEntries(res.headers.entries()),
        body: text,
      })
    } catch (error) {
      const ms = Date.now() - started
      const aborted = controller.signal.aborted
      route.send(200, {
        ok: false,
        method,
        url: rawUrl,
        ms,
        error: aborted ? `请求超时（${TIMEOUT_MS}ms）` : String((error as Error)?.message ?? error),
      })
    } finally {
      clearTimeout(timer)
    }
  })
}
