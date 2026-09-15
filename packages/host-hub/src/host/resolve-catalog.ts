import type { Plugin } from 'cordis'
import type { CatalogEntry } from './catalog.ts'
import {
  findRepoRoot,
  importConfiguredPackage,
  pluginWebSpecifier,
  readCordisPlugins,
  type CordisPluginEntry,
} from '@biu/host-plugin-loader'
import { filterPluginEntries, runtimeMode } from '@biu/host-plugin-loader/runtime'

const rootDir = findRepoRoot()

export function pluginCatalogLayer(item: CordisPluginEntry): CatalogEntry['layer'] {
  if (item.layer === 'web') return 'web'
  if (item.layer === 'core') return 'core'
  const pkg = item.package ?? ''
  if (item.id.startsWith('core-') || /(^|\/)core-/.test(pkg)) return 'core'
  return 'capability'
}

/** 只读 cordis.plugins.json 的 plugins 表。 */
export async function resolveCatalog(): Promise<CatalogEntry[]> {
  const external = filterPluginEntries(readCordisPlugins(rootDir), runtimeMode())
  const entries: CatalogEntry[] = []
  const seen = new Set<string>()

  for (const item of external) {
    if (!item.id || !item.package) {
      throw new Error('cordis.plugins.json entry requires id + package')
    }
    if (seen.has(item.id)) {
      throw new Error(`duplicate plugin id in cordis.plugins.json: ${item.id}`)
    }
    const mod = (await importConfiguredPackage(rootDir, item.package)) as Plugin & { inject?: string[] }
    entries.push(toCatalogEntry(item, mod))
    seen.add(item.id)
  }

  return entries
}

function toCatalogEntry(item: CordisPluginEntry, mod: Plugin & { inject?: string[] }): CatalogEntry {
  const layer = pluginCatalogLayer(item)
  return {
    id: item.id,
    name: item.name || item.id,
    layer,
    blurb: item.blurb || '',
    plugin: mod,
    inject: mod.inject,
    togglable: layer === 'core' ? false : item.togglable !== false,
    enabled: item.enabled !== false,
    config: item.config,
    web: pluginWebSpecifier(item),
    packageName: item.package,
  }
}
