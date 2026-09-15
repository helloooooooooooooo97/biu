import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const DATA_DIR_NAME = '.biu'
export const LEGACY_DATA_DIR_NAME = '.cordis'
export const LEGACY_PAGE_ROOT = '.page'
export const PAGE_ROOT = `${DATA_DIR_NAME}/page`
export const PAGE_DB = `${DATA_DIR_NAME}/pages.sqlite`
export const PAGE_ASSETS = `${DATA_DIR_NAME}/page/assets`

function mergeDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    const to = join(dest, name)
    if (!existsSync(to)) {
      renameSync(from, to)
      continue
    }
    const fromStat = statSync(from)
    const toStat = statSync(to)
    if (fromStat.isDirectory() && toStat.isDirectory()) mergeDir(from, to)
  }
}

function moveIfAbsent(from: string, to: string) {
  if (!existsSync(from)) return
  if (!existsSync(to)) {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    return
  }
  const fromStat = statSync(from)
  const toStat = statSync(to)
  if (fromStat.isDirectory() && toStat.isDirectory()) {
    mergeDir(from, to)
    rmSync(from, { recursive: true, force: true })
  }
}

/** Move leftover workspace `.page` into `.biu` (markdown, sqlite, assets). Dest wins. */
export function migrateLegacyPageDir(fromRoot: string, toRoot = fromRoot) {
  const src = join(fromRoot, LEGACY_PAGE_ROOT)
  if (!existsSync(src) || !statSync(src).isDirectory()) return
  mkdirSync(join(toRoot, PAGE_ROOT), { recursive: true })
  mkdirSync(join(toRoot, PAGE_ASSETS), { recursive: true })
  mkdirSync(join(toRoot, DATA_DIR_NAME, 'assets'), { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    if (name === 'assets' && statSync(from).isDirectory()) {
      moveIfAbsent(from, join(toRoot, PAGE_ASSETS))
      continue
    }
    if (name === 'pages.sqlite' || name.startsWith('pages.sqlite')) {
      moveIfAbsent(from, join(toRoot, DATA_DIR_NAME, name))
      continue
    }
    if (name.endsWith('.md')) {
      moveIfAbsent(from, join(toRoot, PAGE_ROOT, name))
    }
  }
  rmSync(src, { recursive: true, force: true })
}

/** Rename leftover `.cordis` to `.biu`. If both exist, move unique files then drop the old dir. */
export function migrateDataDir(parent: string): string {
  const dest = join(parent, DATA_DIR_NAME)
  const src = join(parent, LEGACY_DATA_DIR_NAME)
  if (existsSync(src)) {
    if (!existsSync(dest)) {
      renameSync(src, dest)
    } else {
      mergeDir(src, dest)
      rmSync(src, { recursive: true, force: true })
    }
  }
  migrateLegacyPageDir(parent)
  return dest
}

export function dataDir(parent = process.cwd()): string {
  return migrateDataDir(parent)
}

export function dataPath(parent = process.cwd(), ...parts: string[]): string {
  return join(dataDir(parent), ...parts)
}
