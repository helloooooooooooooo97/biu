export type PageBannerKind = 'html' | 'htmlframe'

export type PageBanner = {
  kind: PageBannerKind
  html: string
}

export function parsePageBanner(raw: unknown): PageBanner | null {
  if (raw == null || raw === false || raw === '') return null
  if (typeof raw === 'string') {
    const html = raw.trim()
    return html ? { kind: 'html', html } : null
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const kind: PageBannerKind = rec.kind === 'htmlframe' ? 'htmlframe' : 'html'
  const html = typeof rec.html === 'string' ? rec.html : typeof rec.source === 'string' ? rec.source : ''
  if (!html.trim()) return null
  return { kind, html }
}

export function bannerSrcDoc(html: string) {
  const trimmed = html.trim()
  if (/^\s*<(!doctype|html[\s>])/i.test(trimmed)) return trimmed
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;max-height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}</style></head><body>${html}</body></html>`
}
