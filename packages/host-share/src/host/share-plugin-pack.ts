import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

function isSharePluginId(id: string) {
  return /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(id)
}

const SKIP = new Set(['node_modules', '.git', '.DS_Store'])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff)
}

function u32(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff)
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function zipByteFiles(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name.replace(/\\/g, '/'))
    const data = file.data
    const crc = crc32(data)
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ])
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const center = concat(centrals)
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(center.length), u32(offset), u16(0)])
  return concat([...locals, center, end])
}

function pluginRoot(cwd: string, id: string) {
  const sandbox = resolve(join(cwd, '.plugin-dev', id))
  const installed = resolve(join(cwd, '.plugin', id))
  if (existsSync(sandbox)) return sandbox
  if (existsSync(installed)) return installed
  return ''
}

function walkFiles(root: string, dir: string, out: Array<{ name: string; data: Uint8Array }>) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkFiles(root, full, out)
      continue
    }
    const rel = relative(root, full).split(sep).join('/')
    if (!rel || rel.startsWith('..')) continue
    out.push({ name: rel, data: new Uint8Array(readFileSync(full)) })
  }
}

export function readSharePluginWebJs(cwd: string, id: string): string | null {
  if (!isSharePluginId(id)) return null
  const cwdResolved = resolve(cwd)
  for (const file of [
    resolve(join(cwd, '.plugin', id, 'web.js')),
    resolve(join(cwd, '.plugin-dev', id, 'web.js')),
  ]) {
    if (!file.startsWith(cwdResolved + sep) && file !== cwdResolved) continue
    if (!existsSync(file)) continue
    return readFileSync(file, 'utf8')
  }
  return null
}

export function zipSharePluginSource(cwd: string, id: string): Uint8Array | null {
  if (!isSharePluginId(id)) return null
  const root = pluginRoot(cwd, id)
  if (!root) return null
  const cwdResolved = resolve(cwd)
  if (!root.startsWith(cwdResolved + sep) && root !== cwdResolved) return null
  const files: Array<{ name: string; data: Uint8Array }> = []
  walkFiles(root, root, files)
  if (!files.length) return null
  return zipByteFiles(files.map((file) => ({ name: `${id}/${file.name}`, data: file.data })))
}
