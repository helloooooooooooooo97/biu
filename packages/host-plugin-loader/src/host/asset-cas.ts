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
