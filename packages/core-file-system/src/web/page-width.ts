export type PageWidth = 'max' | 'full'
export type BodyScale = 'sm' | 'md' | 'lg'

export type PagePrefs = {
  wide: boolean
  outlineExpand: boolean
  outlinePin: boolean
  navPin: boolean
  bodySize: BodyScale
  bodyGap: BodyScale
}

const KEY = 'fsdb.pagePrefs'
const LEGACY_WIDTH_KEY = 'fsdb.pageWidth'
const SCALES = new Set<BodyScale>(['sm', 'md', 'lg'])

const DEFAULT_PREFS: PagePrefs = {
  wide: false,
  outlineExpand: true,
  outlinePin: false,
  navPin: false,
  bodySize: 'md',
  bodyGap: 'md',
}

function asScale(value: unknown, fallback: BodyScale): BodyScale {
  return typeof value === 'string' && SCALES.has(value as BodyScale) ? (value as BodyScale) : fallback
}

export function parsePagePrefs(value: unknown, fallback: PagePrefs = DEFAULT_PREFS): PagePrefs {
  if (!value || typeof value !== 'object') return { ...fallback }
  const rec = value as Partial<PagePrefs>
  return {
    wide: rec.wide === true,
    outlineExpand: rec.outlineExpand !== false,
    outlinePin: rec.outlinePin === true,
    navPin: rec.navPin === true,
    bodySize: asScale(rec.bodySize, fallback.bodySize),
    bodyGap: asScale(rec.bodyGap, fallback.bodyGap),
  }
}

function readCachedPagePrefs(): PagePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return parsePagePrefs(JSON.parse(raw) as unknown)
    return { ...DEFAULT_PREFS, wide: localStorage.getItem(LEGACY_WIDTH_KEY) === 'full' }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writeCachedPagePrefs(next: PagePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    localStorage.setItem(LEGACY_WIDTH_KEY, next.wide ? 'full' : 'max')
  } catch {
    /* ignore */
  }
}

function postPagePrefs(next: PagePrefs) {
  if (typeof fetch === 'undefined') return
  void fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pagePrefs: next }),
  }).catch(() => undefined)
}

let prefs: PagePrefs = typeof localStorage === 'undefined' ? { ...DEFAULT_PREFS } : readCachedPagePrefs()
let pageWidthVersion = 0
const listeners = new Set<() => void>()

function emit() {
  pageWidthVersion += 1
  applyPagePrefs(prefs)
  for (const fn of listeners) fn()
}

function commit(next: PagePrefs, persistRemote: boolean) {
  if (JSON.stringify(next) === JSON.stringify(prefs)) return
  prefs = next
  writeCachedPagePrefs(next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('biu:page-prefs'))
  emit()
  if (persistRemote) postPagePrefs(next)
}

export function getPagePrefs() {
  return prefs
}

export function getPageWidth() {
  return prefs.wide ? 'full' : 'max'
}

export function getPageWidthVersion() {
  return pageWidthVersion
}

export function subscribePageWidth(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function applyPagePrefs(next = prefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.widePage = next.wide ? '1' : '0'
  root.dataset.outlineExpand = next.outlineExpand ? '1' : '0'
  root.dataset.outlinePin = next.outlinePin ? '1' : '0'
  root.dataset.navPin = next.navPin ? '1' : '0'
  root.dataset.bodySize = next.bodySize
  root.dataset.bodyGap = next.bodyGap
}

export function persistPagePrefs(patch: Partial<PagePrefs>) {
  commit(parsePagePrefs({ ...prefs, ...patch }, prefs), true)
}

export function persistPageWidth(next: PageWidth) {
  persistPagePrefs({ wide: next === 'full' })
}

export async function hydratePagePrefs() {
  try {
    const res = await fetch('/api/profile')
    if (!res.ok) return getPagePrefs()
    const data = (await res.json()) as { pagePrefs?: unknown }
    if (data.pagePrefs && typeof data.pagePrefs === 'object') {
      commit(parsePagePrefs(data.pagePrefs, prefs), false)
      return prefs
    }
    postPagePrefs(prefs)
    return prefs
  } catch {
    return getPagePrefs()
  }
}

applyPagePrefs()
