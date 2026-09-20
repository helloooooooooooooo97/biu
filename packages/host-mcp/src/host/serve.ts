import { networkInterfaces } from 'node:os'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { FILE_TOOL_NAMES, runWithToolPolicy } from '@biu/host-tools'
import type { Context } from 'cordis'
import type { RouteContext } from '@biu/type-http'
import {
  bearerToken,
  loadOrCreateMcpToken,
  mcpClientSnippets,
  mcpHostConfigPath,
  rotateMcpToken,
  tokensMatch,
} from './host-token.ts'

const SERVER_INFO = { name: 'biu', version: '0.1.0' } as const

const MCP_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function asInputSchema(parameters: unknown) {
  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    const record = parameters as Record<string, unknown>
    if (record.type === 'object' || record.properties) return record
  }
  return { type: 'object', properties: {} }
}

function listenHost(host: string) {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
}

export function isLoopbackAddress(addr?: string | null) {
  const ip = String(addr ?? '')
  return ip === '127.0.0.1' || ip === '::1' || ip === ':ffff:127.0.0.1' || ip === '::ffff:127.0.0.1'
}

/** 给局域网客户端看的 IPv4；0.0.0.0 不能当 URL host。 */
export function lanIPv4() {
  const preferred: string[] = []
  const rest: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const item of addrs ?? []) {
      const v4 = item.family === 'IPv4' || item.family === 4
      if (!v4 || item.internal) continue
      if (item.address.startsWith('169.254.')) continue
      if (item.address.startsWith('192.168.') || item.address.startsWith('10.') || item.address.startsWith('172.')) {
        preferred.push(item.address)
      } else {
        rest.push(item.address)
      }
    }
  }
  return preferred[0] || rest[0] || '127.0.0.1'
}

export function createBiuMcpServer(ctx: Context) {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      'Biu 工作台的 MCP 入口。协议对各客户端一样；Cursor / Claude / ChatGPT 只是各自的接入向导不同。' +
      '默认只放出文件系统 db_* 工具（文件模式）。请求必须带 Authorization: Bearer <token>。',
  })

  server.setRequestHandler(ListToolsRequestSchema, async () =>
    runWithToolPolicy({ mode: 'file' }, () => {
      const schemas = ctx.tools.schemas()
      return {
        tools: schemas.map((item) => ({
          name: item.function.name,
          description: item.function.description,
          inputSchema: asInputSchema(item.function.parameters),
        })),
      }
    }),
  )

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = String(request.params.name ?? '')
    const args = (request.params.arguments as Record<string, unknown> | undefined) ?? {}
    try {
      const result = await runWithToolPolicy({ mode: 'file' }, () => ctx.tools.invoke(name, args))
      return { content: [{ type: 'text' as const, text: stringify(result) }] }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: String(error instanceof Error ? error.message : error) }],
        isError: true,
      }
    }
  })

  return server
}

function applyCors(route: RouteContext) {
  for (const [key, value] of Object.entries(MCP_CORS)) {
    if (!route.res.getHeader(key)) route.res.setHeader(key, value)
  }
}

export function applyHostServer(ctx: Context) {
  const path = mcpHostConfigPath()
  let token = loadOrCreateMcpToken(path)
  let listenPort = ctx.http.config.port
  let sharePort = ctx.http.config.sharePort

  ctx.on('http/ready', ({ port }) => {
    listenPort = port
  })
  ctx.on('http/share-ready', ({ port }) => {
    sharePort = port
  })

  function localUrl() {
    const host = listenHost(ctx.http.config.host)
    return `http://${host}:${listenPort}/api/mcp`
  }

  function publicUrl() {
    if (sharePort > 0) {
      const bind = ctx.http.config.shareHost
      const host = bind === '0.0.0.0' || bind === '::' ? lanIPv4() : listenHost(bind)
      return `http://${host}:${sharePort}/api/mcp`
    }
    return localUrl()
  }

  function payload() {
    const url = publicUrl()
    const local = localUrl()
    const shareBind = ctx.http.config.shareHost
    return {
      url,
      localUrl: local,
      bind: sharePort > 0 ? shareBind || '0.0.0.0' : listenHost(ctx.http.config.host),
      token,
      tools: [...FILE_TOOL_NAMES],
      clients: mcpClientSnippets(url, token),
      note:
        'MCP 协议对各客户端相同。局域网走分享口（默认 0.0.0.0），工作台仍只在本机。' +
        '调用必须带 Authorization: Bearer <token>；token 只在本机 info 里明文给出。',
    }
  }

  function requireToken(route: RouteContext) {
    const got = bearerToken(route.req.headers.authorization)
    if (!tokensMatch(got, token)) {
      route.send(401, { error: 'mcp token required — Authorization: Bearer <token>，见设置 → MCP' })
      return false
    }
    return true
  }

  ctx.http.route('GET', '/api/mcp/info', (route) => {
    applyCors(route)
    if (!isLoopbackAddress(route.req.socket.remoteAddress) && !requireToken(route)) return
    route.send(200, payload())
  })

  ctx.http.route('POST', '/api/mcp/rotate', (route) => {
    applyCors(route)
    if (!requireToken(route)) return
    token = rotateMcpToken(path)
    route.send(200, payload())
  })

  const handle = async (route: RouteContext) => {
    applyCors(route)
    if (!requireToken(route)) return
    const server = createBiuMcpServer(ctx)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    const method = (route.req.method ?? 'GET').toUpperCase()
    let parsed: unknown
    if (method === 'POST') parsed = await route.json()
    try {
      await transport.handleRequest(route.req, route.res, parsed)
    } finally {
      await transport.close().catch(() => undefined)
      await server.close().catch(() => undefined)
    }
  }

  ctx.http.route('POST', '/api/mcp', handle)
  ctx.http.route('GET', '/api/mcp', handle)
  ctx.http.route('DELETE', '/api/mcp', handle)
}
