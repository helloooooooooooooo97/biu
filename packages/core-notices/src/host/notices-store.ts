import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { recordBuiltinValues, type DbRecord } from '@biu/type-file-system'

export const NOTICE_KINDS = ['approval', 'task', 'session'] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

export type NoticeRow = {
  id: string
  title: string
  body: string
  kind: NoticeKind
  read: boolean
  href: string
  sourceKey: string
  createdAt: number
  updatedAt: number
}

export type NoticeInput = {
  title: string
  body?: string
  kind: NoticeKind
  href?: string
  sourceKey: string
}

const MAX_NOTICES = 80

function asKind(value: unknown): NoticeKind {
  return NOTICE_KINDS.includes(value as NoticeKind) ? (value as NoticeKind) : 'session'
}

export function noticeToRecord(row: NoticeRow): DbRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    read: row.read,
    href: row.href,
    sourceKey: row.sourceKey,
    ...recordBuiltinValues({ createdAt: row.createdAt, updatedAt: row.updatedAt }),
  }
}

function parseRow(raw: unknown): NoticeRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const id = String(rec.id ?? '').trim()
  const title = String(rec.title ?? '').trim()
  const sourceKey = String(rec.sourceKey ?? '').trim()
  if (!id || !title || !sourceKey) return null
  const createdAt = Number(rec.createdAt) || Date.now()
  return {
    id,
    title,
    body: String(rec.body ?? ''),
    kind: asKind(rec.kind),
    read: rec.read === true,
    href: String(rec.href ?? ''),
    sourceKey,
    createdAt,
    updatedAt: Number(rec.updatedAt) || createdAt,
  }
}

export class NoticesStore {
  private rows: NoticeRow[] = []
  private file = ''

  open(path: string) {
    this.file = path
    if (path === ':memory:') {
      this.rows = []
      return this
    }
    mkdirSync(dirname(path), { recursive: true })
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
      this.rows = Array.isArray(parsed) ? parsed.map(parseRow).filter((row): row is NoticeRow => Boolean(row)) : []
    } catch {
      this.rows = []
    }
    return this
  }

  list() {
    return [...this.rows].sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string) {
    return this.rows.find((row) => row.id === id) ?? null
  }

  push(input: NoticeInput) {
    const title = input.title.trim()
    const sourceKey = input.sourceKey.trim()
    if (!title || !sourceKey) return null
    const unread = this.rows.find((row) => row.sourceKey === sourceKey && !row.read)
    if (unread) {
      unread.title = title
      unread.body = input.body?.trim() || unread.body
      unread.href = input.href?.trim() || unread.href
      unread.updatedAt = Date.now()
      this.flush()
      return unread
    }
    const now = Date.now()
    const row: NoticeRow = {
      id: `n_${crypto.randomUUID().slice(0, 10)}`,
      title,
      body: input.body?.trim() || '',
      kind: input.kind,
      read: false,
      href: input.href?.trim() || '',
      sourceKey,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.unshift(row)
    if (this.rows.length > MAX_NOTICES) {
      const extra = this.rows.length - MAX_NOTICES
      const drop = this.rows
        .map((item, index) => ({ item, index }))
        .filter((entry) => entry.item.read)
        .slice(-extra)
      const indexes = new Set(drop.map((entry) => entry.index))
      this.rows = this.rows.filter((_, index) => !indexes.has(index)).slice(0, MAX_NOTICES)
    }
    this.flush()
    return row
  }

  update(id: string, patch: { read?: boolean }) {
    const row = this.get(id)
    if (!row) throw new Error('unknown notice')
    if (patch.read !== undefined) row.read = Boolean(patch.read)
    row.updatedAt = Date.now()
    this.flush()
    return row
  }

  remove(id: string) {
    const next = this.rows.filter((row) => row.id !== id)
    if (next.length === this.rows.length) throw new Error('unknown notice')
    this.rows = next
    this.flush()
  }

  markSourceRead(sourceKey: string) {
    const key = sourceKey.trim()
    if (!key) return 0
    let n = 0
    const now = Date.now()
    for (const row of this.rows) {
      if (row.sourceKey !== key || row.read) continue
      row.read = true
      row.updatedAt = now
      n += 1
    }
    if (n) this.flush()
    return n
  }

  clear() {
    const n = this.rows.length
    if (!n) return 0
    this.rows = []
    this.flush()
    return n
  }

  private flush() {
    if (!this.file || this.file === ':memory:') return
    writeFileSync(this.file, `${JSON.stringify(this.rows)}\n`)
  }
}
