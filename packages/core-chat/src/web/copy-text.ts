export async function copyText(text: string) {
  const next = text.replace(/\u00a0/g, ' ').replace(/\s+$/g, '')
  if (!next) return false
  try {
    await navigator.clipboard.writeText(next)
    return true
  } catch {
    return false
  }
}

export function markCopyDone(button: HTMLButtonElement, restore: () => void) {
  button.classList.add('is-done')
  button.title = '已复制'
  button.setAttribute('aria-label', '已复制')
  window.setTimeout(() => {
    button.classList.remove('is-done')
    button.title = '复制'
    button.setAttribute('aria-label', '复制')
    restore()
  }, 1400)
}
