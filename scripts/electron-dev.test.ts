import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { portOpen } from './electron-launch.mjs'

test('electron scripts compile ts and reuse busy ports', async () => {
  const pkg = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8'))
  assert.equal(pkg.scripts['electron:dev'], 'node scripts/electron-dev.mjs')
  assert.equal(pkg.scripts['electron:wait'], 'node scripts/electron-launch.mjs')
  assert.match(pkg.scripts['electron:build'], /electron-launch/)
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /electron\/main\.ts/)

  const main = await readFile(resolve(import.meta.dirname, '../electron/main.ts'), 'utf8')
  assert.match(main, /no-sandbox/)
  assert.match(main, /BIU_ELECTRON_DEV/)
  assert.match(main, /trafficLightPosition/)
  assert.match(main, /ELECTRON_CHROME_CSS/)
  assert.match(main, /biu-electron-fullscreen/)
  assert.match(main, /classList\.toggle\('biu-electron-fullscreen'/)
  assert.match(main, /:not\(\.biu-electron-fullscreen\)[^{]+\.chat-view-header \{\s*padding-left: 76px/)
  assert.doesNotMatch(main, /\.is-sidebar-collapsed > main \{\s*padding-left: 76px/)
  assert.match(main, /-webkit-app-region: drag/)
  assert.match(main, /chat-view-header/)
  assert.match(main, /is-flyout-open/)
  assert.match(main, /padding-left: 12px !important/)
  assert.match(main, /ensureBrowserPanel/)
  assert.match(main, /page-browser/)
  assert.match(main, /inspectScript/)
  assert.match(main, /__biuPickOff/)
  assert.match(main, /__biuPickRoot/)
  assert.match(main, /hitsInRect/)
  assert.match(main, /pointermove/)
  assert.match(main, /inspectedItems/)
  assert.match(main, /\{ items: inspectedItems\(info\) \}/)
  assert.match(main, /setBackgroundColor\('#191919'\)/)
  assert.match(main, /\^about:/)
  assert.match(main, /if \(browserPanelReady\) return/)
  const openHandler = main.match(/setWindowOpenHandler\(\(\{ url \}\) => \{[\s\S]*?return \{ action: 'deny' \}/)?.[0]
  assert.ok(openHandler)
  assert.match(openHandler, /view\.webContents\.loadURL\(url\)/)
  assert.doesNotMatch(openHandler, /openExternal/)

  const tsconfig = await readFile(resolve(import.meta.dirname, '../electron/tsconfig.json'), 'utf8')
  assert.doesNotMatch(tsconfig, /"noEmit": true/)

  assert.equal(await portOpen(1), false)
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  assert.equal(await portOpen(port), true)
  await new Promise((resolve) => server.close(resolve))
})
