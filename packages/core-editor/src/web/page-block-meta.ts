/** 文档里的块只认自己写下的插件 id，编辑器不猜、不查插件表。 */
export const ENABLE_PAGE_BLOCK_PLUGIN = 'biu:enable-page-block-plugin'

const HTML_KINDS = new Set(['html', 'htmlframe'])
const VIDEO_KINDS = new Set(['video'])

export function parsePageBlockMeta(raw: string) {
  const kind = raw.match(/\bkind=["']?([a-z0-9-]+)/i)?.[1] ?? 'card'
  const plugin = raw.match(/\bplugin=["']?([a-z][a-z0-9-]*)/i)?.[1] ?? ''
  const id = raw.match(/\bid=["']?([a-z0-9]{6,32})/i)?.[1] ?? ''
  const extras: Record<string, unknown> = {}
  const title = raw.match(/\btitle=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/i)
  if (title) extras.title = String(title[1] ?? title[2] ?? title[3] ?? '').trim()
  const deck = raw.match(/\bdeck=(true|false|1|0)\b/i)?.[1]
  if (deck) extras.deck = /^(true|1)$/i.test(deck)
  const width = raw.match(/\bwidth=([^\s}]+)/i)?.[1]
  if (width) {
    const parsed = parseFenceSize(width)
    if (parsed != null) extras.width = parsed
  }
  const height = raw.match(/\bheight=([^\s}]+)/i)?.[1]
  if (height) {
    const parsed = parseFenceSize(height)
    if (parsed != null) extras.height = parsed
  }
  return { kind, plugin, id, extras }
}

function parseFenceSize(raw: string): string | number | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value))
  if (/^\d+(\.\d+)?(px|%|vh|vw|em|rem)$/i.test(value)) return value
  return undefined
}

function formatFenceSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(Math.round(value))
  if (typeof value === 'string') return parseFenceSize(value) == null ? undefined : String(parseFenceSize(value))
  return undefined
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const data = JSON.parse(trimmed) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

function videoScriptFromJson(json: Record<string, unknown>, fallback: string) {
  return typeof json.script === 'string' ? json.script : fallback
}

/** HTML / iframe 块：围栏里直接写 HTML；deck / height 写在 :::pageBlock {…} 上。旧 JSON 体仍能读。 */
export function parsePageBlockData(kind: string, raw: string, extras: Record<string, unknown> = {}) {
  const json = parseJsonObject(raw)
  if (VIDEO_KINDS.has(kind)) {
    const script = json ? videoScriptFromJson(json, raw.trim()) : raw.trim()
    return { ...extras, script }
  }
  if (json) return { ...json, ...extras }
  if (HTML_KINDS.has(kind)) return { ...extras, html: raw.trim() }
  return { ...extras }
}

function formatMeta(kind: string, plugin: string, extras: string[], id = '') {
  const parts = [`kind=${kind}`]
  if (plugin) parts.push(`plugin=${plugin}`)
  if (id) parts.push(`id=${id}`)
  parts.push(...extras)
  return `{${parts.join(' ')}}`
}

function htmlFenceExtras(data: Record<string, unknown>) {
  const extras: string[] = []
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (title) extras.push(`title=${JSON.stringify(title)}`)
  if (typeof data.deck === 'boolean') extras.push(`deck=${data.deck}`)
  const width = formatFenceSize(data.width)
  if (width) extras.push(`width=${width}`)
  const height = formatFenceSize(data.height)
  if (height) extras.push(`height=${height}`)
  return extras
}

export function formatPageBlockFence(kind: string, plugin: string, data: Record<string, unknown>, id = '') {
  const body = { ...data }
  delete body.cloneFrom
  if (HTML_KINDS.has(kind)) {
    const html = typeof body.html === 'string' ? body.html : ''
    const extras = htmlFenceExtras(body)
    return `:::pageBlock ${formatMeta(kind, plugin, extras, id)}\n${html}\n:::`
  }
  if (VIDEO_KINDS.has(kind)) {
    const script = typeof body.script === 'string' ? body.script.trim() : ''
    return `:::pageBlock ${formatMeta(kind, plugin, [], id)}\n${script}\n:::`
  }
  const meta = formatMeta(kind, plugin, [], id)
  return `:::pageBlock ${meta}\n${JSON.stringify(body, null, 2)}\n:::`
}

export function requestEnablePageBlockPlugin(plugin: string, kind: string) {
  const id = plugin.trim()
  if (!id || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: id, kind } }))
}
