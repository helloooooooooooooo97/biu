/**
 * Electron 外壳：把现有的 web 界面装进 BrowserWindow，并在右侧栏的位置叠一个
 * 原生 BrowserView（真 Chromium），用来当「侧栏浏览器」。
 *
 * 设计原则：不改动仓库里现有的任何代码。
 *  - 主窗口就是现在的网页（dev 走 vite，build 走 dist）
 *  - BrowserView 是原生视图，浮在窗口之上，位置由前端通过 IPC 报上来的矩形决定
 *  - 前端侧只需要一个普通页面块插件（按 .inspector-stage-pane 量尺寸即可）
 */

import { app, BrowserWindow, BrowserView, ipcMain, shell, session } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const electronRoot = join(__dirname, '..')

/** dev：vite 起的地址；打包 / 无 dev 标记：本地 dist 文件。 */
const DEV_URL = process.env.BIU_DEV_URL || 'http://127.0.0.1:5173'
const distIndex = join(electronRoot, '..', 'dist', 'index.html')
const isDev = process.env.BIU_ELECTRON_DEV === '1' || (!app.isPackaged && !existsSync(distIndex) && process.env.BIU_ELECTRON_DEV !== '0')

/** 侧栏浏览器那块的原生视图。同一时间只开一个。 */
let view: BrowserView | null = null
let win: BrowserWindow | null = null
let browserPanelReady = false

/** 前端报上来的矩形（CSS 像素，相对窗口内容区）。 */
let rect: { x: number; y: number; width: number; height: number } | null = null
/** 面板没有指针交互需求时（比如被别的 tab 盖住）藏起来。 */
let visible = true

function clampRect(r: { x: number; y: number; width: number; height: number }) {
  if (!win) return r
  const [w, h] = win.getContentSize()
  const x = Math.max(0, Math.round(r.x))
  const y = Math.max(0, Math.round(r.y))
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(r.width), w - x)),
    height: Math.max(1, Math.min(Math.round(r.height), h - y)),
  }
}

function applyBounds() {
  if (!view || !win) return
  if (!rect || !visible) {
    // 尺寸为 0 即不可见；比 removeBrowserView 更省事，也不会丢页面状态
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  view.setBounds(clampRect(rect))
}

function createView() {
  if (!win || view) return
  view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  view.setBackgroundColor('#191919')
  win.addBrowserView(view)
  view.webContents.setWindowOpenHandler(({ url }) => {
    // target=_blank / window.open：仍在这个视图里跳，不要丢给系统浏览器
    if (/^https?:/i.test(url) && view && !view.webContents.isDestroyed()) {
      void view.webContents.loadURL(url)
    }
    return { action: 'deny' }
  })
  attachEvents(view.webContents)
  applyBounds()
}

function destroyView() {
  if (view && win) {
    win.removeBrowserView(view)
    // @ts-expect-error 旧版类型没有 destroy
    view.webContents?.destroy?.()
  }
  view = null
}

/* ---------------- IPC：前端 → 外壳 ---------------- */

type Cmd =
  | { type: 'navigate'; url: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'stop' }
  | { type: 'bounds'; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'visible'; visible: boolean }
  | { type: 'openExternal'; url: string }
  | { type: 'inspect'; x: number; y: number }
  | { type: 'close' }

/**
 * 跟 core-pick overlay 同一套：pointerdown 起拖、move 画框、up 提交命中。
 * BrowserView 盖住主窗口，主界面的 PickOverlay 收不到访客页指针。
 */
function inspectScript(x: number, y: number) {
  if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
    return `(() => {
      const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)})
      if (!el) return { items: [] }
      return { items: [{
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className : '',
        text: (el.innerText || el.textContent || '').trim().slice(0, 400),
        html: el.outerHTML.slice(0, 800),
      }] }
    })()`
  }
  return `(() => {
    if (window.__biuPickOff) window.__biuPickOff()
    return new Promise((resolve) => {
      const FILL = 'rgba(91,159,214,.22)'
      const STROKE = 'rgba(91,159,214,.4)'
      const LINE = '#5b9fd6'
      const DRAG = 6
      const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD', 'HTML'])
      const SEL = 'a,button,img,p,h1,h2,h3,h4,h5,h6,li,td,th,article,section,blockquote,pre,figure,figcaption,label,summary,dt,dd,code,video'
      const root = document.createElement('div')
      root.id = '__biuPickRoot'
      root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;cursor:crosshair'
      const marquee = document.createElement('div')
      const hover = document.createElement('div')
      const hits = document.createElement('div')
      const boxCss = (border) =>
        'position:absolute;box-sizing:border-box;pointer-events:none;border-radius:3px;border:1px solid ' + border
      marquee.style.cssText = boxCss(LINE) + ';background:' + FILL + ';display:none'
      hover.style.cssText = boxCss(STROKE) + ';background:' + FILL + ';display:none'
      hits.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      root.append(marquee, hover, hits)
      document.documentElement.appendChild(root)
      const prevCursor = document.documentElement.style.cursor
      document.documentElement.style.cursor = 'crosshair'
      const snap = (el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className : '',
        text: (el.innerText || el.textContent || '').trim().slice(0, 400),
        html: el.outerHTML.slice(0, 800),
      })
      const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const usable = (el) => {
        if (!(el instanceof Element) || skip.has(el.tagName) || root.contains(el)) return false
        const r = el.getBoundingClientRect()
        return r.width >= 4 && r.height >= 4
      }
      const atPoint = (px, py) => {
        for (const el of document.elementsFromPoint(px, py)) {
          if (usable(el) && el !== document.body && el !== document.documentElement) return el
        }
        return null
      }
      const place = (node, r) => {
        node.style.display = 'block'
        node.style.left = r.left + 'px'
        node.style.top = r.top + 'px'
        node.style.width = r.width + 'px'
        node.style.height = r.height + 'px'
      }
      const hitsInRect = (box) => {
        let found = []
        for (const el of document.body.querySelectorAll(SEL)) {
          if (!usable(el)) continue
          const r = el.getBoundingClientRect()
          if (!overlap({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, box)) continue
          found.push(el)
        }
        if (!found.length) {
          for (const el of document.body.querySelectorAll('*')) {
            if (!usable(el) || el === document.body) continue
            const r = el.getBoundingClientRect()
            if (!overlap({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, box)) continue
            found.push(el)
          }
        }
        const nested = new Set()
        for (const a of found) {
          for (const b of found) {
            if (a !== b && a.contains(b)) nested.add(a)
          }
        }
        return found.filter((el) => !nested.has(el)).slice(0, 40)
      }
      const paintHits = (els) => {
        hits.replaceChildren()
        for (const el of els) {
          const node = document.createElement('div')
          node.style.cssText = boxCss(STROKE) + ';background:' + FILL
          place(node, el.getBoundingClientRect())
          hits.appendChild(node)
        }
      }
      let drag = null
      const finish = (els) => {
        document.documentElement.style.cursor = prevCursor
        window.removeEventListener('pointerdown', onDown, true)
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('click', onClick, true)
        window.removeEventListener('keydown', onKey, true)
        root.remove()
        window.__biuPickOff = null
        resolve({ items: (els || []).map(snap) })
      }
      const onMove = (ev) => {
        if (drag) {
          const dx = ev.clientX - drag.x
          const dy = ev.clientY - drag.y
          if (!drag.boxed && dx * dx + dy * dy >= DRAG * DRAG) drag.boxed = true
          if (!drag.boxed) return
          hover.style.display = 'none'
          const left = Math.min(drag.x, ev.clientX)
          const top = Math.min(drag.y, ev.clientY)
          const width = Math.abs(ev.clientX - drag.x)
          const height = Math.abs(ev.clientY - drag.y)
          place(marquee, { left, top, width, height })
          paintHits(hitsInRect({ left, top, right: left + width, bottom: top + height }))
          return
        }
        const el = atPoint(ev.clientX, ev.clientY)
        if (!el) {
          hover.style.display = 'none'
          return
        }
        place(hover, el.getBoundingClientRect())
      }
      const onDown = (ev) => {
        if (ev.button !== 0) return
        ev.preventDefault()
        ev.stopPropagation()
        drag = { x: ev.clientX, y: ev.clientY, boxed: false }
      }
      const onUp = (ev) => {
        if (!drag) return
        const started = drag
        drag = null
        ev.preventDefault()
        ev.stopPropagation()
        if (started.boxed) {
          const left = Math.min(started.x, ev.clientX)
          const top = Math.min(started.y, ev.clientY)
          const width = Math.abs(ev.clientX - started.x)
          const height = Math.abs(ev.clientY - started.y)
          finish(hitsInRect({ left, top, right: left + width, bottom: top + height }))
          return
        }
        const el = atPoint(ev.clientX, ev.clientY)
        finish(el ? [el] : [])
      }
      const onClick = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      const onKey = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault()
          finish([])
        }
      }
      window.__biuPickOff = () => finish([])
      window.addEventListener('pointerdown', onDown, true)
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('click', onClick, true)
      window.addEventListener('keydown', onKey, true)
    })
  })()`
}

function inspectedItems(raw: unknown): Array<{ tag: string; id: string; className: string; text: string; html: string }> {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object') as Array<{
    tag: string
    id: string
    className: string
    text: string
    html: string
  }>
  const rec = raw as { items?: unknown; tag?: unknown }
  if (Array.isArray(rec.items)) return rec.items.filter((item) => item && typeof item === 'object') as Array<{
    tag: string
    id: string
    className: string
    text: string
    html: string
  }>
  if (typeof rec.tag === 'string') return [raw as { tag: string; id: string; className: string; text: string; html: string }]
  return []
}

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function attachEvents(wc: Electron.WebContents) {
  const emitState = async () => {
    send('biu:browser:state', {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      loading: wc.isLoading(),
    })
  }
  wc.on('did-start-loading', () => void emitState())
  wc.on('did-stop-loading', () => void emitState())
  wc.on('did-navigate', () => void emitState())
  wc.on('did-navigate-in-page', () => void emitState())
  wc.on('page-title-updated', () => void emitState())
  // 站点拒嵌之类的问题：这里能拿到真实的失败原因，比 iframe 强
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    send('biu:browser:error', { code, desc, url })
  })
}

ipcMain.on('biu:browser:cmd', async (_event, cmd: Cmd) => {
  if (cmd.type === 'bounds') {
    rect = cmd.rect
    applyBounds()
    return
  }
  if (cmd.type === 'visible') {
    visible = cmd.visible
    applyBounds()
    return
  }
  if (cmd.type === 'openExternal') {
    if (/^https?:/i.test(cmd.url)) void shell.openExternal(cmd.url)
    return
  }
  if (cmd.type === 'close') {
    destroyView()
    return
  }

  if (cmd.type === 'navigate') {
    const url = cmd.url.trim()
    if (!url || /^about:/i.test(url)) {
      destroyView()
      return
    }
    const fixed = /^https?:\/\//i.test(url) ? url : `https://${url}`
    if (!view) createView()
    if (!view) return
    try {
      await view.webContents.loadURL(fixed)
    } catch (error) {
      send('biu:browser:error', { code: 0, desc: String((error as Error).message || error), url: fixed })
    }
    return
  }

  if (!view) return
  const wc = view.webContents
  if (cmd.type === 'back' && wc.canGoBack()) {
    wc.goBack()
    return
  }
  if (cmd.type === 'forward' && wc.canGoForward()) {
    wc.goForward()
    return
  }
  if (cmd.type === 'reload') {
    wc.reload()
    return
  }
  if (cmd.type === 'stop') {
    wc.stop()
    return
  }
  if (cmd.type === 'inspect') {
    try {
      const info = await wc.executeJavaScript(inspectScript(cmd.x, cmd.y), true)
      send('biu:browser:inspected', { items: inspectedItems(info) })
    } catch (error) {
      send('biu:browser:error', { code: 0, desc: String((error as Error).message || error), url: '' })
    }
  }
})

/* ---------------- 窗口 ---------------- */

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#191919',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : {}),
    webPreferences: {
      preload: join(electronRoot, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.on('closed', () => {
    view = null
    win = null
  })

  // 窗口变化时重新贴合
  const relayout = () => applyBounds()
  const syncFullscreenClass = () => {
    const current = win
    if (!current || current.webContents.isDestroyed()) return
    const fullscreen = current.isFullScreen()
    void current.webContents
      .executeJavaScript(`document.documentElement.classList.toggle('biu-electron-fullscreen', ${fullscreen})`)
      .catch(() => undefined)
  }
  win.on('resize', relayout)
  win.on('maximize', relayout)
  win.on('unmaximize', relayout)
  win.on('enter-full-screen', () => {
    relayout()
    syncFullscreenClass()
  })
  win.on('leave-full-screen', () => {
    relayout()
    syncFullscreenClass()
  })

  win.webContents.on('did-finish-load', () => {
    void win?.webContents.insertCSS(ELECTRON_CHROME_CSS)
    void win?.webContents.executeJavaScript(
      `document.documentElement.classList.add('biu-electron');document.documentElement.classList.toggle('biu-electron-fullscreen', ${win?.isFullScreen() === true})`,
    )
    void ensureBrowserPanel()
  })

  if (isDev) {
    await win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(join(electronRoot, '..', 'dist', 'index.html'))
  }
}

/** 窗口模式给红绿灯让位；全屏没有红绿灯，不保留左侧空白。 */
const ELECTRON_CHROME_CSS = `
html.biu-electron:not(.biu-electron-fullscreen) .app-side-bar-head-brand {
  padding-left: 76px !important;
}
html.biu-electron:not(.biu-electron-fullscreen) .sidebar-flyout-host.is-collapsed.is-flyout-open .app-side-bar-head-brand,
html.biu-electron:not(.biu-electron-fullscreen) .sidebar-flyout-host.is-collapsed:hover .app-side-bar-head-brand {
  padding-left: 12px !important;
}
html.biu-electron .app-side-bar-head,
html.biu-electron .chat-view-header {
  -webkit-app-region: drag;
}
html.biu-electron .app-side-bar-head button,
html.biu-electron .app-side-bar-head a,
html.biu-electron .app-side-bar-head input,
html.biu-electron .app-side-bar-head [role="tablist"],
html.biu-electron .chat-view-header button,
html.biu-electron .chat-view-header a,
html.biu-electron .chat-view-header input,
html.biu-electron .inspector-add {
  -webkit-app-region: no-drag;
}
html.biu-electron .app-shell {
  position: relative;
}
html.biu-electron:not(.biu-electron-fullscreen) .app-shell.is-sidebar-collapsed > main > .app-stage-pane.is-active > .chat-view-header,
html.biu-electron:not(.biu-electron-fullscreen) .app-shell.is-left-hidden > main > .app-stage-pane.is-active > .chat-view-header {
  padding-left: 76px;
  box-sizing: border-box;
}
html.biu-electron:not(.biu-electron-fullscreen) .app-shell.is-sidebar-collapsed::before,
html.biu-electron:not(.biu-electron-fullscreen) .app-shell.is-left-hidden::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  z-index: 90;
  width: 76px;
  height: 44px;
  -webkit-app-region: drag;
}
`

async function ensureBrowserPanel() {
  if (browserPanelReady) return
  const host = process.env.BIU_HOST_URL || 'http://127.0.0.1:3141'
  for (let i = 0; i < 25; i += 1) {
    try {
      await fetch(`${host}/api/db/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: '/plugins/page-browser', action: 'pack' }),
      })
      const start = await fetch(`${host}/api/db/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: '/plugins/page-browser', action: 'start' }),
      })
      if (start.ok || start.status === 400) {
        browserPanelReady = true
        return
      }
    } catch {
      /* host 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

// 开发期开个 CDP 端口，方便自动化和排查（打包不加）
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// 容器 / 无用户命名空间的 Linux 上 Chromium 沙箱会直接起不来
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

app.whenReady().then(async () => {
  // 允许被嵌的话就允许；这里只是让一些站少弹无谓的告警
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
