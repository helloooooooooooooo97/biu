import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const MEMBER_COOKIE = 'biu_member'
export const ROLES = ['owner', 'editor', 'viewer'] as const
export type MemberRole = (typeof ROLES)[number]

export type Member = {
  id: string
  name: string
  role: MemberRole
  createdAt: number
}

export function canEdit(role: MemberRole) {
  return role === 'owner' || role === 'editor'
}

export function canInvite(role: MemberRole) {
  return role === 'owner'
}

export function isRole(value: unknown): value is MemberRole {
  return value === 'owner' || value === 'editor' || value === 'viewer'
}

export function signSession(secret: string, memberId: string) {
  const body = `${memberId}.${Date.now()}`
  const mac = createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${mac}`
}

export function readSession(secret: string, raw: string | undefined) {
  if (!raw) return ''
  const parts = raw.split('.')
  if (parts.length !== 3) return ''
  const [id, ts, mac] = parts
  if (!id || !ts || !mac) return ''
  const body = `${id}.${ts}`
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return ''
  return id
}

export function cookieValue(header: string | undefined) {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === MEMBER_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString('hex')}`
}

export function isGuestId(value: string) {
  return /^g_[a-f0-9]{12}$/.test(value)
}

export function setCookieHeader(token: string) {
  return `${MEMBER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`
}
