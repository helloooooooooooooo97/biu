import { Context } from 'cordis'
import './types.ts'
import './style.css'
import { applyStoredTheme } from '@biu/web-app-shell/theme'
import { applyPagePrefs } from '../packages/core-file-system/src/web/page-width.ts'
import { webRuntimeLoaders } from 'virtual:cordis-web-runtime'
import { isShareHref, mountShareApp } from './share-mount.tsx'

applyStoredTheme()
applyPagePrefs()

const el = document.querySelector<HTMLElement>('#app')
if (!el) throw new Error('#app missing')

/** 不用 top-level await：入口 chunk 还 export 了 cordis Service，
 *  异步分包会再 import 入口；TLA 未结束时 Chrome/Edge 会死锁，Safari 较宽松。 */
export const webBoot = (async () => {
  if (isShareHref()) {
    mountShareApp(el)
    return
  }
  const ctx = new Context()
  for (const item of webRuntimeLoaders) {
    const mod = await item.load()
    const extra = item.id === 'react-host' ? { el } : item.config ?? undefined
    await ctx.plugin(mod, extra)
  }
})()
