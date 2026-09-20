import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { assetsRootPath, hashedAssetRel, isHashedAssetName } from '@biu/host-plugin-loader/data-dir'
import { assetNameFromUrl } from '@biu/type-file-system'
import type { LlmContentPart, LlmMessage } from '@biu/host-llm'
import {
  artifactMime,
  extractImagePathCandidates,
  isImagePath,
  readArtifactFile,
} from './artifacts.ts'

/** 与用户贴图同一档：单次最多 6 张、单张 8MB。svg 视觉模型普遍不认。 */
export const MAX_TOOL_IMAGES = 6
export const MAX_TOOL_IMAGE_BYTES = 8 * 1024 * 1024

const VISION_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])

type ImageRef =
  | { key: string; kind: 'artifact'; name: string }
  | { key: string; kind: 'path'; path: string }
  | { key: string; kind: 'db'; name: string }
  | { key: string; kind: 'data'; url: string }

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

function collectImageRefs(detail: string, sessionId: string): ImageRef[] {
  const out: ImageRef[] = []
  const seen = new Set<string>()

  const fromString = (value: string) => {
    const text = value.trim()
    if (!text) return
    if (text.startsWith('data:image/') && !text.startsWith('data:image/svg')) {
      addRef(out, seen, { key: `data:${text.slice(0, 48)}`, kind: 'data', url: text })
      return
    }
    const artifact = text.match(/\/api\/sessions\/[^/]+\/artifacts\/([^/?#]+)/)
    if (artifact?.[1]) {
      const name = decodeURIComponent(artifact[1])
      if (isImagePath(name)) addRef(out, seen, { key: `art:${name}`, kind: 'artifact', name })
      return
    }
    const db = assetNameFromUrl(text)
    if (db && isImagePath(db)) {
      addRef(out, seen, { key: `db:${db}`, kind: 'db', name: db })
      return
    }
    if (isImagePath(text.split('?')[0] ?? text) && !/^https?:\/\//i.test(text)) {
      addRef(out, seen, { key: `path:${text}`, kind: 'path', path: text })
    }
  }

  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || value == null || out.length >= MAX_TOOL_IMAGES) return
    if (typeof value === 'string') {
      fromString(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const rec = value as Record<string, unknown>
    const mime = String(rec.mime ?? rec.type ?? '')
    if (typeof rec.name === 'string' && isImagePath(rec.name) && (mime.startsWith('image/') || !mime)) {
      addRef(out, seen, { key: `art:${rec.name}`, kind: 'artifact', name: rec.name })
    }
    if (typeof rec.path === 'string' && (mime.startsWith('image/') || isImagePath(rec.path))) {
      fromString(rec.path)
    }
    for (const nested of Object.values(rec)) walk(nested, depth + 1)
  }

  try {
    walk(JSON.parse(detail), 0)
  } catch {
    fromString(detail)
    for (const path of extractImagePathCandidates(detail)) fromString(path)
    const dbHits = detail.matchAll(/\/api\/(?:db|page|doc)\/file\/([^\s)"']+)/g)
    for (const hit of dbHits) fromString(`/api/db/file/${hit[1]}`)
    const artHits = detail.matchAll(/\/api\/sessions\/[^/]+\/artifacts\/([^/?#]+)/g)
    for (const hit of artHits) fromString(`/api/sessions/${sessionId}/artifacts/${hit[1]}`)
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

async function resolveRef(
  ref: ImageRef,
  sessionId: string,
  baseDir?: string,
): Promise<string | null> {
  if (ref.kind === 'data') return ref.url.length > MAX_TOOL_IMAGE_BYTES * 1.4 ? null : ref.url
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
 * Claude Code / Cursor 一类做法：工具 JSON 里只留路径，发给模型前把能读到的图
 * 提升成 content 里的 image_url（data URL）。事件日志不改。
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
    const refs = collectImageRefs(message.content, sessionId)
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
