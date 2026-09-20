import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'

export type ThemeMode = 'light' | 'dark'
export type BodyScale = 'sm' | 'md' | 'lg'

export type PagePrefs = {
  wide: boolean
  outlineExpand: boolean
  outlinePin: boolean
  navPin: boolean
  bodySize: BodyScale
  bodyGap: BodyScale
}

export const DEFAULT_PAGE_PREFS: PagePrefs = {
  wide: false,
  outlineExpand: true,
  outlinePin: false,
  navPin: false,
  bodySize: 'md',
  bodyGap: 'md',
}

export type WorkspaceProfile = {
  name: string
  avatar: string
  theme: ThemeMode
  pagePrefs: PagePrefs
}

const EMPTY: WorkspaceProfile = { name: '', avatar: '', theme: 'light', pagePrefs: { ...DEFAULT_PAGE_PREFS } }
const SCALES = new Set<BodyScale>(['sm', 'md', 'lg'])

function parseTheme(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : 'light'
}

function asScale(value: unknown, fallback: BodyScale): BodyScale {
  return typeof value === 'string' && SCALES.has(value as BodyScale) ? (value as BodyScale) : fallback
}

export function parsePagePrefs(value: unknown, fallback: PagePrefs = DEFAULT_PAGE_PREFS): PagePrefs {
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

export function workspaceProfilePath() {
  return process.env.BIU_PROFILE || dataPath(dataHome(), 'profile.json')
}

export function readWorkspaceProfile(): WorkspaceProfile {
  try {
    const raw = JSON.parse(readFileSync(workspaceProfilePath(), 'utf8')) as Partial<WorkspaceProfile>
    return {
      name: String(raw.name ?? '').trim().slice(0, 40),
      avatar: String(raw.avatar ?? '').trim(),
      theme: parseTheme(raw.theme),
      pagePrefs: parsePagePrefs(raw.pagePrefs),
    }
  } catch {
    return { ...EMPTY }
  }
}

export function writeWorkspaceProfile(next: Partial<Omit<WorkspaceProfile, 'pagePrefs'>> & { pagePrefs?: unknown }): WorkspaceProfile {
  const current = readWorkspaceProfile()
  const saved: WorkspaceProfile = {
    name: String(next.name ?? current.name).trim().slice(0, 40),
    avatar: String(next.avatar ?? current.avatar).trim(),
    theme: parseTheme(next.theme ?? current.theme),
    pagePrefs: next.pagePrefs ? parsePagePrefs(next.pagePrefs, current.pagePrefs) : current.pagePrefs,
  }
  if (saved.avatar && !saved.avatar.startsWith('data:image/')) saved.avatar = ''
  if (saved.avatar.length > 240_000) throw new Error('avatar too large')
  const file = workspaceProfilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`)
  return saved
}

export function profileExists() {
  return existsSync(workspaceProfilePath())
}

export function asPublicProfile(profile = readWorkspaceProfile()) {
  return {
    name: profile.name,
    avatar: profile.avatar,
    theme: profile.theme,
    pagePrefs: profile.pagePrefs,
    displayName: profile.name || '用户',
  }
}
