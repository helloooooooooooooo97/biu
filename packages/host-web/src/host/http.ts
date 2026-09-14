import { spawn } from 'node:child_process'
import { combineSignals, fetchHeaders } from './html.ts'

function curlAvailable() {
  return new Promise<boolean>((resolve) => {
    const child = spawn('curl', ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

let curlOk: Promise<boolean> | undefined
function hasCurl() {
  curlOk ??= curlAvailable()
  return curlOk
}

function runCurl(argv: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('curl', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const err: Buffer[] = []
    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new Error('curl aborted'))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout.on('data', (chunk) => chunks.push(chunk as Buffer))
    child.stderr.on('data', (chunk) => err.push(chunk as Buffer))
    child.on('error', reject)
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code !== 0) {
        reject(new Error(`curl exited ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 200)}`))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

const UA = fetchHeaders()['User-Agent']

async function fetchText(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: fetchHeaders(init.headers),
    signal: combineSignals(init.signal),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

export async function loadText(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
  if (process.env.VITEST === 'true') return fetchText(url, init)
  const method = init.method ?? 'GET'
  if (await hasCurl()) {
    const argv = [
      '-sS',
      '--max-time',
      '15',
      '-A',
      UA,
      '-H',
      'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    ]
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      if (method === 'POST' && key.toLowerCase() === 'content-type') continue
      argv.push('-H', `${key}: ${value}`)
    }
    if (method === 'POST') argv.push('--data', init.body ?? '')
    else argv.push('-L')
    argv.push(url)
    return runCurl(argv, init.signal)
  }
  return fetchText(url, init)
}

export async function loadJson(url: string, signal?: AbortSignal) {
  const text = await loadText(url, { signal, headers: { Accept: 'application/json' } })
  return JSON.parse(text) as unknown
}

async function fetchBytes(url: string, signal?: AbortSignal) {
  const res = await fetch(url, {
    headers: fetchHeaders({ Accept: 'image/*,*/*;q=0.8' }),
    signal: combineSignals(signal),
    redirect: 'follow',
  })
  const bytes = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    url: res.url || url,
    type: res.headers.get('content-type') ?? '',
    bytes,
  }
}

function runCurlBytes(argv: string[], signal?: AbortSignal) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('curl', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const err: Buffer[] = []
    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new Error('curl aborted'))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout.on('data', (chunk) => chunks.push(chunk as Buffer))
    child.stderr.on('data', (chunk) => err.push(chunk as Buffer))
    child.on('error', reject)
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code !== 0) {
        reject(new Error(`curl exited ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 200)}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })
  })
}

function sniffImageType(bytes: Buffer, url: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes.toString('ascii', 0, 16).includes('WEBP')) return 'image/webp'
  if (bytes.toString('utf8', 0, 200).includes('<svg')) return 'image/svg+xml'
  return url
}

export async function loadBytes(url: string, signal?: AbortSignal) {
  if (process.env.VITEST === 'true') return fetchBytes(url, signal)
  if (await hasCurl()) {
    const bytes = await runCurlBytes(
      ['-sS', '-L', '--max-time', '15', '-A', UA, '-H', 'Accept: image/*,*/*;q=0.8', url],
      signal,
    )
    const sniffed = sniffImageType(bytes, '')
    return { status: 200, url, type: sniffed.startsWith('image/') ? sniffed : '', bytes }
  }
  return fetchBytes(url, signal)
}
