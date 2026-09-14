import { CodeBracketIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import { togglePageSourceMode, usePageSourceMode } from './source-mode.ts'

export function SourceToggle({ record, onDone }: { record: DbRecord; onDone?: () => void }) {
  const source = usePageSourceMode(record.id)
  const label = source ? '正文模式' : '源码模式'
  return (
    <button
      type="button"
      role="menuitem"
      className="fsdb-detail-more-item"
      data-testid="page-source-toggle"
      aria-pressed={source}
      onClick={() => {
        togglePageSourceMode(record.id)
        onDone?.()
      }}
    >
      <CodeBracketIcon aria-hidden className="size-4" />
      {label}
    </button>
  )
}

export function PageShareMenu({ record, onDone }: { record: DbRecord; onDone?: () => void }) {
  const [copied, setCopied] = useState('')
  const share = (role: 'editor' | 'viewer') => {
    void fetch('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageId: record.id, role }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { url?: string; error?: string }
        if (!res.ok || !body.url) throw new Error(body.error || '无法分享')
        await navigator.clipboard.writeText(body.url)
        setCopied(role)
        onDone?.()
      })
      .catch(() => setCopied(''))
  }
  return (
    <>
      <button type="button" role="menuitem" className="fsdb-detail-more-item" data-testid="page-share-edit" onClick={() => share('editor')}>
        {copied === 'editor' ? '已复制可编辑链接' : '分享这一页'}
      </button>
      <button type="button" role="menuitem" className="fsdb-detail-more-item" data-testid="page-share-lock" onClick={() => share('viewer')}>
        {copied === 'viewer' ? '已复制只读链接' : '分享只读（带锁）'}
      </button>
    </>
  )
}

export function PagesDetailTools({ record, onDone }: { record: DbRecord; onDone?: () => void }) {
  return (
    <>
      <PageShareMenu record={record} onDone={onDone} />
      <SourceToggle record={record} onDone={onDone} />
    </>
  )
}

