import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')

describe('sidebar text colors', () => {
  it('keeps a separate active token for the sidebar foreground', () => {
    // 断言 token 存在并被正确引用，不锁死具体色值，否则换主题就会整片变红。
    expect(css).toMatch(/--dsw-sidebar-fg:\s*[^;]+;/)
    expect(css).toMatch(/--dsw-sidebar-fg-active:\s*[^;]+;/)
    expect(css).toMatch(/\.app-side-bar\s*\{[^}]*color:\s*var\(--dsw-sidebar-fg\)/s)
    expect(css).toMatch(/\.chat-session-row\.is-active\s*\{[^}]*color:\s*var\(--dsw-sidebar-fg-active\)/s)
    expect(css).toMatch(/\.chat-session-row\s*\{[^}]*-webkit-user-drag:\s*none/s)
  })

  it('left-aligns the sidebar brand with the list below', () => {
    expect(css).toMatch(/\.app-side-bar-head-brand\s*\{[^}]*justify-content:\s*flex-start/s)
    expect(css).toMatch(/\.app-side-bar-head-brand\s*\{[^}]*padding-left:\s*16px/s)
    expect(css).toMatch(/\.app-side-bar\.is-narrow \.app-side-bar-head-brand\s*\{[^}]*justify-content:\s*center/s)
  })

  it('session rows do not start a native drag ghost', () => {
    const sidebar = readFileSync(resolve(import.meta.dirname, './chat-sidebar.tsx'), 'utf8')
    expect(sidebar).toMatch(/draggable=\{false\}/)
    expect(sidebar).toMatch(/onDragStart=\{\(event\) => event.preventDefault\(\)\}/)
  })

  it('hides labels until the chat sidebar is wide enough', () => {
    expect(css).toMatch(/\.sidebar-label,\s*\.app-side-actions-label\s*\{[^}]*font-size:\s*14px/s)
    expect(css).toMatch(/\.sidebar-tag\s*\{[^}]*font-size:\s*11px/s)
    expect(css).toMatch(/\.sidebar-tag\s*\{[^}]*line-height:\s*16px/s)
    expect(css).toMatch(/\.sidebar-chat-count-num\s*\{[^}]*font-size:\s*14px/s)
    expect(css).toMatch(/\.app-side-bar:not\(\.is-wide\) \.sidebar-tag/)
    const sidebar = readFileSync(resolve(import.meta.dirname, './chat-sidebar.tsx'), 'utf8')
    const frame = readFileSync(resolve(import.meta.dirname, './shell-sidebar-frame.tsx'), 'utf8')
    expect(sidebar).toMatch(/text-\[14px\]/)
    expect(frame).toMatch(/data-testid="sidebar-expand"/)
    expect(frame).toMatch(/data-testid="sidebar-resize"/)
    expect(frame).toMatch(/onWidthLive/)
    expect(frame).toMatch(/if \(onWidthLive\) onWidthLive\(next\)/)
    const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
    expect(shell).toMatch(/leftWidth: leftPane \? sidebarCol/)
    expect(shell).toMatch(/id="shell-module-sidebar"/)
    expect(shell).toMatch(/ShellSidebarFrame/)
    expect(shell).toMatch(/SIDEBAR_TAG_AT/)
    expect(shell).toMatch(/data-testid="header-sidebar-expand"/)
    expect(shell).toMatch(/leftHidden \|\| sidebarNarrow/)
    const overlay = readFileSync(resolve(import.meta.dirname, './chat-overlay.ts'), 'utf8')
    expect(overlay).toMatch(/SIDEBAR_LABEL_AT = SIDEBAR_MIN/)
    expect(overlay).toMatch(/SIDEBAR_TAG_AT = SIDEBAR_MAX/)
    expect(overlay).toMatch(/SIDEBAR_MIN = 160/)
    expect(css).toMatch(/--dsw-sidebar-min:\s*160px/)
    expect(css).toMatch(/\.app-side-bar\s*\{[^}]*min-width:\s*0/s)
  })
})
