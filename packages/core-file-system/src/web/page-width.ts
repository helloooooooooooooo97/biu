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

function readPagePrefs(): PagePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PagePrefs>
      return {
        wide: parsed.wide === true,
        outlineExpand: parsed.outlineExpand !== false,
        outlinePin: parsed.outlinePin === true,
        navPin: parsed.navPin === true,
        bodySize: asScale(parsed.bodySize, 'md'),
        bodyGap: asScale(parsed.bodyGap, 'md'),
      }
    }
    return { ...DEFAULT_PREFS, wide: localStorage.getItem(LEGACY_WIDTH_KEY) === 'full' }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

let prefs: PagePrefs = readPagePrefs()
let pageWidthVersion = 0
const listeners = new Set<() => void>()

function emit() {
  pageWidthVersion += 1
  applyPagePrefs(prefs)
  for (const fn of listeners) fn()
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
  const next: PagePrefs = { ...prefs, ...patch }
  if (JSON.stringify(next) === JSON.stringify(prefs)) return
  prefs = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    localStorage.setItem(LEGACY_WIDTH_KEY, next.wide ? 'full' : 'max')
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('biu:page-prefs'))
  emit()
}

export function persistPageWidth(next: PageWidth) {
  persistPagePrefs({ wide: next === 'full' })
}

applyPagePrefs()
