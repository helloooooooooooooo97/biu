/**
 * 流式吐字时聊天主列宽度不应被内容 min-content 撑开。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const styleCss = () => readFileSync(resolve(root, 'web/style.css'), 'utf8')
const chatPane = () => readFileSync(resolve(root, 'packages/public-ui/src/chat-pane.tsx'), 'utf8')

describe('chat stream layout width stability', () => {
  it('chat stage stretches children with min-width 0 instead of centering by content width', () => {
    const css = styleCss()
    expect(css).toMatch(/\.chat-stage\s*\{[^}]*align-items:\s*stretch/s)
    expect(css).toMatch(/\.chat-stage\s*\{[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.chat-stage\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(css).toMatch(/\.chat-stage>\*\s*\{[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.chat-stage>\*\s*\{[^}]*margin-inline:\s*auto/s)
    expect(css).not.toMatch(/\.chat-stage\s*\{[^}]*align-items:\s*center/s)
  })

  it('markdown and reply blocks clip horizontal overflow inside the fixed column', () => {
    const css = styleCss()
    expect(css).toMatch(/\.chat-md\s*\{[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.chat-md\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(css).toMatch(/\.chat-md \.chat-code\s*\{[^}]*position:\s*relative/s)
    expect(css).toMatch(/\.chat-md pre\s*\{[^}]*max-width:\s*100%/s)
    expect(css).toMatch(/\.chat-assistant-body\s*\{[^}]*overflow-x:\s*hidden/s)
  })

  it('thread scroll container also allows shrink in the flex chain', () => {
    const css = styleCss()
    expect(css).toMatch(/\.chat-overlay-thread\s*\{[^}]*min-width:\s*0/s)
    expect(chatPane()).toMatch(/min-w-0/)
    expect(chatPane()).toMatch(/overflow-x-hidden/)
  })
})
