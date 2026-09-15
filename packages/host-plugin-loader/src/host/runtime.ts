import type { CordisConfig, CordisPluginEntry } from './index.ts'

export type RuntimeMode = 'client' | 'collab'

export const COLLAB_HOST_IDS = ['http', 'tools', 'hub'] as const
export const COLLAB_PLUGIN_IDS = ['core-file-system', 'core-page', 'core-collab'] as const

export function runtimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const raw = String(env.BIU_MODE ?? 'client').trim().toLowerCase()
  if (raw === 'collab' || raw === 'sync' || raw === 'collaborative') return 'collab'
  return 'client'
}

export function collabUrlFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return String(env.BIU_COLLAB_URL ?? '').trim().replace(/\/$/, '')
}

export function filterHostEntries(entries: CordisPluginEntry[], mode: RuntimeMode) {
  if (mode !== 'collab') return entries
  const allow = new Set<string>(COLLAB_HOST_IDS)
  return entries.filter((item) => allow.has(item.id))
}

export function filterPluginEntries(entries: CordisPluginEntry[], mode: RuntimeMode) {
  if (mode !== 'collab') return entries
  const allow = new Set<string>(COLLAB_PLUGIN_IDS)
  return entries.filter((item) => allow.has(item.id))
}

export function filterCordisConfig(config: CordisConfig, mode: RuntimeMode): CordisConfig {
  return {
    host: filterHostEntries(config.host ?? [], mode),
    web: config.web,
    plugins: filterPluginEntries(config.plugins ?? [], mode),
  }
}
