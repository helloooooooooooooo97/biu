import { copyText, markCopyDone } from './copy-text.ts'

const COPY_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 16" class="size-3.5" fill="currentColor"><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h6A1.5 1.5 0 0 1 14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 12.5v-6Z"/><path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11V6.5a3 3 0 0 1 3-3H11A1.5 1.5 0 0 0 9.5 2h-6Z"/></svg>'
const CHECK_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 16" class="size-3.5" fill="currentColor"><path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/></svg>'

function makeCopyButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'chat-code-copy'
  button.title = '复制'
  button.setAttribute('aria-label', '复制代码')
  button.setAttribute('data-testid', 'chat-code-copy')
  button.innerHTML = COPY_SVG
  return button
}

export function enhanceCodeCopy(root: HTMLElement) {
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.closest('.chat-code')) continue
    const wrap = document.createElement('div')
    wrap.className = 'chat-code'
    pre.replaceWith(wrap)
    wrap.append(pre, makeCopyButton())
  }
}

export function bindCodeCopyClicks(root: HTMLElement) {
  const onClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest('button.chat-code-copy') : null
    if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return
    event.preventDefault()
    event.stopPropagation()
    const pre = button.closest('.chat-code')?.querySelector('pre')
    const text = pre?.textContent ?? ''
    void copyText(text).then((ok) => {
      if (!ok) return
      const previous = button.innerHTML
      button.innerHTML = CHECK_SVG
      markCopyDone(button, () => {
        button.innerHTML = previous
        button.setAttribute('aria-label', '复制代码')
      })
    })
  }
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
