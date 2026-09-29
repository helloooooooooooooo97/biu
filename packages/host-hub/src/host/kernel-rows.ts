import type { CordisPluginEntry } from '@biu/host-plugin-loader'

export function kernelCatalogRows(entries: CordisPluginEntry[], layer: 'host' | 'web') {
  return entries.map((item) => ({
    id: item.id,
    name: item.name || item.id,
    layer,
    blurb: item.blurb || item.package || '',
    inject: [] as string[],
    togglable: false,
    enabled: true,
    state: 'active',
    ...(item.package ? { packageName: item.package } : {}),
    ...(item.web ? { web: item.web } : {}),
  }))
}
