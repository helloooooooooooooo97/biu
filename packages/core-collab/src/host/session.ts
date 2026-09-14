import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

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
  if (raw.startsWith('sh.')) return ''
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

export type ShareAccess = {
  token: string
  pageId: string
  role: MemberRole
  guestId: string
  name: string
}

export function signShareAccess(secret: string, access: ShareAccess) {
  const body = Buffer.from(JSON.stringify(access), 'utf8').toString('base64url')
  const mac = createHmac('sha256', secret).update(body).digest('hex')
  return `sh.${body}.${mac}`
}

export function readShareAccess(secret: string, raw: string | undefined): ShareAccess | null {
  if (!raw?.startsWith('sh.')) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const body = parts[1]
  const mac = parts[2]
  if (!body || !mac) return null
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShareAccess
    if (!parsed.token || !parsed.pageId || !parsed.guestId || !parsed.name) return null
    if (parsed.role !== 'editor' && parsed.role !== 'viewer') return null
    return parsed
  } catch {
    return null
  }
}

export function shareTokenFromPath(pathname: string) {
  const match = String(pathname ?? '').match(/^\/share\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
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

export function clearCookieHeader() {
  return `${MEMBER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = String(stored ?? '').split(':')
  if (!salt || !hash) return false
  const next = scryptSync(String(password), salt, 32).toString('hex')
  const a = Buffer.from(hash)
  const b = Buffer.from(next)
  return a.length === b.length && timingSafeEqual(a, b)
}
