import { useEffect, useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import { HeadlessPopover } from '@biu/public-ui'
import { LockClosedIcon, ShareIcon } from '@heroicons/react/16/solid'

type ShareRow = { role: 'editor' | 'viewer'; url: string; locked?: boolean }

function onShareRoute() {
  return typeof location !== 'undefined' && /^\/share\//.test(location.pathname)
}

export function PageShareHeader({ record }: { record: DbRecord }) {
  return <PageShareButton pageId={record.id} />
}

export function PageShareButton({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [current, setCurrent] = useState<ShareRow | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    void fetch(`/api/shares?pageId=${encodeURIComponent(pageId)}`)
      .then((res) => res.json())
      .then((body: { shares?: ShareRow[] }) => {
        const row = body.shares?.[0]
        setCurrent(row ?? null)
        if (row?.role === 'viewer' || row?.role === 'editor') setRole(row.role)
      })
      .catch(() => undefined)
  }, [open, pageId])

  if (onShareRoute()) return null

  const copy = (next = role) => {
    setBusy(true)
    setError('')
    void fetch('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageId, role: next }),
    })
      .then(async (res) => {
        const body = (await res.json()) as ShareRow & { error?: string }
        if (!res.ok || !body.url) throw new Error(body.error || '只有创建人可以分享')
        await navigator.clipboard.writeText(body.url)
        setCurrent({ role: next, url: body.url, locked: next === 'viewer' })
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      })
      .catch((err: Error) => setError(String(err.message || err)))
      .finally(() => setBusy(false))
  }

  const stop = () => {
    setBusy(true)
    void fetch(`/api/shares?pageId=${encodeURIComponent(pageId)}`, { method: 'DELETE' })
      .then(() => {
        setCurrent(null)
        setCopied(false)
      })
      .finally(() => setBusy(false))
  }

  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <button
          type="button"
          className={`page-share-btn${current ? ' is-on' : ''}`}
          data-testid="page-share"
          title="分享这一页"
          aria-label="分享这一页"
          aria-expanded={open}
        >
          {current?.role === 'viewer' ? <LockClosedIcon aria-hidden className="size-4" /> : <ShareIcon aria-hidden className="size-4" />}
          分享
        </button>
      }
    >
      <div className="page-share-pop" data-testid="page-share-pop" role="dialog" aria-label="分享这一页">
        <h2>分享这一页</h2>
        <p>对方打开链接只能进这一页，看不到你工作区里的其他页面。</p>
        <div className="page-share-roles">
          <button
            type="button"
            className={role === 'editor' ? 'is-on' : undefined}
            data-testid="page-share-edit"
            onClick={() => setRole('editor')}
          >
            可编辑
          </button>
          <button
            type="button"
            className={role === 'viewer' ? 'is-on' : undefined}
            data-testid="page-share-lock"
            onClick={() => setRole('viewer')}
          >
            <LockClosedIcon aria-hidden className="size-3.5" />
            只读（带锁）
          </button>
        </div>
        {error ? <p className="page-share-error">{error}</p> : null}
        <button type="button" className="page-share-copy" disabled={busy} onClick={() => copy()}>
          {copied ? '已复制链接' : current ? '复制链接' : '开启并复制链接'}
        </button>
        {current ? (
          <button type="button" className="page-share-stop" disabled={busy} onClick={stop}>
            停止分享
          </button>
        ) : null}
      </div>
    </HeadlessPopover>
  )
}
