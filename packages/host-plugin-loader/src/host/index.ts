import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Plugin as VitePlugin } from 'vite'

export interface CordisPluginEntry {
  id: string
  name?: string
  package?: string
  /** 前端入口 specifier，如 @biu/core-chat/web */
  web?: string
  layer?: string
  blurb?: string
  togglable?: boolean
  enabled?: boolean
  config?: unknown
}

export type CordisConfig = {
  host?: CordisPluginEntry[]
  web?: CordisPluginEntry[]
  plugins?: CordisPluginEntry[]
}

const VIRTUAL_UI = 'virtual:cordis-ui-loaders'
const RESOLVED_UI = `\0${VIRTUAL_UI}`
const VIRTUAL_WEB = 'virtual:cordis-web-runtime'
const RESOLVED_WEB = `\0${VIRTUAL_WEB}`
const PACKAGED_MODULES = Symbol.for('biu.packagedHostModules')

export { DATA_DIR_NAME, LEGACY_DATA_DIR_NAME, adoptPackedUserData, dataDir, dataHome, dataPath, assetsRootPath, migrateDataDir, migrateLegacyPageDir, LEGACY_PAGE_ROOT, PAGE_ROOT, PAGE_DB, PAGE_ASSETS, ASSETS_ROOT } from './data-dir.ts'
export {
  contentAddressHash,
  hashedAssetName,
  hashedAssetRel,
  isHashedAssetName,
  writeContentAddressed,
  readContentAddressed,
  writeDocument,
  readDocument,
  AssetConflictError,
  parseIfMatch,
} from './asset-cas.ts'
export { adoptCasAssets, listCasAssetFiles, listDocAssetFiles } from './adopt-cas-assets.ts'
export { openSqlite, configureSqlite, quoteSqlitePath, SQLITE_BUSY_TIMEOUT_MS, SQLITE_WAL_AUTOCHECKPOINT } from './sqlite-open.ts'
export { ensureBiuAssetSchema, LATEST_BIU_SCHEMA, createLatestSchema } from './biu-schema.ts'
export { migrateBiu, openAndMigrateBiu } from './biu-migrate.ts'
export { migrateEvents, openAndMigrateEvents, LATEST_EVENTS_SCHEMA } from './events-migrate.ts'

export function pluginWebSpecifier(item: CordisPluginEntry): string | undefined {
  return item.web
}

export function findRepoRoot(start = fileURLToPath(import.meta.url)): string {
  let dir = dirname(start)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'cordis.plugins.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function splitPackageRef(specifier: string): { name: string; subpath: string } {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length <= 2) return { name: specifier, subpath: '.' }
    return { name: `${parts[0]}/${parts[1]}`, subpath: `./${parts.slice(2).join('/')}` }
  }
  const slash = specifier.indexOf('/')
  if (slash === -1) return { name: specifier, subpath: '.' }
  return { name: specifier.slice(0, slash), subpath: `.${specifier.slice(slash)}` }
}

export function readCordisConfig(root: string): CordisConfig {
  const path = join(root, 'cordis.plugins.json')
  if (!existsSync(path)) return {}
  const body = JSON.parse(readFileSync(path, 'utf8')) as CordisConfig
  return {
    host: Array.isArray(body.host) ? body.host : [],
    web: Array.isArray(body.web) ? body.web : [],
    plugins: Array.isArray(body.plugins) ? body.plugins : [],
  }
}

export function readCordisPlugins(root: string): CordisPluginEntry[] {
  return readCordisConfig(root).plugins ?? []
}

export function allConfiguredEntries(root: string): CordisPluginEntry[] {
  const config = readCordisConfig(root)
  return [...(config.host ?? []), ...(config.web ?? []), ...(config.plugins ?? [])]
}

export function findWorkspacePackageDir(root: string, packageName: string): string | null {
  const { name } = splitPackageRef(packageName)
  const base = join(root, 'packages')
  if (!existsSync(base)) return null
  for (const dir of readdirSync(base)) {
    const pkgFile = join(base, dir, 'package.json')
    if (!existsSync(pkgFile)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { name?: string }
      if (pkg.name === name) return join(base, dir)
    } catch {
      /* skip */
    }
  }
  return null
}

function exportRel(
  exp: string | { default?: string; import?: string } | undefined,
  fallback: string,
) {
  if (typeof exp === 'string') return exp
  if (exp && typeof exp === 'object') return exp.import || exp.default || fallback
  return fallback
}

export function packageEntryFile(pkgDir: string, specifier = '.'): string {
  const { subpath } = specifier.startsWith('.') || specifier === '.' ? { subpath: specifier } : splitPackageRef(specifier)
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | { default?: string; import?: string }>
    main?: string
  }
  const key = subpath === '.' ? '.' : subpath
  const rel = exportRel(pkg.exports?.[key], pkg.main || 'src/index.ts')
  return join(pkgDir, rel)
}

export async function importConfiguredPackage(root: string, packageName: string) {
  const packaged = (globalThis as any)[PACKAGED_MODULES] as Record<string, () => Promise<unknown>> | undefined
  if (packaged && Object.prototype.hasOwnProperty.call(packaged, packageName)) {
    return packaged[packageName]()
  }
  const dir = findWorkspacePackageDir(root, packageName)
  if (dir) {
    const entry = packageEntryFile(dir, packageName)
    return import(pathToFileURL(entry).href)
  }
  return import(packageName)
}

export function linkConfiguredPackages(root: string) {
  const names = new Set<string>()
  for (const item of allConfiguredEntries(root)) {
    if (item.package) names.add(splitPackageRef(item.package).name)
    const web = pluginWebSpecifier(item)
    if (web) names.add(splitPackageRef(web).name)
  }
  for (const name of names) {
    const dir = findWorkspacePackageDir(root, name)
    if (!dir) {
      console.warn(`[cordis-plugins] package not found under packages/*: ${name}`)
      continue
    }
    const linkPath = join(root, 'node_modules', ...name.split('/'))
    mkdirSync(dirname(linkPath), { recursive: true })
    try {
      const stat = lstatSync(linkPath)
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        rmSync(linkPath, { recursive: true, force: true })
      }
    } catch {
      // 路径不存在或没有权限时忽略
    }
    try {
      symlinkSync(dir, linkPath, 'dir')
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e
    }
  }
}

function posix(path: string) {
  return path.replace(/\\/g, '/')
}

/** Vite：能力 web loaders + web 内核加载列表。主仓源码不出现具体包名。 */
export function cordisPluginsVite(root = process.cwd()): VitePlugin {
  return {
    name: 'cordis-plugins',
    resolveId(id) {
      if (id === VIRTUAL_UI) return RESOLVED_UI
      if (id === VIRTUAL_WEB) return RESOLVED_WEB
    },
    load(id) {
      if (id === RESOLVED_UI) {
        const lines: string[] = []
        for (const item of allConfiguredEntries(root)) {
          const web = pluginWebSpecifier(item)
          if (!web) continue
          const dir = findWorkspacePackageDir(root, web)
          if (!dir) {
            console.warn(`[cordis-plugins] web package missing: ${web}`)
            continue
          }
          const entry = posix(packageEntryFile(dir, web))
          lines.push(`  ${JSON.stringify(web)}: () => import(${JSON.stringify(entry)}),`)
        }
        return `export const uiPackageLoaders = {\n${lines.join('\n')}\n}\n`
      }
      if (id === RESOLVED_WEB) {
        const lines: string[] = []
        for (const item of readCordisConfig(root).web ?? []) {
          if (!item.package) continue
          const dir = findWorkspacePackageDir(root, item.package)
          if (!dir) {
            console.warn(`[cordis-plugins] web package missing: ${item.package}`)
            continue
          }
          const entry = posix(packageEntryFile(dir, item.package))
          lines.push(
            `  { id: ${JSON.stringify(item.id)}, load: () => import(${JSON.stringify(entry)}), config: ${JSON.stringify(item.config ?? null)} },`,
          )
        }
        return `export const webRuntimeLoaders = [\n${lines.join('\n')}\n]\n`
      }
      return null
    },
  }
}
