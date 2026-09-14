import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
