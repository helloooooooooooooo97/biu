import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/16/solid'

function pinHost(from: HTMLElement | null) {
  const right = from?.closest('.fsdb-right')
  if (right instanceof HTMLElement) return right
  const body = from?.closest('.fsdb-right-body')
  return body instanceof HTMLElement ? body : null
}

export function FindBar({
  query,
  index,
  total,
  onQuery,
  onNext,
  onPrev,
  onClose,
}: {
  query: string
  index: number
  total: number
  onQuery: (next: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const mark = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null | undefined>(undefined)

  useLayoutEffect(() => {
    const root = pinHost(mark.current)
    if (!root) {
      setHost(null)
      return
    }
    const body = mark.current?.closest('.fsdb-right-body')
    const slot = document.createElement('div')
    slot.className = 'page-find-slot'
    const top = body instanceof HTMLElement ? body.offsetTop + 8 : 8
    slot.style.top = `${top}px`
    root.appendChild(slot)
    setHost(slot)
    return () => {
      slot.remove()
      setHost(undefined)
    }
  }, [])

  useEffect(() => {
    if (host === undefined) return
    input.current?.focus()
    input.current?.select()
  }, [host])

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) onPrev()
      else onNext()
    }
  }

  const label = query.trim() ? `${total ? index + 1 : 0}/${total}` : ''

  const bar = (
    <div className="page-find" data-testid="page-find" role="search">
      <div className="page-find-box">
        <MagnifyingGlassIcon aria-hidden className="page-find-icon" />
        <input
          ref={input}
          type="search"
          className="page-find-input"
          placeholder="搜索"
          aria-label="正文搜索"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKey}
        />
        <span className="page-find-count" data-testid="page-find-count">
          {label}
        </span>
        <button type="button" className="page-find-btn" title="上一个" aria-label="上一个" onClick={onPrev}>
          <ChevronUpIcon aria-hidden className="size-3.5" />
        </button>
        <button type="button" className="page-find-btn" title="下一个" aria-label="下一个" onClick={onNext}>
          <ChevronDownIcon aria-hidden className="size-3.5" />
        </button>
        <button type="button" className="page-find-btn" title="关闭" aria-label="关闭搜索" onClick={onClose}>
          <XMarkIcon aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <span ref={mark} hidden aria-hidden data-page-find-anchor="" />
      {host === undefined ? null : host ? createPortal(bar, host) : bar}
    </>
  )
}

export function isFindHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'f' || event.key === 'F'
}
