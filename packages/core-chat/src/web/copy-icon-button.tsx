import { useState } from 'react'
import { CheckIcon, Square2StackIcon } from '@heroicons/react/16/solid'
import { copyText } from './copy-text.ts'

export function CopyIconButton({
  text,
  className,
  label = '复制',
}: {
  text: string
  className?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const title = copied ? '已复制' : label
  return (
    <button
      type="button"
      className={`${className ?? ''}${copied ? ' is-done' : ''}`.trim()}
      title={title}
      aria-label={title}
      data-testid="chat-code-copy"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!text.trim()) return
        void copyText(text).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
    >
      {copied ? <CheckIcon aria-hidden className="size-3.5" /> : <Square2StackIcon aria-hidden className="size-3.5" />}
    </button>
  )
}
