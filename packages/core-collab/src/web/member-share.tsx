import { useEffect, useState } from 'react'

type Member = { id: string; name: string; role: string }

export function MemberShare({ onDone }: { record?: unknown; onDone?: () => void }) {
  const [copied, setCopied] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [me, setMe] = useState<Member | null>(null)

  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: Member | null }) => setMe(body.member ?? null))
  }, [])

  if (me?.role !== 'owner') return null

  return (
    <button
      type="button"
      role="menuitem"
      className="fsdb-detail-more-item"
      onClick={() => {
        void (async () => {
          const invite = await fetch('/api/members/invite', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role }),
          }).then((res) => res.json()) as { url?: string; error?: string }
          if (!invite.url) return
          await navigator.clipboard.writeText(invite.url)
          setCopied(invite.url)
          setRole(role === 'editor' ? 'viewer' : 'editor')
          onDone?.()
        })()
      }}
    >
      {copied ? '已复制邀请链接' : `邀请${role === 'editor' ? '编辑' : '只读'}成员`}
    </button>
  )
}
