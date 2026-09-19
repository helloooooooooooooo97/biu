import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
export { BIU_SQLITE, EVENTS_SQLITE, adoptTwoSqlite } from './sqlite-two.ts'
export {
  contentAddressHash,
  hashedAssetName,
  hashedAssetRel,
  isHashedAssetName,
  writeContentAddressed,
  readContentAddressed,
} from './asset-cas.ts'
import { adoptTwoSqlite } from './sqlite-two.ts'

export const DATA_DIR_NAME = '.biu'
export const LEGACY_DATA_DIR_NAME = '.cordis'
export const LEGACY_PAGE_ROOT = '.page'
export const PAGE_ROOT = `${DATA_DIR_NAME}/page`
export const PAGE_DB = `${DATA_DIR_NAME}/biu.sqlite`
/** Leftover page-only folder; new files go under `.biu/assets`. */
export const PAGE_ASSETS = `${DATA_DIR_NAME}/page/assets`
export const ASSETS_ROOT = `${DATA_DIR_NAME}/assets`
export const PAGE_ASSET_LAYER = 'page'
export const DB_ASSET_LAYER = 'db'

/** Unique attachment root: `.biu/assets/<ab>/<cd>/<hash>.<ext>`. Layer folders are leftover reads. */

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
  mkdirSync(join(toRoot, DATA_DIR_NAME, 'assets', PAGE_ASSET_LAYER), { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    if (name === 'assets' && statSync(from).isDirectory()) {
      moveIfAbsent(from, join(toRoot, DATA_DIR_NAME, 'assets', PAGE_ASSET_LAYER))
      continue
    }
    if (name === 'pages.sqlite' || name.startsWith('pages.sqlite')) {
      moveIfAbsent(from, join(toRoot, DATA_DIR_NAME, name.replace(/^pages\.sqlite/, 'biu.sqlite')))
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
  adoptTwoSqlite(dest)
  return dest
}

/** Packaged Electron sets BIU_HOME to userData so replacing the .app does not wipe notes. */
export function dataHome(): string {
  return process.env.BIU_HOME || process.cwd()
}

export function dataDir(parent = dataHome()): string {
  return migrateDataDir(parent)
}

export function dataPath(parent = dataHome(), ...parts: string[]): string {
  return join(dataDir(parent), ...parts)
}

/** Leftover `.biu/assets/page` or `.biu/assets/db` for reading old files. */
export function assetsLayerPath(parent = dataHome(), layer: string): string {
  return dataPath(parent, 'assets', layer)
}

export function assetsRootPath(parent = dataHome()): string {
  return dataPath(parent, 'assets')
}

function copyMerge(src: string, dest: string) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    const to = join(dest, name)
    if (!existsSync(to)) {
      cpSync(from, to, { recursive: true })
      continue
    }
    const fromStat = statSync(from)
    const toStat = statSync(to)
    if (fromStat.isDirectory() && toStat.isDirectory()) copyMerge(from, to)
  }
}

/**
 * Copy leftover pack-host / cwd data into the durable home.
 * Destination already-present files win. Plugin trees are copied, never renamed out of the app bundle.
 */
export function adoptPackedUserData(fromRoot: string, dataRoot = dataHome(), workspace = join(dataRoot, 'workspace')) {
  const from = resolve(fromRoot)
  const dest = resolve(dataRoot)
  migrateDataDir(from)
  migrateDataDir(dest)
  if (from === dest) {
    migrateLegacyPageDir(from, dest)
    return dest
  }
  copyMerge(join(from, DATA_DIR_NAME), join(dest, DATA_DIR_NAME))
  migrateLegacyPageDir(from, dest)
  for (const name of ['.plugin', '.plugin-dev', '.workspace']) {
    copyMerge(join(from, name), join(workspace, name))
  }
  for (const name of [DATA_DIR_NAME, LEGACY_DATA_DIR_NAME, LEGACY_PAGE_ROOT]) {
    try {
      rmSync(join(from, name), { recursive: true, force: true })
    } catch {
      /* signed / read-only pack-host */
    }
  }
  return dest
}
