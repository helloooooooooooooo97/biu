export type ThemeMode = 'light' | 'dark'

let current: ThemeMode | null = null

export function readTheme(): ThemeMode {
  if (current === 'dark' || current === 'light') return current
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) return 'dark'
    if (document.documentElement.classList.contains('light')) return 'light'
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode) {
  current = mode
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', mode)
}

export function persistTheme(mode: ThemeMode) {
  applyTheme(mode)
  void fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: mode }),
  }).catch(() => undefined)
}

export function applyStoredTheme() {
  applyTheme(readTheme())
}

/** 从 workspace profile 读主题，不经过 localStorage。 */
export async function hydrateTheme() {
  try {
    const res = await fetch('/api/profile')
    if (!res.ok) {
      applyStoredTheme()
      return readTheme()
    }
    const data = (await res.json()) as { theme?: unknown }
    if (data.theme !== 'dark' && data.theme !== 'light') {
      applyStoredTheme()
      return readTheme()
    }
    applyTheme(data.theme)
    return data.theme
  } catch {
    applyStoredTheme()
    return readTheme()
  }
}
