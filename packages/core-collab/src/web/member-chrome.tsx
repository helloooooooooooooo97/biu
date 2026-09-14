import { useEffect, useState } from 'react'
import type { CollectionChrome, FsActionsProps, FsCellProps } from '@biu/type-file-system/ui'
import type { DbRecord } from '@biu/type-file-system'

const ROLE_LABEL: Record<string, string> = { owner: '创建人', editor: '编辑人', viewer: '只读' }

function RoleCell({ fallback }: FsCellProps) {
  return <span>{ROLE_LABEL[fallback] ?? fallback}</span>
}

function MemberTitle({ record, label }: { record: DbRecord; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium">{label}</span>
      <span className="text-(--dsw-label-3) text-[12px]">{ROLE_LABEL[String(record.role ?? '')] ?? ''}</span>
    </span>
  )
}

async function copyInvite(role: 'editor' | 'viewer') {
  const invite = (await fetch('/api/members/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  }).then((res) => res.json())) as { url?: string; error?: string }
  if (!invite.url) throw new Error(invite.error || '无法邀请')
  await navigator.clipboard.writeText(invite.url)
  return invite.url
}

export function MemberToolbar() {
  const [me, setMe] = useState<{ role?: string } | null>(null)
  const [copied, setCopied] = useState('')
  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: { role?: string } | null }) => setMe(body.member ?? null))
  }, [])
  if (me?.role !== 'owner') return null
  const invite = (role: 'editor' | 'viewer') => {
    void copyInvite(role)
      .then((url) => setCopied(url))
      .catch(() => setCopied(''))
  }
  return (
    <div className="member-toolbar" data-testid="member-toolbar">
      <button type="button" className="fsdb-create-btn" onClick={() => invite('editor')}>
        邀请编辑
      </button>
      <button type="button" className="fsdb-create-btn" onClick={() => invite('viewer')}>
        邀请只读
      </button>
      {copied ? <span className="member-toolbar-copied">已复制邀请链接</span> : null}
    </div>
  )
}

export function MemberShare({ onDone }: { record?: unknown; onDone?: () => void }) {
  const [me, setMe] = useState<{ role?: string } | null>(null)
  const [copied, setCopied] = useState('')
  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: { role?: string } | null }) => setMe(body.member ?? null))
  }, [])
  if (me?.role !== 'owner') return null
  return (
    <button
      type="button"
      role="menuitem"
      className="fsdb-detail-more-item"
      onClick={() => {
        void copyInvite('editor')
          .then((url) => {
            setCopied(url)
            onDone?.()
          })
          .catch(() => undefined)
      }}
    >
      {copied ? '已复制邀请链接' : '邀请成员'}
    </button>
  )
}

function MemberActions({ actions, record, busy, place, run }: FsActionsProps) {
  return (
    <>
      {place === 'detail' ? <MemberShare record={record} /> : null}
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={place === 'detail' ? 'fsdb-detail-more-item' : 'tasks-icon-btn'}
          disabled={busy}
          onClick={() => run(action)}
        >
          {action.label}
        </button>
      ))}
    </>
  )
}

export const membersChrome: CollectionChrome = {
  cells: { role: RoleCell },
  Title: MemberTitle,
  Toolbar: MemberToolbar,
  Actions: MemberActions,
  DetailTools: MemberShare,
}
