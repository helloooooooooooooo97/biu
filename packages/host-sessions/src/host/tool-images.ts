import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { assetsRootPath, hashedAssetRel, isHashedAssetName } from '@biu/host-plugin-loader/data-dir'
import type { LlmContentPart, LlmMessage } from '@biu/host-llm'
import { artifactMime, isImagePath, readArtifactFile } from './artifacts.ts'

/** 与用户贴图同一档：单次最多 6 张、单张 8MB。svg 视觉模型普遍不认。 */
export const MAX_TOOL_IMAGES = 6
export const MAX_TOOL_IMAGE_BYTES = 8 * 1024 * 1024

const VISION_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])

type ImageRef =
  | { key: string; kind: 'artifact'; name: string }
  | { key: string; kind: 'path'; path: string }
  | { key: string; kind: 'db'; name: string }

function isVisionMime(mime: string) {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg') return true
  return VISION_MIME.has(base)
}

function dataUrl(mime: string, data: Buffer) {
  const base = mime === 'image/jpg' ? 'image/jpeg' : mime.split(';')[0]!.trim()
  if (!isVisionMime(base) || data.length === 0 || data.length > MAX_TOOL_IMAGE_BYTES) return null
  return `data:${base};base64,${data.toString('base64')}`
}

function addRef(out: ImageRef[], seen: Set<string>, ref: ImageRef) {
  if (seen.has(ref.key) || out.length >= MAX_TOOL_IMAGES) return
  seen.add(ref.key)
  out.push(ref)
}

function isImagePayload(mime: string, nameOrPath: string) {
  if (mime.startsWith('image/') && isVisionMime(mime)) return isImagePath(nameOrPath) || Boolean(nameOrPath)
  return !mime && isImagePath(nameOrPath)
}

/**
 * Codex / Pi：只提升工具**声明**的图像产出，不扫 stdout / HTML 里出现的所有路径。
 * - bash `artifacts[]`（本步收录的截图）
 * - web_fetch `file`（本次下载的图像正文）
 * - 顶层 `{ name|path, mime|type: image/* }`（读图工具）
 */
function collectImageRefs(detail: string): ImageRef[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(detail)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const rec = parsed as Record<string, unknown>
  const out: ImageRef[] = []
  const seen = new Set<string>()

  if (Array.isArray(rec.artifacts)) {
    for (const item of rec.artifacts) {
      if (!item || typeof item !== 'object') continue
      const art = item as Record<string, unknown>
      const name = typeof art.name === 'string' ? art.name : ''
      const mime = String(art.mime ?? art.type ?? '')
      if (name && isImagePayload(mime, name)) {
        addRef(out, seen, { key: `art:${name}`, kind: 'artifact', name })
      }
    }
  }

  if (rec.file && typeof rec.file === 'object') {
    const file = rec.file as Record<string, unknown>
    const path = typeof file.path === 'string' ? file.path : ''
    const mime = String(file.mime ?? file.type ?? '')
    if (path && isImagePayload(mime, path)) {
      addRef(out, seen, { key: `path:${path}`, kind: 'path', path })
    }
  }

  const mime = String(rec.mime ?? rec.type ?? '')
  if (!rec.artifacts && !rec.file && mime.startsWith('image/') && isVisionMime(mime)) {
    if (typeof rec.name === 'string' && rec.name) {
      addRef(out, seen, { key: `db:${basename(rec.name)}`, kind: 'db', name: basename(rec.name) })
    } else if (typeof rec.path === 'string' && rec.path) {
      addRef(out, seen, { key: `path:${rec.path}`, kind: 'path', path: rec.path })
    }
  }

  return out
}

async function readDbAsset(name: string, baseDir?: string): Promise<Buffer | null> {
  const file = basename(name)
  if (!file || file.includes('..')) return null
  const root = assetsRootPath(baseDir)
  const candidates = [resolve(root, 'name', file)]
  if (isHashedAssetName(file)) {
    try {
      candidates.unshift(resolve(root, 'hash', hashedAssetRel(file)))
    } catch {
      /* invalid hash name */
    }
  }
  for (const path of candidates) {
    try {
      return await readFile(path)
    } catch {
      /* try next layout */
    }
  }
  return null
}

async function readPathImage(path: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!isImagePath(path) || path.includes('\0')) return null
  const full = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path)
  try {
    const info = await stat(full)
    if (!info.isFile() || info.size > MAX_TOOL_IMAGE_BYTES) return null
    const data = await readFile(full)
    const mime = artifactMime(full)
    if (!isVisionMime(mime)) return null
    return { mime, data }
  } catch {
    return null
  }
}

async function resolveRef(ref: ImageRef, sessionId: string, baseDir?: string): Promise<string | null> {
  if (ref.kind === 'artifact') {
    const file = await readArtifactFile(sessionId, ref.name, baseDir)
    return file ? dataUrl(file.mime, file.data) : null
  }
  if (ref.kind === 'db') {
    const data = await readDbAsset(ref.name, baseDir)
    return data ? dataUrl(artifactMime(ref.name), data) : null
  }
  const local = await readPathImage(ref.path)
  return local ? dataUrl(local.mime, local.data) : null
}

/**
 * 发给模型前：把该条工具结果里声明的图提升成 image_url。事件日志不改。
 * 对齐 Codex（只转发工具返回的 ImageContent）和 Pi（read 到图像才附图，bash 不扫盘）。
 */
export async function liftToolImages(
  messages: LlmMessage[],
  sessionId: string,
  options?: { baseDir?: string },
): Promise<LlmMessage[]> {
  if (!sessionId) return messages
  const out: LlmMessage[] = []
  for (const message of messages) {
    if (message.role !== 'tool' || typeof message.content !== 'string' || !message.content) {
      out.push(message)
      continue
    }
    const refs = collectImageRefs(message.content)
    if (!refs.length) {
      out.push(message)
      continue
    }
    const images: LlmContentPart[] = []
    for (const ref of refs) {
      if (images.length >= MAX_TOOL_IMAGES) break
      const url = await resolveRef(ref, sessionId, options?.baseDir)
      if (url) images.push({ type: 'image_url', image_url: { url } })
    }
    if (!images.length) {
      out.push(message)
      continue
    }
    out.push({
      ...message,
      content: [{ type: 'text', text: message.content }, ...images],
    })
  }
  return out
}
