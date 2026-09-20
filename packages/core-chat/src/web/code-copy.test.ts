import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindCodeCopyClicks, enhanceCodeCopy } from './code-copy.ts'
import { copyText } from './copy-text.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('code copy', () => {
  it('wraps pre blocks with a copy icon button', () => {
    const root = document.createElement('div')
    root.innerHTML = '<pre><code>const n = 1</code></pre>'
    enhanceCodeCopy(root)
    const wrap = root.querySelector('.chat-code')
    expect(wrap).toBeTruthy()
    expect(wrap?.querySelector('pre')?.textContent).toContain('const n = 1')
    const button = wrap?.querySelector('button.chat-code-copy') as HTMLButtonElement
    expect(button.title).toBe('复制')
    expect(button.getAttribute('aria-label')).toBe('复制代码')
    expect(button.textContent).toBe('')
  })

  it('copies pre inner text and marks the icon as done', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = '<pre><code>hello</code></pre>'
    enhanceCodeCopy(root)
    const stop = bindCodeCopyClicks(root)
    const button = root.querySelector('button.chat-code-copy') as HTMLButtonElement
    button.click()
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello')
      expect(button.classList.contains('is-done')).toBe(true)
      expect(button.title).toBe('已复制')
    })
    stop()
  })

  it('copyText trims trailing space', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyText('hi  \n')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
  })
})
