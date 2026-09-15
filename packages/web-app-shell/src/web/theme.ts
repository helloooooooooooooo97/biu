export const THEME_KEY = 'biu.theme'
export type ThemeMode = 'light' | 'dark'

export function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* ignore */
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', mode)
}

export function persistTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  applyTheme(mode)
}

export function applyStoredTheme() {
  applyTheme(readTheme())
}
