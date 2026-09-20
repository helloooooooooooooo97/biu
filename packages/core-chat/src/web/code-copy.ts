import { copyText, markCopyDone } from './copy-text.ts'

const COPY_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M5 3.75A1.75 1.75 0 0 1 6.75 2h6.5A1.75 1.75 0 0 1 15 3.75v6.5A1.75 1.75 0 0 1 13.25 12h-6.5A1.75 1.75 0 0 1 5 10.25v-6.5ZM6.75 3.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25h-6.5ZM3.5 6.75A.75.75 0 0 0 2.75 6h-.5A1.75 1.75 0 0 0 .5 7.75v6.5A1.75 1.75 0 0 0 2.25 16h6.5A1.75 1.75 0 0 0 10.5 14.25v-.5a.75.75 0 0 0-1.5 0v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25v-6.5A.25.25 0 0 1 2.25 7.5h.5a.75.75 0 0 0 .75-.75Z"/></svg>'
const CHECK_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M12.416 3.443a.75.75 0 0 1 .041 1.06l-6 6.5a.75.75 0 0 1-1.127.01l-3-3.25a.75.75 0 1 1 1.14-.976l2.43 2.632 5.456-5.916a.75.75 0 0 1 1.06-.06Z" clip-rule="evenodd"/></svg>'

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
