import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import * as slots from '@biu/web-slots'
import type { CollectionChrome, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import * as plugins2Ui from './index.tsx'

class FakeDatabaseUi extends Service implements DatabaseUi {
  last: { path: string; chrome: CollectionChrome } | null = null
  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
  }
  decorate(path: string, chrome: CollectionChrome) {
    this.last = { path, chrome }
    return { dispose() {} }
  }
  chrome() {
    return this.last?.chrome ?? {}
  }
  registerView() {
    return { dispose() {} }
  }
  registerRowView() {
    return { dispose() {} }
  }
  views() {
    return [] as CollectionViewType[]
  }
  rowViews() {
    return []
  }
  subscribe() {
    return () => undefined
  }
}

test('plugin system web declares extras so store plugins can mount windows', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  new FakeDatabaseUi(ctx)
  ctx.slots.fill('root', () => null, {
    children: {
      'root-overlays': { kind: 'list' },
    },
  })
  await ctx.plugin(plugins2Ui)
  assert.equal(ctx.slots.list('root-overlays').some((item) => item.id === 'plugin-store-extras-layer'), true)
  assert.ok(ctx.slots.specOf('plugin-store-extras'))
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  assert.match(readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8'), /listenEnablePageBlockPlugin/)
})

test('plugin extras keep windows mounted when minimized', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const src = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.doesNotMatch(src, /if \(minimized\[entry\.id\]\) return null/)
  assert.match(src, /minimized=\{isMin\}/)
  assert.match(src, /visibility: 'hidden'/)
  assert.match(src, /data-minimized/)
})

test('plugin system web passes name/tags/action chrome into databaseUi', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  const ui = new FakeDatabaseUi(ctx)
  ctx.slots.fill('root', () => null, {
    children: {
      'root-overlays': { kind: 'list' },
    },
  })
  await ctx.plugin(plugins2Ui)
  assert.equal(ui.last?.path, '/plugins')
  assert.equal(typeof ui.last?.chrome.Title, 'function')
  assert.equal(typeof ui.last?.chrome.cells?.author, 'function')
  assert.equal(ui.last?.chrome.cells?.tags, undefined)
  assert.equal(typeof ui.last?.chrome.Actions, 'function')
  assert.equal(ui.last?.chrome.Action, undefined)
})

test('plugin chrome owns the whole action menu including the run toggle', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const chrome = readFileSync(resolve(import.meta.dirname, './chrome.tsx'), 'utf8')
  assert.match(chrome, /function PluginActions/)
  assert.match(chrome, /Actions: PluginActions/)
  assert.match(chrome, /function PluginRunButton/)
  assert.match(chrome, /place === 'detail' \? 'menuitem'/)
  assert.match(chrome, /fsdb-detail-more-item/)
  assert.doesNotMatch(chrome, /dock-icon-btn/)
  assert.doesNotMatch(chrome, /Action: PluginAction/)
})

test('plugin title is the name only; tags stay the file-system writable column', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const chrome = readFileSync(resolve(import.meta.dirname, './chrome.tsx'), 'utf8')
  assert.doesNotMatch(chrome, /PluginTagsCell/)
  assert.doesNotMatch(chrome, /已装/)
  assert.match(chrome, /data-testid="plugin-enabled-dot"/)
})

test('plugin window sizes from manifest.shell instead of measuring DOM', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(src, /data-shell-width=\{shell\.width\}/)
  assert.match(src, /storeShellFromRecord/)
  assert.match(src, /dismissAndStop/)
  assert.match(src, /dismissed\[entry\.id\]/)
  assert.match(src, /listingIsHeadless/)
  assert.match(src, /extraProps\.headless === true/)
  assert.doesNotMatch(src, /measurePluginBox/)
  assert.doesNotMatch(src, /ResizeObserver/)
  const create = await readFile(resolve(import.meta.dirname, '../host/plugin-create.ts'), 'utf8')
  assert.match(create, /manifest\.shell/)
})

test('plugin window hover controls sit on the right without a title bar', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(src, /data-plugin-id=\{pluginId\}/)
  assert.match(src, /data-biu-plugin=\{pluginId\}/)
  assert.match(src, /plugin-window-move/)
  assert.match(src, /Bars2Icon/)
  assert.match(src, /移动窗口/)
  assert.doesNotMatch(src, /if \(\(event\.target as HTMLElement\)\.closest\('button'\)\) return/)
  assert.match(src, /onPointerLeave=\{closeControlsSoon\}/)
  assert.match(src, /storeShellFromRecord/)
  assert.match(src, /left-full/)
  assert.match(src, /pl-1\.5/)
  assert.doesNotMatch(src, /w-16/)
  assert.match(src, /size-8/)
  assert.match(src, /data-controls-place/)
  assert.match(src, /inside/)
  assert.match(src, /fullscreen \|\| minimized \? undefined : openControls/)
  assert.match(src, /width: '100vw'/)
  assert.match(src, /height: '100vh'/)
  assert.doesNotMatch(src, /100vw - 32px/)
  assert.match(src, /flex-col/)
  assert.match(src, /bg-white\/10/)
  assert.match(src, /shell\.resizable \? \(/)
  assert.match(src, /ArrowsPointingOutIcon/)
  assert.doesNotMatch(src, /disabled=\{!shell\.resizable\}/)
  assert.doesNotMatch(src, /不能放大/)
  assert.doesNotMatch(src, /bg-white\/55/)
  assert.doesNotMatch(src, /bg-\[#202020\]/)
  assert.doesNotMatch(src, /bg-\[#ff5f57\]/)
  assert.doesNotMatch(src, /bottom-4 left-1\/2/)
  assert.doesNotMatch(src, /dock\.register/)
  assert.doesNotMatch(src, /PuzzlePieceIcon/)
  assert.doesNotMatch(src, /ExtraIcon/)
  assert.match(src, /PluginTrayPortal/)
  assert.match(src, /setMinimized\(prune\)/)
})

test('page-excalidraw sandbox stores scenes as page assets', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-excalidraw/web.tsx'), 'utf8')
  const manifest = JSON.parse(
    await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-excalidraw/manifest.json'), 'utf8'),
  ) as { headless?: boolean }
  assert.equal(manifest.headless, true)
  assert.match(src, /\/api\/page\/file\//)
  assert.match(src, /method: 'PUT'/)
  assert.match(src, /viewModeEnabled=\{!/)
  assert.match(src, /createPortal/)
  assert.match(src, /document\.body/)
  assert.match(src, /retainHost/)
  assert.match(src, /releaseHost/)
  assert.match(src, /placeHost/)
  assert.match(src, /function parkHost/)
  assert.match(src, /host\.expanded = false/)
  assert.match(src, /data-page-block-expand/)
  assert.match(src, /tabIndex=\{-1\}/)
  assert.match(src, /parkHost\(host\)/)
  assert.match(src, /slot\.appendChild\(el\)/)
  assert.match(src, /position:absolute;inset:0/)
  assert.match(src, /visibility:hidden/)
  assert.match(src, /document\.body\.appendChild\(el\)/)
  assert.match(src, /queueMicrotask/)
  assert.doesNotMatch(src, /expanded \? null : canvas/)
  assert.match(src, /export const inject = \['pageEditor'\]/)
  assert.match(src, /plugin: name/)
  assert.match(src, /View: Board/)
  assert.match(src, /defaults: \(\) => \(\{ file:/)
  assert.match(src, /function reloadHost/)
  assert.match(src, /appliedEtag/)
  assert.match(src, /quietUntil/)
  assert.match(src, /biu:asset-changed/)
  const onChange = src.match(/const onChange = useCallback\([\s\S]*?\}, \[file\]\)/)?.[0]
  assert.ok(onChange)
  assert.doesNotMatch(onChange, /setScene/)
  assert.match(onChange, /saveScene/)
  assert.match(src, /theme="dark"/)
  assert.match(src, /function withoutCollab/)
  assert.match(src, /appState: withoutCollab\(o\.appState\)/)
  assert.match(src, /appState: withoutCollab\(appState\)/)
  assert.doesNotMatch(src, /forceDarkCanvas/)
  assert.doesNotMatch(src, /viewBackgroundColor: DARK_BG/)
  assert.match(src, /requestAnimationFrame\(\(\) => fitView\(apiRef\.current\)\)/)
  assert.doesNotMatch(src, /requestAnimationFrame\(\(\) => fitView\(api\)\)/)
  assert.match(src, /z-index:9992/)
  assert.doesNotMatch(src, /inset-0 flex flex-col bg-\[var\(--dsw-bg/)
  assert.match(src, /scrollToContent/)
  assert.match(src, /aria-label="画板名称"/)
  assert.match(src, /assetStem/)
  assert.match(src, /normalizeStem/)
  assert.doesNotMatch(src, /border-\[var\(--border\)\]/)
  assert.match(src, /height: 280/)
  assert.doesNotMatch(src, /h-\[280px\]/)
  assert.match(src, /refresh/)
})

test('html page blocks register plugin id for slash', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const html = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-html-blocks/web.tsx'), 'utf8')
  assert.match(html, /plugin: name/)
  assert.match(html, /kind: 'html'/)
  assert.match(html, /kind: 'htmlframe'/)
  assert.match(html, /label: '静态HTML'/)
  assert.match(html, /label: '动态HTML'/)
  assert.doesNotMatch(html, /label: '排版'/)
  assert.doesNotMatch(html, /label: '小网页'/)
  assert.doesNotMatch(html, /HTML 直接渲染/)
  assert.doesNotMatch(html, /HTML iframe 沙箱/)
  assert.match(html, /stampHtmlSource/)
  assert.match(html, /data-biu-ignore/)
  assert.match(html, /data-page-block-expand/)
  assert.match(html, /html-deck/)
  assert.match(html, /htmlDeckKeyAction/)
  assert.match(html, /requestFullscreen/)
  assert.match(html, /html-deck-toggle/)
  assert.match(html, /html-size-grip/)
  assert.match(html, /html-size-auto/)
  assert.match(html, /reveal=\{hover\}/)
  assert.match(html, /if \(!show\) return null/)
  assert.doesNotMatch(html, /opacity: show \? 1 : 0/)
  assert.match(html, /deck: true/)
  assert.match(html, /现代 ・ 美式/)
  assert.match(html, /min-height:100%/)
  assert.match(html, /height:100%/)
  assert.match(html, /丰富<br>排版/)
  assert.match(html, /background:\$\{MAG_INK\}/)
  assert.match(html, /#0a0a0a/)
  assert.match(html, /#ece7dc/)
  assert.match(html, /HTML_FRAME_SAMPLE/)
  assert.match(html, /会跑脚本/)
  assert.match(html, /setInterval\(tick/)
  assert.match(html, /mag-rail/)
  assert.doesNotMatch(html, /const HTML_FRAME_SAMPLE = HTML_EDITORIAL_SAMPLE/)
  assert.match(html, /padding-right:220px/)
  assert.match(html, /pressBtn/)
  assert.doesNotMatch(html, /#7c5cfc/)
  assert.doesNotMatch(html, /backdropFilter/)
  assert.doesNotMatch(html, /boxShadow: '4px 4px 0 #111'/)
  assert.match(html, /data-testid="html-source"/)
  assert.match(html, /event\.stopPropagation\(\)/)
  assert.match(html, /setDraft\(e\.target\.value\)/)
  assert.doesNotMatch(html, /value=\{html\}/)
})

test('algorithm card drafts locally and saves on blur like html source', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-algorithm/web.tsx'), 'utf8')
  assert.match(src, /function DraftField/)
  assert.match(src, /onChange=\{\(event\) => setDraft\(event\.currentTarget\.value\)\}/)
  assert.match(src, /onBlur=\{\(\) => \{[\s\S]*flush\(\)/)
  assert.doesNotMatch(src, /onChange=\{\(event\) => \{[\s\S]*onCommitRef/)
  assert.doesNotMatch(src, /onCompositionEnd/)
  assert.match(src, /testId="page-algorithm-title"/)
  assert.match(src, /testId="page-algorithm-prompt"/)
  assert.match(src, /testId="page-algorithm-code"/)
  assert.doesNotMatch(src, /onChange=\{\(event\) => update\(\{ title:/)
  assert.doesNotMatch(src, /onChange=\{\(event\) => update\(\{ prompt:/)
  assert.doesNotMatch(src, /onChange=\{\(event\) => update\(\{ code:/)
  assert.doesNotMatch(src, /data-biu-ignore/)
  assert.doesNotMatch(src, /data-biu-plugin=\{name\}/)
})

test('page-browser is both a page block and the inspector browser', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const web = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-browser/web.tsx'), 'utf8')
  const panel = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-browser/panel.tsx'), 'utf8')
  const open = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-browser/open.ts'), 'utf8')
  assert.match(web, /export const inject = \['pageEditor', 'slots', 'pick'\]/)
  assert.match(web, /placeInspectorBrowser/)
  assert.match(web, /openSidebarBrowser/)
  assert.match(web, /侧栏打开/)
  assert.match(panel, /tabId: BROWSER_TAB_ID/)
  assert.match(panel, /requiresSession: true/)
  assert.match(panel, /centerKinds: \['session'\]/)
  assert.doesNotMatch(panel, /common: true/)
  assert.match(panel, /PAPER = '#191919'/)
  assert.match(panel, /inspector-stage-pane/)
  assert.match(panel, /api\.inspect\(-1, -1\)/)
  assert.match(panel, /M7\.25 1\.75a\.75\.75 0 0 1 1\.5 0v1\.5/)
  assert.match(panel, /BROWSER_OPEN_EVENT/)
  assert.match(open, /biu:inspector-tab/)
  assert.match(open, /biuBrowser\.navigate/)
})
