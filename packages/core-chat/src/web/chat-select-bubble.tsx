import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/16/solid'
import { getPick, textPickFromPlain } from '@biu/core-pick/web'

function chatTextRange(): Range | null {
  if (typeof document === 'undefined') return null
  if (document.documentElement.classList.contains('pick-mode')) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const node = sel.anchorNode
  const el = node instanceof Element ? node : node?.parentElement
  if (!el?.closest('.chat-stage')) return null
  if (el.closest('.chat-composer-dock')) return null
  if (!sel.toString().trim()) return null
  return sel.getRangeAt(0)
}

function sendChatSelection() {
  const range = chatTextRange()
  const text = range ? window.getSelection()?.toString() ?? '' : ''
  const ref = textPickFromPlain(window.location.pathname, text)
  if (!ref) return
  getPick()?.attach([ref])
  window.getSelection()?.removeAllRanges()
}

function isSendChatHotkey(event: KeyboardEvent) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'l' || event.key === 'L'
}

export function ChatSelectBubble() {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const sync = () => {
      const range = chatTextRange()
      if (!range) {
        setBox(null)
        return
      }
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        setBox(null)
        return
      }
      setBox({
        top: Math.max(8, rect.top - 40),
        left: Math.min(window.innerWidth - 44, Math.max(8, rect.left + rect.width / 2 - 16)),
      })
    }
    const onKey = (event: KeyboardEvent) => {
      if (!isSendChatHotkey(event)) return
      if (!chatTextRange()) return
      event.preventDefault()
      sendChatSelection()
      setBox(null)
    }
    document.addEventListener('selectionchange', sync)
    document.addEventListener('mouseup', sync)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('selectionchange', sync)
      document.removeEventListener('mouseup', sync)
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!box || typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      className="chat-select-bubble"
      title="加入对话"
      aria-label="加入对话"
      data-testid="chat-select-bubble"
      style={{ top: box.top, left: box.left }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        sendChatSelection()
        setBox(null)
      }}
    >
      <ChatBubbleLeftRightIcon className="chat-select-bubble-icon" aria-hidden />
    </button>,
    document.body,
  )
}
