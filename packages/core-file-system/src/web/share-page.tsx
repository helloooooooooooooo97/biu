import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { FieldSpec } from '@biu/type-file-system'
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid'
import { parseSharePath, type ShareSnapshot } from '../share-snapshot.ts'
import { RecordDetail } from './record-detail.tsx'
import { formatField, defaultColumnKeys } from './fields.ts'
import { contentToMarkdown, markdownFileName, recordToMarkdown, zipMarkdownPack } from './export-markdown.ts'
import { ensureFsdbStyle } from './fsdb-style.ts'

function passwordKey(token: string) {
  return `fsdb.share.pw:${token}`
}

async function loadSnapshot(token: string, password = ''): Promise<ShareSnapshot | { needsPassword: true } | { error: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (password) headers['x-share-password'] = password
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
      method: password ? 'POST' : 'GET',
      headers,
      body: password ? JSON.stringify({ password }) : undefined,
    })
    const text = await res.text()
    let body: ShareSnapshot & { needsPassword?: boolean; error?: string }
    try {
      body = JSON.parse(text) as ShareSnapshot & { needsPassword?: boolean; error?: string }
    } catch {
      return { error: res.ok ? '分享页读不到数据' : `${res.status} ${res.statusText}` }
    }
    if (res.status === 401 || body.needsPassword) return { needsPassword: true }
    if (!res.ok) return { error: body.error || res.statusText }
    return body
  } catch (error) {
    return { error: String(error) }
  }
}

function rewriteAssetUrls(value: unknown, token: string, password: string): unknown {
  if (typeof value === 'string') {
    return value.replace(/\/api\/(?:db|page)\/file\//g, `/api/share/${encodeURIComponent(token)}/file/`)
  }
  if (Array.isArray(value)) return value.map((item) => rewriteAssetUrls(item, token, password))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = rewriteAssetUrls(item, token, password)
    return out
  }
  return value
}

export function ShareRoot() {
  const location = useLocation()
  const parsed = parseSharePath(location.pathname)
  if (!parsed) return null
  return <SharePage token={parsed.token} recordId={parsed.recordId} />
}

function SharePage({ token, recordId }: { token: string; recordId: string }) {
  ensureFsdbStyle()
  const navigate = useNavigate()
  const [password, setPassword] = useState(() => {
    try {
      return sessionStorage.getItem(passwordKey(token)) ?? ''
    } catch {
      return ''
    }
  })
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null)

  useEffect(() => {
    let alive = true
    void loadSnapshot(token, password).then((next) => {
      if (!alive) return
      if ('needsPassword' in next) {
        setLocked(true)
        setSnapshot(null)
        return
      }
      if ('error' in next) {
        setError(next.error)
        setSnapshot(null)
        return
      }
      setLocked(false)
      setSnapshot(next)
      if (password) {
        try {
          sessionStorage.setItem(passwordKey(token), password)
        } catch {
          /* ignore */
        }
      }
    })
    return () => {
      alive = false
    }
  }, [token, password])

  const selected = useMemo(() => {
    if (!snapshot) return null
    if (snapshot.kind === 'record') return snapshot.records[0] ?? null
    if (!recordId) return null
    return snapshot.records.find((row) => row.id === recordId) ?? null
  }, [snapshot, recordId])

  if (error) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <div className="fsdb-share-gate">
          <h1>无法打开</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <form
          className="fsdb-dlg"
          data-testid="fsdb-share-gate"
          onSubmit={(event) => {
            event.preventDefault()
            setPassword(draft)
          }}
        >
          <div className="fsdb-dlg-title">这份内容已加锁</div>
          <p className="fsdb-dlg-body">输入密码后即可查看。只有这份被分享的内容可见。</p>
          <input
            className="fsdb-dlg-input"
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="密码"
            data-testid="fsdb-share-gate-password"
          />
          <div className="fsdb-dlg-actions">
            <button type="submit" className="fsdb-dlg-ok">查看</button>
          </div>
        </form>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <p className="fsdb-empty">正在打开…</p>
      </div>
    )
  }

  const schema = snapshot.schema
  const live = snapshot
  const columns = snapshot.view?.columns?.length ? snapshot.view.columns : defaultColumnKeys(schema, Object.keys(schema.fields))
  const shown = selected ?? (snapshot.kind === 'record' ? snapshot.records[0] : null)
  if (recordId && !shown) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <div className="fsdb-share-gate">
          <h1>无法打开</h1>
          <p>这份分享里没有这条记录。</p>
        </div>
      </div>
    )
  }

  async function copyAll() {
    const files = live.records.map((row) => ({
      name: markdownFileName(row),
      text: recordToMarkdown(row, contentToMarkdown(live.contents[row.id])),
    }))
    if (files.length === 1) {
      await navigator.clipboard.writeText(files[0]!.text)
      return
    }
    const blob = zipMarkdownPack(files)
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = 'share.zip'
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="fsdb-share-page fsdb-page" data-testid="fsdb-share-page">
      <header className="chat-view-header">
        <div className="chat-view-header-left">
          <span className="chat-view-project-name">{snapshot.title}</span>
          <span className="fsdb-share-badge">只读</span>
        </div>
        <div className="chat-view-header-right">
          <button
            type="button"
            className="chat-view-header-expand"
            title="拷贝"
            aria-label="拷贝"
            data-testid="fsdb-share-download"
            onClick={() => void copyAll()}
          >
            <ArrowDownTrayIcon aria-hidden className="size-4" />
          </button>
        </div>
      </header>
      {shown ? (
        <RecordDetail
          selected={shown}
          schema={schema}
          draft={{}}
          detailBody={rewriteAssetUrls(snapshot.contents[shown.id], token, password)}
          labelOf={(row) => String(row.title ?? row.id)}
          renderCell={(row, key, field) => formatField(field, row[key]) || '—'}
          setDraft={() => undefined}
          writeOne={() => undefined}
          writePatch={() => undefined}
          onOpenRecord={undefined}
          readOnly
        />
      ) : (
        <div className="fsdb-share-list">
          <table className="tasks-table">
            <thead>
              <tr>
                {columns.map((key) => (
                  <th key={key}>{String(schema.fields[key]?.label ?? key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.records.map((row) => (
                <tr
                  key={row.id}
                  data-testid="fsdb-share-row"
                  onClick={() => navigate(`/share/${encodeURIComponent(token)}/r/${encodeURIComponent(row.id)}`)}
                >
                  {columns.map((key) => (
                    <td key={key}>{formatField(schema.fields[key] as FieldSpec | undefined, row[key]) || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {snapshot.records.length === 0 ? <p className="fsdb-empty">暂无记录</p> : null}
        </div>
      )}
    </div>
  )
}
