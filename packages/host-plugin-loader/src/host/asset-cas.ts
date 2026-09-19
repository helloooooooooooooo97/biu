import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const HASH_RE = /^[a-f0-9]{64}(?:\.[a-z0-9]{1,12})?$/i

export function contentAddressHash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function assetExtension(hint: string) {
  const file = basename(hint.replace(/\\/g, '/'))
  const dot = file.lastIndexOf('.')
  if (dot <= 0) return ''
  const ext = file.slice(dot).toLowerCase()
  if (!/^\.[a-z0-9]{1,12}$/.test(ext)) throw new Error('invalid asset')
  return ext
}

export function hashedAssetName(bytes: Buffer, hint: string) {
  return `${contentAddressHash(bytes)}${assetExtension(hint)}`
}

export function hashedAssetRel(name: string) {
  const file = basename(name.replace(/\\/g, '/'))
  const hash = file.includes('.') ? file.slice(0, file.indexOf('.')) : file
  if (hash.length < 4) throw new Error('invalid asset')
  return join(hash.slice(0, 2), hash.slice(2, 4), file)
}

export function isHashedAssetName(name: string) {
  const file = basename(name.replace(/\\/g, '/'))
  return HASH_RE.test(file)
}

export async function writeContentAddressed(root: string, hint: string, content: string | Buffer | Uint8Array) {
  const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
  const name = hashedAssetName(bytes, hint)
  const rel = hashedAssetRel(name)
  const dest = join(root, rel)
  await mkdir(dirname(dest), { recursive: true })
  try {
    await readFile(dest)
  } catch {
    await writeFile(dest, bytes)
  }
  return { name, etag: name, bytes, rel, path: dest }
}

export async function readContentAddressed(root: string, name: string) {
  const file = basename(name.replace(/\\/g, '/'))
  if (!file || file !== name.replace(/\\/g, '/') || !isHashedAssetName(file)) throw new Error('not found')
  const bytes = await readFile(join(root, hashedAssetRel(file)))
  return { bytes, path: join(root, hashedAssetRel(file)) }
}

export class AssetConflictError extends Error {
  readonly etag: string
  constructor(etag: string) {
    super('etag conflict')
    this.name = 'AssetConflictError'
    this.etag = etag
  }
}

export function parseIfMatch(raw: unknown) {
  const text = String(raw ?? '').trim().replace(/^W\//, '').replaceAll('"', '')
  return text && text !== '*' ? text : ''
}

export async function writeDocument(root: string, name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
  const file = basename(name.replace(/\\/g, '/'))
  if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
  const next = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
  const etag = contentAddressHash(next)
  const dest = join(root, file)
  await mkdir(root, { recursive: true })
  const expected = parseIfMatch(opts?.etag)
  let current = ''
  try {
    current = contentAddressHash(await readFile(dest))
  } catch {
    current = ''
  }
  if (current) {
    if (!expected) throw new AssetConflictError(current)
    if (expected !== current) throw new AssetConflictError(current)
  } else if (expected) {
    throw new AssetConflictError('')
  }
  await writeFile(dest, next)
  return { name: file, etag, bytes: next, path: dest }
}

export async function readDocument(root: string, name: string) {
  const file = basename(name.replace(/\\/g, '/'))
  if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
  const path = join(root, file)
  const bytes = await readFile(path)
  return { bytes, path, etag: contentAddressHash(bytes) }
}
