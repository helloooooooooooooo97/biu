import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'

export type ThemeMode = 'light' | 'dark'

export type WorkspaceProfile = {
  name: string
  avatar: string
  theme: ThemeMode
}

const EMPTY: WorkspaceProfile = { name: '', avatar: '', theme: 'light' }

function parseTheme(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : 'light'
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
    }
  } catch {
    return { ...EMPTY }
  }
}

export function writeWorkspaceProfile(next: Partial<WorkspaceProfile>): WorkspaceProfile {
  const current = readWorkspaceProfile()
  const saved: WorkspaceProfile = {
    name: String(next.name ?? current.name).trim().slice(0, 40),
    avatar: String(next.avatar ?? current.avatar).trim(),
    theme: parseTheme(next.theme ?? current.theme),
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
    displayName: profile.name || '用户',
  }
}
