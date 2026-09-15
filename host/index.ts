import { Context } from 'cordis'
import { importConfiguredPackage, readCordisConfig, findRepoRoot } from '@biu/host-plugin-loader'
import { migrateDataDir } from '@biu/host-plugin-loader/data-dir'
import './types.ts'

const rootDir = findRepoRoot()
migrateDataDir(rootDir)

const ctx = new Context()
ctx.logger.exporter({
  export(message) {
    const time = new Date(message.ts).toISOString().slice(11, 23)
    const args = message.args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ')
    console.log(`${time} ${message.type.padEnd(5)} ${message.name} ${args}`)
  },
})
ctx.on('http/ready', ({ port: ready }) => {
  const ui = process.env.SHARE_PROXY_UI ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${ready}`
  ctx.logger('boot').info(`api http://127.0.0.1:${ready}  ·  ui ${ui}`)
})

async function boot() {
  const config = readCordisConfig(rootDir)
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
