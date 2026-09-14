import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { extractPageImages, extForImage, isImageContentType, looksLikeImageUrl, stripTags } from './html.ts'
import { loadRaw } from './http.ts'
import { WebError, type WebFetchProvider, type WebFetchRequest, type WebFetchResult } from './types.ts'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i
const PRIVATE_V4 = /^(10\.|192\.168\.|169\.254\.|127\.|0\.)|^(172\.(1[6-9]|2\d|3[0-1])\.)/
const MAX_CHARS = 16_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export function assertHttpUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebError('WEB_INVALID_URL', `invalid url: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError('WEB_INVALID_URL', `only http/https urls are allowed: ${raw}`)
  }
  if (url.username || url.password) {
    throw new WebError('WEB_BLOCKED_URL', `refusing urls with credentials: ${url.origin}`)
  }
  const host = url.hostname
  if (PRIVATE_HOST.test(host) || PRIVATE_V4.test(host)) {
    throw new WebError('WEB_BLOCKED_URL', `refusing private/local url: ${raw}`)
  }
  return url
}

async function saveImageFile(url: string, mime: string, bytes: Buffer) {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new WebError('WEB_PROVIDER_ERROR', `image too large: ${bytes.length} bytes`)
  }
  const dir = join(tmpdir(), 'biu-web')
  await mkdir(dir, { recursive: true })
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 12)
  const dest = join(dir, `${hash}${extForImage(mime, url)}`)
  await writeFile(dest, bytes)
  return dest
}

function sniffOrFallback(bytes: Buffer, url: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  return looksLikeImageUrl(url) ? 'image/jpeg' : 'application/octet-stream'
}

export function httpFetchProvider(): WebFetchProvider {
  return {
    id: 'http',
    available: () => true,
    async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
      const target = assertHttpUrl(request.url)
      let raw
      try {
        raw = await loadRaw(target.href, {
          signal,
          headers: looksLikeImageUrl(target.href)
            ? { Accept: 'image/*,*/*;q=0.8' }
            : { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
        })
      } catch (error) {
        if (error instanceof WebError) throw error
        throw new WebError('WEB_PROVIDER_ERROR', `fetch failed: ${String(error)}`)
      }
      const type = raw.type.toLowerCase()
      const asImage = isImageContentType(type) || (looksLikeImageUrl(target.href) && !type.includes('html'))
      if (asImage) {
        const mime = isImageContentType(type) ? type.split(';')[0]!.trim() : sniffOrFallback(raw.bytes, target.href)
        const path = await saveImageFile(raw.url || target.href, mime, raw.bytes)
        return {
          url: raw.url || target.href,
          statusCode: raw.status,
          body: {
            kind: 'file',
            content: `saved image ${mime} ${raw.bytes.length} bytes → ${path}`,
            path,
            mime,
            bytes: raw.bytes.length,
          },
          truncated: false,
        }
      }
      const text = raw.bytes.toString('utf8')
      const html = type.includes('html') || /<html[\s>]/i.test(text)
      const content = html ? stripTags(text) : text.replace(/\s+/g, ' ').trim()
      const truncated = content.length > MAX_CHARS
      const images = html ? extractPageImages(text, raw.url || target.href) : undefined
      return {
        url: raw.url || target.href,
        statusCode: raw.status,
        body: { kind: html ? 'html' : 'text', content: truncated ? content.slice(0, MAX_CHARS) : content },
        truncated,
        ...(images?.length ? { images } : {}),
      }
    },
  }
}
