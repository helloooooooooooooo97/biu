import { useEffect, useState } from 'react'
import { ArrowUturnLeftIcon } from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { readJson } from './db-client.ts'

type TrashItem = {
  id: string
  path: string
  collection: string
  collectionLabel: string
  title: string
  deletedAt: number
}

export function RecycleBin() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function reload() {
    const body = await readJson<{ items?: TrashItem[] }>('/api/db/trash')
    setItems(Array.isArray(body.items) ? body.items : [])
  }

  useEffect(() => {
    void reload().catch((err) => setError(String(err)))
  }, [])

  async function restore(item: TrashItem) {
    setBusy(item.path)
    try {
      await readJson('/api/db/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: item.collection, ids: [item.id] }),
      })
      await reload()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function purge(item: TrashItem) {
    setBusy(item.path)
    try {
      await readJson('/api/db/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: item.collection, ids: [item.id], purge: true }),
      })
      await reload()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fsdb-right" data-testid="fsdb-recycle-bin">
        <header className="chat-view-header">
          <div className="chat-view-header-left">
            <span className="chat-view-project">
              <TrashGlyph className="size-4 chat-view-project-icon" />
              <span className="chat-view-project-name">回收站</span>
            </span>
          </div>
        </header>
        <div className="fsdb-right-body">
          <div className="app-pane-in">
            <div className="fsdb-main" style={{ paddingTop: 24 }}>
              <p className="fsdb-empty" style={{ margin: '0 0 16px', maxWidth: 'none' }}>
                删除的页面和记录还在原表里，只是列表里不显示。恢复会重新出现；彻底删除才不可恢复。
              </p>
              {error ? <p className="fsdb-empty">{error}</p> : null}
              {!items.length && !error ? <p className="fsdb-empty">回收站是空的</p> : null}
              {items.length ? (
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th>来源</th>
                      <th>删除时间</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.path}>
                        <td>{item.title}</td>
                        <td>{item.collectionLabel}</td>
                        <td>{new Date(item.deletedAt).toLocaleString()}</td>
                        <td>
                          <button
                            type="button"
                            className="tasks-icon-btn"
                            title="恢复"
                            disabled={busy === item.path}
                            onClick={() => void restore(item)}
                          >
                            <ArrowUturnLeftIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="tasks-icon-btn"
                            title="彻底删除"
                            disabled={busy === item.path}
                            onClick={() => void purge(item)}
                          >
                            <TrashGlyph className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </div>
    </div>
  )
}
