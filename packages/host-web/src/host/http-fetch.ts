import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { extractPageImages, extForImage, isImageContentType, looksLikeImageUrl, stripTags } from './html.ts'
import { loadBytes } from './http.ts'
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

export function httpFetchProvider(): WebFetchProvider {
  return {
    id: 'http',
    available: () => true,
    async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
      const target = assertHttpUrl(request.url)
      const wantImage = looksLikeImageUrl(target.href)
      if (wantImage) {
        try {
          const raw = await loadBytes(target.href, signal)
          const mime = isImageContentType(raw.type) ? raw.type.split(';')[0]!.trim() : sniffOrFallback(raw.bytes, target.href)
          if (!isImageContentType(mime) && !looksLikeImageUrl(target.href)) {
            throw new WebError('WEB_PROVIDER_ERROR', `not an image: ${mime || 'unknown type'}`)
          }
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
        } catch (error) {
          if (error instanceof WebError) throw error
          throw new WebError('WEB_PROVIDER_ERROR', `fetch failed: ${String(error)}`)
        }
      }

      let res: Response
      try {
        res = await fetch(target.href, {
          signal: combineFetchSignal(signal),
          headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
          redirect: 'follow',
        })
      } catch (error) {
        if (error instanceof WebError) throw error
        throw new WebError('WEB_PROVIDER_ERROR', `fetch failed: ${String(error)}`)
      }
      const type = (res.headers.get('content-type') ?? '').toLowerCase()
      if (isImageContentType(type)) {
        const bytes = Buffer.from(await res.arrayBuffer())
        const mime = type.split(';')[0]!.trim()
        const path = await saveImageFile(res.url || target.href, mime, bytes)
        return {
          url: res.url || target.href,
          statusCode: res.status,
          body: {
            kind: 'file',
            content: `saved image ${mime} ${bytes.length} bytes → ${path}`,
            path,
            mime,
            bytes: bytes.length,
          },
          truncated: false,
        }
      }
      const raw = await res.text()
      const html = type.includes('html') || /<html[\s>]/i.test(raw)
      const content = html ? stripTags(raw) : raw.replace(/\s+/g, ' ').trim()
      const truncated = content.length > MAX_CHARS
      const images = html ? extractPageImages(raw, res.url || target.href) : undefined
      return {
        url: res.url || target.href,
        statusCode: res.status,
        body: { kind: html ? 'html' : 'text', content: truncated ? content.slice(0, MAX_CHARS) : content },
        truncated,
        ...(images?.length ? { images } : {}),
      }
    },
  }
}

function sniffOrFallback(bytes: Buffer, url: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  return looksLikeImageUrl(url) ? 'image/jpeg' : 'application/octet-stream'
}

function combineFetchSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(12_000)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
