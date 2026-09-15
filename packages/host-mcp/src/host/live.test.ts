import { afterEach, beforeEach, expect, test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as mcp from './index.ts'

const SERVER = join(process.cwd(), 'packages/host-mcp/src/host/fixtures/mini-mcp-server.mjs')

test('the fixture server is where the tests expect it', () => {
  assert.equal(existsSync(SERVER), true, SERVER)
})

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-mcp-live-'))
  process.env.BIU_MCP_CONFIG = join(dir, 'mcp.json')
})

afterEach(() => {
  delete process.env.BIU_MCP_CONFIG
  rmSync(dir, { recursive: true, force: true })
})

async function boot() {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(mcp)
  return ctx
}

test('mounts a real stdio MCP server: handshake, tools/list, tools/call', async () => {
  const ctx = await boot()
  await ctx.tools.invoke('mcp_add_stdio', { id: 'mini', command: process.execPath, args: [SERVER] })

  const row = ctx.mcp.listServers().find((item) => item.id === 'mini')
  assert.equal(row?.status, 'ready')
  assert.equal(row?.serverName, 'mini-mcp')
  assert.equal(row?.serverVersion, '9.9.9')
  assert.equal(row?.totalToolCount, 3)

  const listed = (await ctx.tools.invoke('mcp_list', { server: 'mini' })) as Array<{ server: string; name: string }>
  assert.deepEqual(listed.map((item) => item.name).sort(), ['read_file', 'read_secret', 'write_file'])
  assert.equal(listed.every((item) => item.server === 'mini'), true)

  const result = (await ctx.tools.invoke('mcp_call', {
    server: 'mini',
    name: 'read_file',
    arguments: { path: '/tmp/x' },
  })) as { content: Array<{ text: string }> }
  assert.equal(result.content[0]?.text, 'read_file:{"path":"/tmp/x"}')

  await ctx.mcp.remove('mini')
}, 30000)

test('server-level tool selection hides and blocks tools on a live server', async () => {
  const ctx = await boot()
  await ctx.mcp.upsert({
    id: 'mini',
    command: process.execPath,
    args: [SERVER],
    tools: { allow: ['read_*'], deny: ['read_secret'] },
  })

  const listed = (await ctx.tools.invoke('mcp_list')) as Array<{ server: string; name: string }>
  const mini = listed.filter((item) => item.server === 'mini').map((item) => item.name)
  assert.deepEqual(mini, ['read_file'])

  const row = ctx.mcp.listServers().find((item) => item.id === 'mini')
  assert.equal(row?.toolCount, 1)
  assert.equal(row?.totalToolCount, 3)

  // 全量清单仍看得到被排除的工具，方便调整选择。
  assert.deepEqual(ctx.mcp.catalog('mini'), [
    { name: 'read_file', description: 'read a file', allowed: true },
    { name: 'read_secret', description: 'read a secret', allowed: false },
    { name: 'write_file', description: 'write a file', allowed: false },
  ])

  await assert.rejects(
    () => ctx.tools.invoke('mcp_call', { server: 'mini', name: 'write_file', arguments: {} }),
    /disabled by server config/,
  )

  // 放开后立刻生效，不需要重连。
  ctx.mcp.setToolFilter('mini', { allow: [], deny: [] })
  const opened = (await ctx.tools.invoke('mcp_call', { server: 'mini', name: 'write_file', arguments: {} })) as {
    content: Array<{ text: string }>
  }
  assert.equal(opened.content[0]?.text, 'write_file:{}')

  await ctx.mcp.remove('mini')
}, 30000)

test('disconnect keeps config, connect brings it back', async () => {
  const ctx = await boot()
  await ctx.mcp.upsert({ id: 'mini', command: process.execPath, args: [SERVER] })

  await ctx.mcp.setEnabled('mini', false)
  let row = ctx.mcp.listServers().find((item) => item.id === 'mini')
  assert.equal(row?.status, 'idle')
  assert.equal(row?.enabled, false)
  assert.equal(row?.toolCount, 0)

  await ctx.mcp.setEnabled('mini', true)
  row = ctx.mcp.listServers().find((item) => item.id === 'mini')
  assert.equal(row?.status, 'ready')
  assert.equal(row?.toolCount, 3)

  await ctx.mcp.remove('mini')
}, 30000)

test('a server that fails to start lands as error with its stderr, not a hang', async () => {
  const ctx = await boot()
  await expect(ctx.mcp.upsert({ id: 'broken', command: process.execPath, args: ['--eval', 'process.exit(3)'] })).rejects.toThrow()
  const row = ctx.mcp.listServers().find((item) => item.id === 'broken')
  assert.equal(row?.status, 'error')
  assert.equal(row?.error.length > 0, true)
  // 配置仍在盘上，修好命令后能重连。
  assert.equal(ctx.mcp.serverIds().includes('broken'), true)
}, 30000)
