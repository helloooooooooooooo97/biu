import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  CameraIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'
import { AnchorMenu } from '@biu/public-ui'
import { setChatOverlay } from './chat-overlay.ts'
import { chromeIcon } from './chrome-icon.ts'
import { applyNoticeClick, noticeIdOf } from './notice-open.ts'
import { readMainDataRoute } from '@biu/core-file-system/main-data-route'
import { persistTheme, readTheme, type ThemeMode } from './theme.ts'
import { persistWorkspaceProfile, useWorkspaceProfile } from '@biu/public-ui'

async function readAvatarFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('无法读取图片'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    const size = 160
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法裁切头像')
    const edge = Math.min(image.width, image.height)
    ctx.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.84)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ShellSettingsAccount() {
  const profile = useWorkspaceProfile()
  const [name, setName] = useState(profile.name)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(profile.name)
  }, [profile.name])

  const initial = (profile.name.trim() || '用户').slice(0, 1)

  return (
    <section className="settings-account" data-testid="settings-account">
      <header className="settings-account-head">
        <h3 className="settings-account-title">我的账户</h3>
        <p className="settings-muted settings-account-lead">
          头像和昵称会出现在左上角、创建人，以及你发出的分享上。
        </p>
      </header>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">照片</p>
          <p className="settings-muted settings-account-hint">点击更换。会出现在侧栏和分享页。</p>
        </div>
        <div className="settings-account-photo">
          <button
            type="button"
            className="settings-account-avatar"
            data-testid="settings-account-avatar"
            title="更换照片"
            aria-label="更换照片"
            onClick={() => fileRef.current?.click()}
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <span className="settings-account-initial">{initial}</span>
            )}
            <span className="settings-account-avatar-veil" aria-hidden>
              <CameraIcon className="size-4" />
            </span>
          </button>
          {profile.avatar ? (
            <button
              type="button"
              className="settings-account-clear"
              data-testid="settings-account-clear-avatar"
              onClick={() => void persistWorkspaceProfile({ name: name.trim(), avatar: '' })}
            >
              移除
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="settings-account-avatar-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void readAvatarFile(file).then((avatar) => {
              void persistWorkspaceProfile({ name: name.trim(), avatar })
            })
          }}
        />
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-account-name">
            首选名称
          </label>
          <p className="settings-muted settings-account-hint">别人看到你时会用这个名字。</p>
        </div>
        <input
          id="settings-account-name"
          className="settings-account-input"
          value={name}
          maxLength={40}
          placeholder="你的名字"
          data-testid="settings-account-name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            void persistWorkspaceProfile({ name: name.trim(), avatar: profile.avatar })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>
    </section>
  )
}

export function ShellSettingsAppearance() {
  const [theme, setTheme] = useState(readTheme)

  const pick = (next: ThemeMode) => {
    persistTheme(next)
    setTheme(next)
  }

  return (
    <section data-testid="settings-appearance">
      <h3 className="settings-pane-title">外观</h3>
      <p className="settings-muted settings-pane-lead">界面颜色。日间是浅色，夜间是深色。</p>
      <div className="settings-theme-grid">
        <button
          type="button"
          className={`settings-theme-card${theme === 'light' ? ' is-on' : ''}`}
          data-theme-card="light"
          aria-pressed={theme === 'light'}
          data-testid="settings-theme-light"
          onClick={() => pick('light')}
        >
          <span className="settings-theme-preview is-light" aria-hidden />
          日间模式
        </button>
        <button
          type="button"
          className={`settings-theme-card${theme === 'dark' ? ' is-on' : ''}`}
          data-theme-card="dark"
          aria-pressed={theme === 'dark'}
          data-testid="settings-theme-dark"
          onClick={() => pick('dark')}
        >
          <span className="settings-theme-preview is-dark" aria-hidden />
          夜间模式
        </button>
      </div>
    </section>
  )
}

export function ShellSettingsAbout() {
  return (
    <section data-testid="settings-about">
      <h3 className="settings-pane-title">关于</h3>
      <p className="settings-pane-title" style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 8px' }}>Biu Agent OS</p>
      <p className="settings-muted m-0">Apache License 2.0。</p>
      <p className="settings-muted m-0" style={{ marginTop: 12 }}>
        public/grok-bot/ 角色素材归 xAI，不随 Apache-2.0 授权。详见 NOTICE.md。
      </p>
    </section>
  )
}

export function ShellSettingsShortcuts() {
  return (
    <section data-testid="settings-shortcuts">
      <h3 className="settings-pane-title">快捷键</h3>
      <p className="settings-muted settings-pane-lead">Windows 与 Linux 上 ⌘ 用 Ctrl。选取也可用 ⌘Q。编辑器内 ⌘F 为正文查找，⌘⇧F 仍打开全局搜索。</p>
      <ul className="settings-shortcut-list">
        <li>
          <span>搜索</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>F</kbd> / <kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd></span>
        </li>
        <li>
          <span>快速选取</span>
          <span className="settings-kbd"><kbd>Ctrl</kbd><kbd>Q</kbd></span>
        </li>
        <li>
          <span>选区送到对话</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>L</kbd></span>
        </li>
      </ul>
    </section>
  )
}

export function ShellSettingsUpdate() {
  const [behind, setBehind] = useState(0)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | undefined>()

  useEffect(() => {
    void fetch('/api/update')
      .then((res) => res.json() as Promise<{ behind?: number }>)
      .then((data) => setBehind(Math.max(0, Number(data.behind) || 0)))
      .catch(() => { })
  }, [])

  const download = useCallback(async () => {
    if (busy) return
    if (behind <= 0) {
      setHint('相对于主分支暂时无最新提交版本')
      return
    }
    setBusy(true)
    setHint(undefined)
    try {
      const res = await fetch('/api/update', { method: 'POST' })
      const data = (await res.json()) as { error?: string; restarting?: boolean }
      if (!res.ok) throw new Error(data.error || '更新失败')
      setBehind(0)
      setHint('正在重启…')
    } catch (error) {
      setBusy(false)
      setHint(String(error))
    }
  }, [busy, behind])

  const badge = behind > 99 ? '99+' : String(behind)

  return (
    <section className="shell-settings-update" data-testid="settings-update">
      <h3 className="settings-pane-title">更新</h3>
      <p className="settings-muted settings-pane-lead">
        {behind > 0 ? `当前落后主分支 ${badge} 个提交。` : '已与主分支对齐。'}
      </p>
      <button
        type="button"
        className="shell-settings-update-btn"
        data-testid="settings-update-download"
        disabled={busy}
        onClick={() => void download()}
      >
        <ArrowDownTrayIcon className="size-4" />
        {busy ? '更新中…' : '下载更新'}
      </button>
      {hint ? (
        <p className="settings-muted mt-3 mb-0" role="status">
          {hint}
        </p>
      ) : null}
    </section>
  )
}

function SideAction({
  title,
  active,
  testId,
  onClick,
  icon,
  children,
  buttonRef,
}: {
  title: string
  active?: boolean
  testId: string
  onClick: () => void
  icon: ReactNode
  children?: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`app-side-actions-item${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="app-side-actions-icon" aria-hidden>
        {icon}
      </span>
      <span className="app-side-actions-label">{title}</span>
      {children}
    </button>
  )
}

type NoticeRow = {
  id: string
  title?: string
  body?: string
  kind?: string
  read?: boolean
  href?: string
}

function sessionIdFromPath(path: string) {
  const match = path.match(/^\/s\/([^/]+)/)
  return match ? decodeURIComponent(match[1]!) : ''
}

function noticeHref(row: NoticeRow) {
  return String(row.href ?? '').trim()
}

function noticeIsForSession(row: NoticeRow, sessionId: string) {
  if (!sessionId) return false
  const href = noticeHref(row)
  return href === `/s/${sessionId}` || href === `/s/${encodeURIComponent(sessionId)}`
}

function noticeKindLabel(kind?: string) {
  if (kind === 'approval') return '审批'
  if (kind === 'task') return '任务'
  if (kind === 'session') return '会话'
  return ''
}

function NoticeBell({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<NoticeRow[]>([])
  const looking = sessionIdFromPath(location.pathname)

  const load = useCallback(() => {
    void fetch('/api/db/list?path=/notices&sort=createdAt&dir=desc&limit=40&columns=title,body,kind,read,href,createdAt')
      .then((res) => res.json() as Promise<{ items?: Array<Record<string, unknown>> }>)
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : []
        setRows(
          items.flatMap((item) => {
            const id = noticeIdOf(item)
            if (!id) return []
            return [{
              id,
              title: String(item.title ?? ''),
              body: String(item.body ?? ''),
              kind: String(item.kind ?? ''),
              read: item.read === true,
              href: String(item.href ?? ''),
            }]
          }),
        )
      })
      .catch(() => setRows([]))
  }, [])

  useEffect(() => {
    load()
    const onChange = () => load()
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  }, [load])

  const unread = rows.filter((row) => row.read !== true && !noticeIsForSession(row, looking))
  const inbox = rows.filter((row) => row.read !== true)
  const badge = unread.length > 99 ? '99+' : unread.length ? String(unread.length) : ''
  const triggerRef = useRef<HTMLButtonElement>(null)

  const clearAll = () => {
    setRows([])
    void fetch('/api/db/notices/clear', { method: 'POST' })
      .then(() => load())
      .catch(() => load())
  }

  const openRow = (row: NoticeRow) => {
    if (!row.id) return
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, read: true } : item)))
    const href = applyNoticeClick(row)
    void fetch('/api/db/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: `/notices/${row.id}`, content: { read: true } }),
    })
      .then(() => load())
      .catch(() => load())
    onOpenChange(false)
    if (!href) return
    setChatOverlay(false)
    navigate(href)
  }

  return (
    <div className="shell-side-pop-wrap">
      <SideAction
        title="通知"
        active={open}
        testId="chrome-notify"
        icon={<BellIcon {...chromeIcon} />}
        buttonRef={triggerRef}
        onClick={() => onOpenChange(!open)}
      >
        {badge ? (
          <span className="shell-notify-badge" data-testid="chrome-notify-badge">
            {badge}
          </span>
        ) : null}
      </SideAction>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => onOpenChange(false)}
          placement="right"
          minWidth={320}
          zIndex={80}
          className="shell-side-pop shell-notify-pop"
          role="dialog"
          aria-label="通知"
          data-testid="chrome-notify-pop"
        >
          <div className="shell-notify-head">
            <span className="shell-notify-head-title">通知</span>
            {inbox.length ? (
              <button
                type="button"
                className="shell-notify-clear"
                data-testid="chrome-notify-clear"
                title="全部已读并清空"
                aria-label="全部已读并清空"
                onClick={() => clearAll()}
              >
                <CheckIcon className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          {inbox.length ? (
            <ul className="shell-notify-list">
              {inbox.map((row) => {
                const kind = noticeKindLabel(row.kind)
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`shell-notify-item${row.read === true ? '' : ' is-unread'}`}
                      data-testid="chrome-notify-item"
                      onClick={() => openRow(row)}
                    >
                      {kind ? <span className="shell-notify-kind">{kind}</span> : null}
                      <span className="shell-notify-title">{row.title || '通知'}</span>
                      {row.body ? <span className="shell-notify-body">{row.body}</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="shell-chrome-pop-empty">暂无通知</p>
          )}
        </AnchorMenu>
      ) : null}
    </div>
  )
}

/** 公共入口：聊天与数据侧栏共用。 */
export function ShellSidePlaces({
  activeId,
  agentHref,
  onSettings,
  onSearch,
  searchOpen = false,
}: {
  activeId: string
  agentHref: string
  onSettings: () => void
  onSearch?: () => void
  searchOpen?: boolean
}) {
  const navigate = useNavigate()
  const [notifyOpen, setNotifyOpen] = useState(false)

  return (
    <div className="app-side-actions shell-side-places" role="navigation" aria-label="面板" data-testid="shell-side-places">
      <SideAction
        title="搜索"
        active={searchOpen}
        testId="chrome-search"
        icon={<MagnifyingGlassIcon {...chromeIcon} />}
        onClick={() => {
          setNotifyOpen(false)
          onSearch?.()
        }}
      />
      <NoticeBell
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
      />
      <SideAction
        title="设置"
        testId="chrome-settings"
        icon={<Cog6ToothIcon {...chromeIcon} />}
        onClick={onSettings}
      />
      <SideAction
        title="会话"
        active={activeId === 'agent'}
        testId="chrome-chat-panel"
        icon={<ChatBubbleLeftRightIcon {...chromeIcon} />}
        onClick={() => {
          setChatOverlay(false)
          navigate(agentHref)
        }}
      />
      <SideAction
        title="数据"
        active={activeId === 'database'}
        testId="chrome-data-panel"
        icon={<CircleStackIcon {...chromeIcon} />}
        onClick={() => {
          setChatOverlay(false)
          navigate(readMainDataRoute() || '/database')
        }}
      />
    </div>
  )
}
