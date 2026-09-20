import { afterEach, beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as http from '@biu/host-http'
import * as mcp from './index.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { bearerToken, generateMcpToken, tokensMatch } from './host-token.ts'
import { isLoopbackAddress } from './serve.ts'

let dir = ''
let prevHost = ''
let prevToken: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-mcp-host-'))
  process.env.BIU_MCP_CONFIG = join(dir, 'mcp.json')
  prevHost = process.env.BIU_MCP_HOST ?? ''
  process.env.BIU_MCP_HOST = join(dir, 'mcp-host.json')
  prevToken = process.env.BIU_MCP_TOKEN
  delete process.env.BIU_MCP_TOKEN
})

afterEach(() => {
  delete process.env.BIU_MCP_CONFIG
  if (prevHost) process.env.BIU_MCP_HOST = prevHost
  else delete process.env.BIU_MCP_HOST
  if (prevToken === undefined) delete process.env.BIU_MCP_TOKEN
  else process.env.BIU_MCP_TOKEN = prevToken
  rmSync(dir, { recursive: true, force: true })
})

async function boot() {
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 0 })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_list',
    description: 'list tables',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    execute: (args) => ({ path: String(args.path ?? '/'), rows: ['ok'] }),
  })
  ctx.tools.register({
    name: 'bash',
    description: 'should stay hidden from file-mode MCP',
    parameters: { type: 'object', properties: {} },
    execute: () => ({ leaked: true }),
  })
  await ctx.plugin(mcp)
  const port = await ready
  return { ctx, port }
}

async function mcpClient(url: string, token: string) {
  const client = new Client({ name: 'biu-test', version: '0.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

test('bearer parser and token compare', () => {
  assert.equal(bearerToken('Bearer abc'), 'abc')
  assert.equal(tokensMatch('a', 'a'), true)
  assert.equal(tokensMatch('a', 'b'), false)
  assert.equal(tokensMatch('', generateMcpToken()), false)
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('192.168.1.2'), false)
})

test('host MCP requires a bearer token and only exposes file-mode db tools', async () => {
  const { ctx, port } = await boot()
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(denied.status, 401)

    const infoRes = await fetch(`http://127.0.0.1:${port}/api/mcp/info`)
    assert.equal(infoRes.status, 200)
    const info = (await infoRes.json()) as {
      url: string
      localUrl?: string
      token: string
      tools: string[]
      clients: { cursor: { mcpServers: { biu: { url: string } } } }
    }
    assert.equal(info.url, `http://127.0.0.1:${port}/api/mcp`)
    assert.equal(info.localUrl, info.url)
    assert.match(info.token, /^biu_mcp_/)
    assert.equal(info.tools.includes('db_list'), true)
    assert.equal(info.clients.cursor.mcpServers.biu.url, info.url)

    const client = await mcpClient(info.url, info.token)
    const listed = await client.listTools()
    const names = listed.tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, ['db_list'])
    const called = await client.callTool({ name: 'db_list', arguments: { path: '/mcp' } })
    const text = (called.content as Array<{ text?: string }>)[0]?.text ?? ''
    assert.match(text, /"path": "\/mcp"/)
    const blockedTool = await client.callTool({ name: 'bash', arguments: {} })
    assert.equal(blockedTool.isError, true)
    await client.close()

    const rotated = await fetch(`http://127.0.0.1:${port}/api/mcp/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${info.token}` },
    })
    assert.equal(rotated.status, 200)
    const next = (await rotated.json()) as { token: string }
    assert.notEqual(next.token, info.token)
    const stale = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${info.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
    assert.equal(stale.status, 401)

  } finally {
    await ctx.fiber.dispose()
  }
}, 20000)

test('share listener exposes token-gated MCP on the LAN port, not the workstation', async () => {
  const ctx = new Context()
  const sharePortP = new Promise<number>((resolve) => ctx.on('http/share-ready', ({ port }) => resolve(port)))
  const localP = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 31429, shareHost: '127.0.0.1', fallbackPort: true })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_list',
    description: 'list',
    parameters: { type: 'object', properties: {} },
    execute: () => ({ ok: true }),
  })
  await ctx.plugin(mcp)
  const [sharePort, localPort] = await Promise.all([sharePortP, localP])
  try {
    const info = (await (await fetch(`http://127.0.0.1:${localPort}/api/mcp/info`)).json()) as {
      url: string
      localUrl: string
      bind: string
      token: string
    }
    assert.equal(info.localUrl, `http://127.0.0.1:${localPort}/api/mcp`)
    assert.equal(info.url, `http://127.0.0.1:${sharePort}/api/mcp`)
    assert.equal(info.bind, '127.0.0.1')

    const denied = await fetch(`http://127.0.0.1:${sharePort}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(denied.status, 401)

    const workstation = await fetch(`http://127.0.0.1:${sharePort}/api/db/list`)
    assert.equal(workstation.status, 404)

    const client = await mcpClient(info.url, info.token)
    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map((tool) => tool.name), ['db_list'])
    await client.close()
  } finally {
    await ctx.fiber.dispose()
  }
}, 20000)
