import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import * as slots from '@biu/web-slots'
import * as appModules from '@biu/web-app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-project-view'
import * as shell from './index.tsx'

test('declares generic module slots, not plugin ids', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  await ctx.plugin(shell)
  assert.equal(ctx.slots.specOf('sidebar')?.kind, 'single')
  assert.equal(ctx.slots.specOf('demos')?.kind, 'list')
  assert.equal(ctx.slots.specOf('app-modules')?.kind, 'list')
  assert.equal(ctx.slots.specOf('inspector-panels')?.kind, 'list')
  assert.equal(ctx.slots.specOf('header-tools')?.kind, 'list')
  assert.equal(ctx.slots.specOf('stage-aside')?.kind, 'single')
  assert.equal(ctx.slots.specOf('corner-tools')?.kind, 'list')
  assert.equal(ctx.slots.specOf('root-overlays')?.kind, 'list')
  assert.equal(ctx.slots.specOf('tasks'), undefined)
  assert.equal(ctx.slots.specOf('channels'), undefined)
  assert.equal(ctx.slots.specOf('dashboard'), undefined)
  assert.equal(ctx.slots.list('root').length, 1)
  assert.equal(
    ctx.slots.list('inspector-panels').some((item) => item.id === 'common-add-view' || item.id === 'common-copy-view'),
    false,
  )
})

test('update button does not download when already current', () => {
  const chrome = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(chrome, /相对于主分支暂时无最新提交版本/)
  assert.match(chrome, /if \(behind <= 0\)/)
  assert.match(chrome, /data-testid="settings-update"/)
  assert.match(shell, /activeModule === 'agent' && getChatOverlay\(\)/)
})

test('refresh does not send unfinished plugin routes home', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(shell, /waitingOnNav/)
  assert.match(shell, /biu:session-missing/)
  assert.match(shell, /navigate\('\/', \{ replace: true \}\)/)
})

test('center stage keeps modules mounted without a page fade', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(shell, /className="app-stage"/)
  assert.match(shell, /app-stage-pane/)
  assert.match(shell, /is-window-resizing/)
  assert.match(shell, /classList\.add\('is-window-resizing'\)/)
  assert.match(shell, /requestAnimationFrame\(applyWidth\)/)
  assert.match(shell, /setViewportWidth\(\(prev\) => \(prev === next \? prev : next\)\)/)
  assert.match(shell, /setWindowResizing\(\(prev\) => prev \|\| true\)/)
  assert.match(shell, /onWidthLive=\{onSidebarWidthLive\}/)
  assert.match(shell, /onWidthLive=\{onInspectorWidthLive\}/)
  assert.match(shell, /applyShellColumnCssVars/)
  assert.match(shell, /const PluginModuleStage = memo\(function PluginModuleStage/)
  assert.match(shell, /publishShellLayout/)
  assert.match(shell, /sidebarCollapsedRef\.current/)
  assert.match(shell, /paintColumnDrag/)
  assert.doesNotMatch(shell, /if \(moduleId !== activeId\) return null/)
  assert.match(css, /\.app-stage-pane\.is-active[\s\S]*?opacity:\s*1/)
  assert.match(css, /\.app-stage-pane[\s\S]*?content-visibility:\s*hidden/)
  assert.doesNotMatch(css, /\.app-stage-pane\s*\{[^}]*transition:\s*[\s\S]*opacity 220ms/s)
  assert.doesNotMatch(css, /@keyframes app-pane-in/)
  assert.doesNotMatch(css, /\.app-pane-in\s*\{[^}]*animation:\s*app-pane-in/s)
})

test('left sidebar keeps chat and database lists mounted and folds smoothly', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const chat = readFileSync(resolve(import.meta.dirname, './chat-sidebar.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(shell, /embedded/)
  assert.match(shell, /id="shell-module-sidebar"/)
  assert.match(chat, /SidebarFold/)
  assert.match(chat, /embedded/)
  assert.doesNotMatch(chat, /No chats yet/)
  assert.match(chat, /flex min-w-0 flex-col gap-px pt-0.5/)
  assert.doesNotMatch(chat, /space-y-1.5 pt-0.5/)
  assert.doesNotMatch(chat, /sidebar-group-head mb-0.5/)
  assert.match(css, /\.app-side-actions\s*\{[^}]*gap:\s*1px/s)
  assert.match(css, /\.chat-session-row::before[\s\S]*?transition:\s*background-color/)
})

test('settings and session config floats match search chrome', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const dialog = readFileSync(resolve(import.meta.dirname, '../../../web-session-view/src/web/session-config-dialog.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  // 浮层底色 token 必须存在并有值，具体色值交给主题决定。
  assert.match(css, /--dsw-float:\s*[^;]+;/)
  assert.match(css, /\.biu-float-close/)
  assert.match(css, /\.shell-search-dialog[\s\S]*background:\s*var\(--dsw-float\)/)
  assert.match(shell, /className="biu-float /)
  assert.match(shell, /settings-float/)
  assert.match(shell, /settingsOpen[\s\S]*createPortal/)
  assert.doesNotMatch(shell, /biu-float-overlay\$\{settingsOpen/)
  assert.match(css, /\.settings-float\s*\{[^}]*font-size:\s*13px/)
  assert.match(css, /\.settings-muted\s*\{[^}]*color:\s*var\(--dsw-label-3\)/)
  assert.match(css, /\.biu-float-overlay\s*\{[^}]*z-index:\s*240/)
  assert.match(shell, /biu-float-close/)
  assert.doesNotMatch(shell, />\s*Close\s*</)
  assert.match(dialog, /className="biu-float /)
  assert.match(dialog, /XMarkIcon/)
  assert.doesNotMatch(dialog, />\s*Close\s*</)
})

test('settings lists search and pick shortcuts', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const chrome = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  assert.match(shell, /key: 'shortcuts'/)
  assert.match(shell, /ShellSettingsShortcuts/)
  assert.match(chrome, /data-testid="settings-shortcuts"/)
  assert.match(chrome, /⌘F/)
  assert.match(chrome, /Ctrl\+Q/)
  assert.match(chrome, /正文查找/)
  assert.doesNotMatch(chrome, /⌘K/)
  assert.doesNotMatch(chrome, /就地编辑选区/)
  assert.match(chrome, /⌘L 也可从选区气泡进入/)
  assert.match(chrome, /⌘L/)
  assert.match(chrome, /选区送到对话/)
})

test('settings about states Apache-2.0 license and grok-bot notice', () => {
  const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const chrome = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  assert.match(shell, /key: 'about'/)
  assert.match(shell, /ShellSettingsAbout/)
  assert.match(chrome, /data-testid="settings-about"/)
  assert.match(chrome, /Apache License 2\.0/)
  assert.match(chrome, /grok-bot/)
  assert.match(chrome, /xAI/)
  assert.match(chrome, /NOTICE/)
})
