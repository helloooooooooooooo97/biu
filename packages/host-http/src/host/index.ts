import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Duplex } from 'node:stream'
import { Service, type Context } from 'cordis'
import { WebSocketServer, type WebSocket } from 'ws'
import { HUB_CHANGE } from '@biu/type-http'
import type { Method, RouteContext, RouteHandler } from '@biu/type-http'

interface Route {
  method: Method
  pattern: string
  keys: string[]
  regexp: RegExp
  handler: RouteHandler
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

function compile(pattern: string) {
  const keys: string[] = []
  const regexp = new RegExp(
    '^' +
    pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key)
      return '([^/]+)'
    }) +
    '$',
  )
  return { keys, regexp }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseJson(raw: Buffer): unknown {
  if (!raw.length) return null
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error('invalid json')
  }
}

export type HttpListenConfig = {
  port?: number
  host?: string
  publicDir?: string
}

function resolveListenConfig(config?: HttpListenConfig) {
  return {
    port: Number(config?.port ?? process.env.PORT ?? 3141),
    host: config?.host ?? process.env.HTTP_HOST ?? '127.0.0.1',
    publicDir: config?.publicDir ?? join(process.cwd(), 'public'),
  }
}

function upgradePath(req: IncomingMessage) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    return '/'
  }
}

export class HttpService extends Service {
  private routes: Route[] = []
  private sockets = new Set<WebSocket>()
  private server: Server | null = null
  /** 同一 HTTP server 上只能有一条 upgrade 路由；多挂几个 `ws.Server({ server })` 会互相 abort 握手。 */
  private wsServers = new Map<string, WebSocketServer>()

  constructor(ctx: Context, public config: { port: number; host: string; publicDir: string }) {
    super(ctx, 'http')
    ctx.effect(() => {
      const server = createServer((req, res) => {
        void this.dispatch(req, res)
      })
      this.server = server
      const hub = new WebSocketServer({ noServer: true })
      this.wsServers.set('/ws', hub)
      hub.on('connection', (socket) => {
        this.sockets.add(socket)
        socket.send(JSON.stringify({ type: 'hello', payload: { ok: true } }))
        socket.on('close', () => this.sockets.delete(socket))
      })
      const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const wss = this.wsServers.get(upgradePath(req))
        if (!wss) {
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req)
        })
      }
      server.on('upgrade', onUpgrade)
      ctx.on('session/event', (payload) => this.broadcast('session', payload))
      ctx.on('agent/status', (payload) => this.broadcast('agent', payload))
      ctx.on('agent/inbox', (payload) => this.broadcast('inbox', payload))
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          ctx.logger('http').error(
            `端口 ${config.port} 已被占用。请先结束旧进程：make stop  或  lsof -ti:${config.port} | xargs kill`,
          )
        } else {
          ctx.logger('http').error(error)
        }
        process.exit(1)
      })
      const host = config.host ?? '127.0.0.1'
      server.listen(config.port, host, () => {
        ctx.emit('http/ready', { port: config.port })
        ctx.logger('http').info(`listening on http://${host}:${config.port}${host === '0.0.0.0' ? ' (内网可达)' : ''}`)
      })
      return () =>
        new Promise<void>((resolve) => {
          for (const socket of this.sockets) socket.close()
          server.off('upgrade', onUpgrade)
          hub.close()
          this.wsServers.delete('/ws')
          this.server = null
          server.close(() => resolve())
        })
    }, 'http.listen')
  }

  route(method: Method, pattern: string, handler: RouteHandler) {
    return this.ctx.effect(() => {
      const { keys, regexp } = compile(pattern)
      const item: Route = { method, pattern, keys, regexp, handler }
      this.routes.push(item)
      this.ctx.emit(HUB_CHANGE)
      return () => {
        const i = this.routes.indexOf(item)
        if (i >= 0) this.routes.splice(i, 1)
        this.ctx.emit(HUB_CHANGE)
      }
    }, `http.route ${method} ${pattern}`)
  }

  /** 在已有 HTTP 服务上再挂一条 WebSocket 路径（和 /ws 共用一条 upgrade 分发，互不 abort）。 */
  ws(path: string, handler: (socket: WebSocket, request: IncomingMessage) => void) {
    return this.ctx.effect(() => {
      const wss = new WebSocketServer({ noServer: true })
      wss.on('connection', handler)
      this.wsServers.set(path, wss)
      return () => {
        if (this.wsServers.get(path) === wss) this.wsServers.delete(path)
        wss.close()
      }
    }, `http.ws ${path}`)
  }

  broadcast(type: string, payload: unknown) {
    const data = JSON.stringify({ type, payload, ts: Date.now() })
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(data)
    }
  }

  listRoutes() {
    return this.routes.map(({ method, pattern }) => ({ method, pattern }))
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const method = (req.method ?? 'GET').toUpperCase() as Method
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
    // CORS 预检：跨内网机器的浏览器请求，先给 OPTIONS 放行
    if ((req.method ?? '').toUpperCase() === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }
    // 静态段优先于 :param，避免 `/api/approvals/mode` 被 `/api/approvals/:id` 吃掉
    const match = this.routes
      .filter((route) => route.method === method && route.regexp.test(url.pathname))
      .sort((a, b) => a.keys.length - b.keys.length || b.pattern.length - a.pattern.length)[0]
    if (match) {
      const result = url.pathname.match(match.regexp)
      const params: Record<string, string> = {}
      match.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(result?.[i + 1] ?? '')
      })
      let rawBody: Promise<Buffer> | null = null
      const body = () => {
        if (!rawBody) rawBody = readBody(req)
        return rawBody
      }
      const context: RouteContext = {
        req,
        res,
        params,
        query: url.searchParams,
        json: async <T = unknown>() => parseJson(await body()) as T,
        bytes: () => body(),
        send: (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
          res.end(JSON.stringify(body))
        },
      }
      const started = Date.now()
      try {
        await match.handler(context)
      } catch (error) {
        this.ctx.logger('http').error(error)
        if (!res.headersSent) context.send(500, { error: String(error) })
      }
      const ms = Date.now() - started
      if (ms >= 8 || url.pathname.startsWith('/api/db')) {
        this.ctx.logger('http').info(`${method} ${url.pathname}${url.search} ${ms}ms`)
      }
      return
    }
    if (method === 'GET') {
      await this.serveStatic(url.pathname, res)
      return
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
    res.end(JSON.stringify({ error: 'not found' }))
  }

  private async serveStatic(pathname: string, res: ServerResponse) {
    const relative = (pathname === '/' ? '/index.html' : pathname).replace(/\.\./g, '')
    try {
      const data = await readFile(join(this.config.publicDir, relative))
      res.writeHead(200, { 'content-type': MIME[extname(relative)] ?? 'application/octet-stream' })
      res.end(data)
    } catch {
      if (pathname.startsWith('/api/')) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'not found — 对应插件可能已卸载' }))
        return
      }
      // SPA fallback：前端 History 路由（/s/:id…）回落到 index.html
      try {
        const data = await readFile(join(this.config.publicDir, 'index.html'))
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(data)
      } catch {
        res.writeHead(404).end('not found')
      }
    }
  }
}

export const name = 'http'
export const inject = [] as const

export function apply(ctx: Context, config?: HttpListenConfig) {
  new HttpService(ctx, resolveListenConfig(config))
}
