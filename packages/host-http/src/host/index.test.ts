import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { WebSocket } from 'ws'
import * as http from './index.ts'
import { deliverTenantEvent } from './index.ts'

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'))
        return
      }
      const port = addr.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
    server.on('error', reject)
  })
}

test('port zero reports the actual bound port', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cordis-http-dynamic-'))
  const publicDir = join(base, 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'index.html'), '<html>dynamic</html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const fiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  try {
    const port = await ready
    assert.ok(port > 0)
    const response = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /dynamic/)
  } finally {
    await fiber.dispose()
  }
})

test('occupied requested port falls back when enabled', async () => {
  const blocker = createServer()
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(0, '127.0.0.1', () => resolve())
  })
  const address = blocker.address()
  assert.ok(address && typeof address !== 'string')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const fiber = await ctx.plugin(http, {
    port: address.port,
    host: '127.0.0.1',
    fallbackPort: true,
    sharePort: 0,
  })
  try {
    const port = await ready
    assert.notEqual(port, address.port)
    assert.ok(port > 0)
  } finally {
    await fiber.dispose()
    await new Promise<void>((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())))
  }
})

test('occupied share port falls back when enabled', async () => {
  const prevShare = process.env.SHARE_PORT
  const blocker = createServer()
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(0, '127.0.0.1', () => resolve())
  })
  const address = blocker.address()
  assert.ok(address && typeof address !== 'string')
  const ctx = new Context()
  const shareReady = new Promise<number>((resolve) => ctx.on('http/share-ready', ({ port }) => resolve(port)))
  const fiber = await ctx.plugin(http, {
    port: 0,
    host: '127.0.0.1',
    fallbackPort: false,
    sharePort: address.port,
    shareHost: '127.0.0.1',
  })
  try {
    const port = await shareReady
    assert.notEqual(port, address.port)
    assert.ok(port > 0)
    assert.equal(process.env.SHARE_PORT, String(port))
  } finally {
    await fiber.dispose()
    await new Promise<void>((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())))
    if (prevShare === undefined) delete process.env.SHARE_PORT
    else process.env.SHARE_PORT = prevShare
  }
})

test('extra ws path does not abort the hub /ws handshake', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cordis-http-ws-'))
  const publicDir = join(base, 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'index.html'), '<html></html>')
  const port = await freePort()
  const ctx = new Context()
  const ready = new Promise<void>((resolve) => {
    ctx.on('http/ready', () => resolve())
  })
  const fiber = await ctx.plugin(http, { port, host: '127.0.0.1', publicDir })
  await ready
  try {
    ctx.http.ws('/ws/plugin-extra', (socket) => {
      socket.send('pty')
    })

    const hub = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      ws.on('message', (raw) => {
        resolve(String(raw))
        ws.close()
      })
      ws.on('error', reject)
    })
    assert.match(hub, /"type":"hello"/)

    const extra = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/plugin-extra`)
      ws.on('message', (raw) => {
        resolve(String(raw))
        ws.close()
      })
      ws.on('error', reject)
    })
    assert.equal(extra, 'pty')
  } finally {
    await fiber.dispose()
  }
})

test('share listener serves /api/share but not the workstation APIs', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cordis-http-share-'))
  const publicDir = join(base, 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'index.html'), '<html>app</html>')
  const port = await freePort()
  const sharePort = await freePort()
  const ctx = new Context()
  const ready = new Promise<void>((resolve) => {
    ctx.on('http/ready', () => resolve())
  })
  const shareReady = new Promise<void>((resolve) => {
    ctx.on('http/share-ready', () => resolve())
  })
  const fiber = await ctx.plugin(http, { port, host: '127.0.0.1', publicDir, sharePort, shareHost: '127.0.0.1' })
  await Promise.all([ready, shareReady])
  ctx.http.route('GET', '/api/db/list', (route) => {
    route.send(200, { leaked: true })
  })
  ctx.http.route('GET', '/api/share/:token', (route) => {
    route.send(200, { token: route.params.token })
  })
  try {
    const blocked = await fetch(`http://127.0.0.1:${sharePort}/api/db/list`)
    assert.equal(blocked.status, 404)
    const share = await fetch(`http://127.0.0.1:${sharePort}/api/share/abc`)
    assert.equal(share.status, 200)
    assert.equal((await share.json()).token, 'abc')
    const local = await fetch(`http://127.0.0.1:${port}/api/db/list`)
    assert.equal(local.status, 200)
    const root = await fetch(`http://127.0.0.1:${sharePort}/`)
    assert.equal(root.status, 404)
  } finally {
    await fiber.dispose()
  }
})

test('workspace sockets only receive their own tenant events', () => {
  const ada = { workspaceId: 'ws_a', accountId: 'ada' }
  assert.equal(deliverTenantEvent(ada, 'database', { workspaceId: 'ws_a' }), true)
  assert.equal(deliverTenantEvent(ada, 'database', { workspaceId: 'ws_b' }), false)
  assert.equal(deliverTenantEvent(ada, 'session', { workspaceId: 'ws_a', accountId: 'bob' }), false)
  assert.equal(deliverTenantEvent(ada, 'session', { workspaceId: 'ws_a', accountId: 'ada' }), true)
  assert.equal(deliverTenantEvent(ada, 'session'), false)
  assert.equal(deliverTenantEvent({}, 'database', { workspaceId: 'ws_b' }), true)
  assert.equal(deliverTenantEvent(ada, 'clock', { workspaceId: 'ws_b' }), true)
})

test('online HTTP and WebSocket enforce account and workspace boundaries', async () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  const base = await mkdtemp(join(tmpdir(), 'cordis-http-tenant-'))
  const publicDir = join(base, 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'index.html'), '<html></html>')
  const memberships = new Set(['ada:ws-a', 'bob:ws-b'])
  const ctx = new Context()
  class FakeAccount extends Service {
    store = {
      accountByToken: (token: string) => token === 'ada-token' ? { id: 'ada' } : token === 'bob-token' ? { id: 'bob' } : null,
      isMember: (accountId: string, workspaceId: string) => memberships.has(`${accountId}:${workspaceId}`),
    }
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(FakeAccount)
  const fiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const port = await ready
  ctx.http.route('GET', '/api/db/list', (route) => route.send(200, { ok: true }))
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/db/list`)).status, 401)
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/db/list`, { headers: { Authorization: 'Bearer ada-token' } })).status, 400)
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/api/db/list`, {
          headers: { Authorization: 'Bearer ada-token', 'X-Biu-Workspace-Id': 'ws-b' },
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/api/db/list`, {
          headers: { Authorization: 'Bearer ada-token', 'X-Biu-Workspace-Id': 'ws-a' },
        })
      ).status,
      200,
    )

    const connect = (token: string, workspaceId: string) =>
      new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?workspaceId=${workspaceId}`, {
          headers: { Cookie: `biu_account=${token}` },
        })
        socket.once('message', () => resolve(socket))
        socket.once('error', reject)
      })
    const [ada, bob] = await Promise.all([connect('ada-token', 'ws-a'), connect('bob-token', 'ws-b')])
    const adaMessage = new Promise<string>((resolve) => ada.once('message', (raw) => resolve(String(raw))))
    let bobReceived = false
    bob.once('message', () => {
      bobReceived = true
    })
    ctx.http.broadcast('database', { changed: true }, 'ws-a')
    assert.match(await adaMessage, /"changed":true/)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(bobReceived, false)
    const bobAccountMessage = new Promise<string>((resolve) => bob.once('message', (raw) => resolve(String(raw))))
    ctx.http.broadcastAccount('bob', 'inbox', { accountOnly: true })
    assert.match(await bobAccountMessage, /"accountOnly":true/)
    const closed = new Promise<number>((resolve) => ada.once('close', (code) => resolve(code)))
    memberships.delete('ada:ws-a')
    ctx.http.disconnectTenant('ada', 'ws-a')
    assert.equal(await closed, 4403)
    bob.close()
  } finally {
    await fiber.dispose()
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('host prefers dist after vite build unless BIU_PUBLIC_DIR is set', () => {
  const src = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')
  assert.match(src, /BIU_PUBLIC_DIR/)
  assert.match(src, /existsSync\(join\(dist, 'index.html'\)\)/)
})

test('index html is painted with the profile theme', () => {
  const src = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')
  assert.match(src, /paintDocumentTheme/)
  assert.match(src, /profilePath\(\)/)
})
