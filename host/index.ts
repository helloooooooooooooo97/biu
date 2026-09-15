import { Context } from 'cordis'
import { importConfiguredPackage, readCordisConfig, findRepoRoot } from '@biu/host-plugin-loader'
import { filterCordisConfig, runtimeMode } from '@biu/host-plugin-loader/runtime'
import { migrateDataDir } from '@biu/host-plugin-loader/data-dir'
import './types.ts'

const rootDir = findRepoRoot()
migrateDataDir(rootDir)

const ctx = new Context()
const mode = runtimeMode()
ctx.logger.exporter({
  export(message) {
    const time = new Date(message.ts).toISOString().slice(11, 23)
    const args = message.args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ')
    console.log(`${time} ${message.type.padEnd(5)} ${message.name} ${args}`)
  },
})
ctx.on('http/ready', ({ port: ready }) => {
  const ui = mode === 'collab' ? '协同服（无 Agent UI）' : `ui http://127.0.0.1:5173`
  ctx.logger('boot').info(`mode ${mode}  api http://127.0.0.1:${ready}  ·  ${ui}`)
})

async function boot() {
  const config = filterCordisConfig(readCordisConfig(rootDir), mode)
  ctx.logger('boot').info(`runtime ${mode} host=${(config.host ?? []).map((item) => item.id).join(',')}`)
  for (const item of config.host ?? []) {
    if (!item.package || item.enabled === false) continue
    const mod = await importConfiguredPackage(rootDir, item.package)
    await ctx.plugin(mod, item.config)
  }
}

boot().catch((error) => {
  console.error('boot failed', error)
  process.exit(1)
})
