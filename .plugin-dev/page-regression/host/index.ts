import type { Context } from 'cordis'

export const name = 'page-regression'
export const inject = ['http']

type ProbeBody = {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
}

const ABSOLUTE = /^https?:\/\//i

/**
 * 断言要真发请求时走这里：浏览器只跟自己的 host 说话，避免 CORS / 证书 / 代理差异。
 * 相对路径按本次请求的 host 自己的 origin 解析（不写死端口）。
 */
export function apply(ctx: Context) {
  ctx.http.route('POST', '/api/page-regression/http', async (route) => {
    const payload = await route.json<ProbeBody>()
    const method = String(payload.method || 'GET').toUpperCase()
    const raw = String(payload.url || '').trim()
    if (!raw) {
      route.send(400, { error: 'url is required' })
      return
    }
    const host = route.req.headers.host || '127.0.0.1'
    let target: URL
    try {
      target = ABSOLUTE.test(raw) ? new URL(raw) : new URL(raw, `http://${host}`)
    } catch {
      route.send(400, { error: `bad url: ${raw}` })
      return
    }
    const started = Date.now()
    const sendBody =
      method === 'GET' || method === 'HEAD' || payload.body == null
        ? undefined
        : typeof payload.body === 'string'
          ? payload.body
          : JSON.stringify(payload.body)
    try {
      const res = await fetch(target, {
        method,
        headers: { 'content-type': 'application/json', ...(payload.headers || {}) },
        body: sendBody,
        redirect: 'manual',
      })
      const text = await res.text()
      route.send(200, {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        url: target.toString(),
        ms: Date.now() - started,
        body: text.slice(0, 2000),
      })
    } catch (error) {
      route.send(200, {
        ok: false,
        status: 0,
        statusText: 'fetch failed',
        url: target.toString(),
        ms: Date.now() - started,
        body: String(error),
      })
    }
  })

  ctx.http.route('GET', '/api/page-regression/ping', async (route) => {
    route.send(200, { ok: true, plugin: name, at: Date.now() })
  })
}
