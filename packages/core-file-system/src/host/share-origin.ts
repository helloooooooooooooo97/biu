import { networkInterfaces } from 'node:os'
import type { IncomingMessage } from 'node:http'

export function firstLanIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return ''
}

/** Origin LAN guests should open. Localhost Host headers are not reused when SHARE_PORT is set. */
export function publicShareOrigin(req?: IncomingMessage) {
  const env = process.env.SHARE_PUBLIC_URL?.replace(/\/$/, '')
  if (env) return env
  const sharePort = Number(process.env.SHARE_PORT ?? 0)
  if (sharePort > 0) {
    const ip = firstLanIPv4()
    return `http://${ip || '127.0.0.1'}:${sharePort}`
  }
  const host = String(req?.headers.host ?? '127.0.0.1:3141')
  const proto = String(req?.headers['x-forwarded-proto'] ?? 'http')
  return `${proto}://${host}`
}

export function publicShareUrl(req: IncomingMessage | undefined, token: string) {
  return `${publicShareOrigin(req)}/share/${encodeURIComponent(token)}`
}
