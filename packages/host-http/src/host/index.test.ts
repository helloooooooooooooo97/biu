import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { WebSocket } from 'ws'
import * as http from './index.ts'

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

test('host prefers dist after vite build unless BIU_PUBLIC_DIR is set', () => {
  const src = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')
  assert.match(src, /BIU_PUBLIC_DIR/)
  assert.match(src, /existsSync\(join\(dist, 'index.html'\)\)/)
})

test('index html is painted with the profile theme', () => {
  const src = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')
  assert.match(src, /paintDocumentTheme/)
  assert.match(src, /profile\.json/)
})
