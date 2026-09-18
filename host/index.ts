import { Context } from 'cordis'
import { importConfiguredPackage, readCordisConfig, findRepoRoot } from '@biu/host-plugin-loader'
import { migrateDataDir } from '@biu/host-plugin-loader/data-dir'
import { lanIPv4, printReadyBanner } from './banner.ts'
import './types.ts'

const rootDir = findRepoRoot()
migrateDataDir(process.env.BIU_HOME || rootDir)

const ctx = new Context()
ctx.logger.exporter({
  export(message) {
    const time = new Date(message.ts).toISOString().slice(11, 23)
    const args = message.args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ')
    console.log(`${time} ${message.type.padEnd(5)} ${message.name} ${args}`)
  },
})

let sharePort = 0
let resolveHostReady!: (port: number) => void
const hostReady = new Promise<number>((resolve) => {
  resolveHostReady = resolve
})
ctx.on('http/share-ready', ({ port }) => {
  sharePort = port
})
ctx.on('http/ready', ({ port: ready }) => {
  resolveHostReady(ready)
  const ui = process.env.SHARE_PROXY_UI ? 'http://127.0.0.1:5173/' : `http://127.0.0.1:${ready}/`
  const api = `http://127.0.0.1:${ready}/`
  if (process.env.SHARE_PROXY_UI) {
    ctx.logger('boot').info(`api ${api}  ·  ui ${ui}`)
    return
  }
  const paint = () => {
    const lan = lanIPv4()
    const share =
      sharePort > 0 ? `http://${lan ?? '127.0.0.1'}:${sharePort}/share` : undefined
    printReadyBanner({ ui, api, share })
  }
  if (sharePort > 0) paint()
  else setTimeout(paint, 80)
})

async function boot() {
  const config = readCordisConfig(rootDir)
  for (const item of config.host ?? []) {
    if (!item.package || item.enabled === false) continue
    const mod = await importConfiguredPackage(rootDir, item.package)
    await ctx.plugin(mod, item.config)
  }
  const port = await hostReady
  process.send?.({ type: 'biu:host-ready', port })
}

boot().catch((error) => {
  console.error('boot failed', error)
  process.exit(1)
})
