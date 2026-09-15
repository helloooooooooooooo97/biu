import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { isMascotDancing, subscribeMascotDance } from '@biu/public-mascot'
import { ChatCount, SidebarFold } from '@biu/public-ui'
import {
  bindSessionView,
  type SessionListItem,
  type SessionViewService,
} from '@biu/web-session-view'
import {
  PINNED_GROUP_KEY,
  UNGROUPED_PROJECT_KEY,
  UNGROUPED_TAG_KEY,
  buildSidebarSections,
  type SidebarGroupBy,
  type SidebarSectionKind,
} from '@biu/web-session-view'
import { useSidebarCollapseStore } from '@biu/web-session-view'
import { SidebarMascot } from '@biu/public-mascot'
import { resolveSessionMascot } from '@biu/public-mascot'
import { FolderGlyph } from '@biu/web-session-view/folder-glyph'
import { chromeIcon, chromeIconClass } from './chrome-icon.ts'
import { isChatPagePath, openOverlayComposer } from './chat-overlay.ts'
import { ShellSidebarFrame } from './shell-sidebar-frame.tsx'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  StarIcon,
  FolderIcon,
  TagIcon,
  FolderMinusIcon,
  BookmarkSlashIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'

/** 项目/标签分组视图的持久化 key。 */
const GROUP_BY_KEY = 'cordis.sidebar.groupBy'

function readGroupBy(): SidebarGroupBy {
  try {
    return localStorage.getItem(GROUP_BY_KEY) === 'tag' ? 'tag' : 'project'
  } catch {
    return 'project'
  }
}

/** 每行 tag 徽标：最多显示 2 个，其余以 +N（剩余数量）展示。 */
function SessionTagBadges({ tags }: { tags?: string[] }) {
  const list = (tags ?? []).map((tag) => tag.trim()).filter(Boolean)
  if (!list.length) return null
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-0.5 pl-0.5">
      {shown.map((tag) => (
        <span
          key={tag}
          className="sidebar-tag max-w-18 truncate rounded-sm bg-(--dsw-hover-weak,var(--dsw-hover)) px-1"
        >
          {tag}
        </span>
      ))}
      {extra > 0 ? (
        <span className="sidebar-tag shrink-0 rounded-sm px-0.5 opacity-80">
          +{extra}
        </span>
      ) : null}
    </span>
  )
}

const sessionRowMainClass =
  'flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5'

const SessionRow = memo(function SessionRow({
  item,
  active,
  busy,
  dancing,
  onDelete,
  onPin,
  onOpen,
}: {
  item: SessionListItem
  active: boolean
  busy: boolean
  dancing: boolean
  onDelete: (item: SessionListItem) => void
  onPin: (item: SessionListItem) => void
  onOpen?: (item: SessionListItem) => void
}) {
  const identity = resolveSessionMascot(item.id, item.mascot)
  const pinned = Boolean(item.pinned)
  const inner = (
    <>
      <SidebarMascot
        size={20}
        sessionId={item.id}
        identity={identity}
        busy={busy}
        animate={false}
        dancing={dancing}
        title={dancing ? '跳舞中 🎉' : `${identity.shape} · ${identity.color}`}
      />
      <span className="sidebar-label min-w-0 flex-1 truncate font-medium">
        {item.title}
      </span>
      <SessionTagBadges tags={item.tags} />
    </>
  )
  return (
    <div
      className={`chat-session-row group${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}`}
      data-biu-kind="session"
      data-biu-id={item.id}
      data-biu-label={item.title}
    >
      {onOpen ? (
        <button
          type="button"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onClick={() => onOpen(item)}
          className={sessionRowMainClass}
        >
          {inner}
        </button>
      ) : (
        <Link
          to={`/s/${item.id}`}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          className={sessionRowMainClass}
        >
          {inner}
        </Link>
      )}
      <button
        type="button"
        className="chat-session-row-delete"
        aria-label={`Delete session ${item.title}`}
        title="Delete"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onDelete(item)
        }}
      >
        <TrashGlyph {...chromeIcon} />
      </button>
      <button
        type="button"
        className={`chat-session-row-star${pinned ? ' is-on' : ''}`}
        aria-pressed={pinned}
        aria-label={pinned ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
        title={pinned ? '取消收藏' : '收藏'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onPin(item)
        }}
      >
        <StarIcon className={chromeIconClass(pinned ? 'text-[#f5b700]' : undefined)} />
      </button>
    </div>
  )
})

export type ChatSidebarProps = {
  visible: boolean
  narrow?: boolean
  showTags?: boolean
  variant?: 'page' | 'popover'
  routeSessionId: string | null
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
  onCollapse?: () => void
  onExpand?: () => void
  onWidthChange?: (width: number) => void
  onActivate?: () => void
  embedded?: boolean
}

/**
 * 独立订阅折叠态与 sessions：组展开/收缩只重渲侧栏，不拖垮 Shell 里的 Chat Markdown 主区。
 */
export const ChatSidebar = memo(function ChatSidebar({
  visible,
  narrow = false,
  showTags = false,
  variant = 'page',
  routeSessionId,
  useSessionView,
  sessionView,
  onCollapse,
  onExpand,
  onWidthChange,
  onActivate,
  embedded = false,
}: ChatSidebarProps) {
  const navigate = useNavigate()
  const sessions = useSessionView((state) => state.sessions)
  const sessionId = useSessionView((state) => state.sessionId)
  // 用签名订阅，避免 busySessions 对象引用抖动导致整栏重渲
  const busySignature = useSessionView((state) =>
    Object.keys(state.busySessions)
      .sort()
      .join(','),
  )
  const busySessions = useMemo(() => {
    const map: Record<string, true> = {}
    if (!busySignature) return map
    for (const id of busySignature.split(',')) {
      if (id) map[id] = true
    }
    return map
  }, [busySignature])
  const collapsedProjects = useSidebarCollapseStore((state) => state.collapsed)
  const toggleProjectGroup = useSidebarCollapseStore((state) => state.toggle)
  const expandProjectGroup = useSidebarCollapseStore((state) => state.expand)
  // 数据分组视图：项目树 / 标签树（持久化记忆用户选择）
  const [groupBy, setGroupBy] = useState<SidebarGroupBy>(readGroupBy)
  const changeGroupBy = useCallback((next: SidebarGroupBy) => {
    setGroupBy(next)
    // 完整保存/恢复，不截断
    try {
      localStorage.setItem(GROUP_BY_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])
  // 板块并存：收藏 + (项目|标签)，由上而下
  const sections = useMemo(() => buildSidebarSections(sessions, groupBy), [sessions, groupBy])
  // 板块级收缩（点击标题可展开/收缩，不显示收缩按钮，层级靠 kind 图标表达）
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<SidebarSectionKind, boolean>>>({})
  const [pendingDelete, setPendingDelete] = useState<SessionListItem | null>(null)
  const toggleSection = useCallback((kind: SidebarSectionKind) => {
    setCollapsedSections((prev) => ({ ...prev, [kind]: !prev[kind] }))
  }, [])
  const dancing = useSyncExternalStore(
    subscribeMascotDance,
    () => isMascotDancing(),
    () => false,
  )
  const prevRouteSessionRef = useRef<string | null>(null)

  // 仅在「切到」另一会话时展开其所在组；列表刷新不会顶开用户刚折叠的组
  useLayoutEffect(() => {
    const prev = prevRouteSessionRef.current
    prevRouteSessionRef.current = routeSessionId
    if (!routeSessionId || prev === routeSessionId) return
    const group = sections
      .flatMap((section) => section.groups ?? [])
      .find((item) => item.sessions.some((row) => row.id === routeSessionId))
    if (!group || group.key === PINNED_GROUP_KEY) return
    expandProjectGroup(group.key)
  }, [routeSessionId, sections, expandProjectGroup])

  const highlightId = variant === 'popover' ? sessionId : routeSessionId

  const createChat = useCallback(
    (opts: { projectPath?: string } = {}) => {
      void sessionView.newSession(opts).then((id) => {
        onActivate?.()
        if (isChatPagePath(window.location.pathname)) {
          navigate(`/s/${id}`)
          return
        }
        if (variant === 'popover') {
          openOverlayComposer({ revealThread: true })
          return
        }
        navigate(`/s/${id}`)
      })
    },
    [navigate, onActivate, sessionView, variant],
  )

  const openSession = useCallback(
    (item: SessionListItem) => {
      void sessionView.load(item.id, { view: 'chat' })
      if (isChatPagePath(window.location.pathname)) {
        navigate(`/s/${item.id}`)
      } else {
        openOverlayComposer({ revealThread: true })
      }
      onActivate?.()
    },
    [navigate, onActivate, sessionView],
  )

  const requestDeleteChat = useCallback((item: SessionListItem) => {
    setPendingDelete(item)
  }, [])

  const confirmDeleteChat = useCallback(() => {
    if (!pendingDelete) return
    const item = pendingDelete
    setPendingDelete(null)
    const wasActive = item.id === sessionId
    void sessionView.deleteSession(item.id).then(() => {
      if (variant === 'popover') return
      if (!wasActive) return
      const next = sessionView.get().sessionId
      navigate(next ? `/s/${next}` : '/')
    })
  }, [navigate, pendingDelete, sessionId, sessionView, variant])

  const pinChat = useCallback(
    (item: SessionListItem) => {
      void sessionView.setSessionPinned(item.id, !item.pinned)
    },
    [sessionView],
  )

  const body = (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        <div className="mt-2 space-y-1.5">
          {sessions.length === 0 ? null : (
            sections.map((section) => {
              const sectionCollapsed = Boolean(collapsedSections[section.kind])
              return (
                <section key={section.kind} className="min-w-0">
                  {/* 板块标题：收藏 / (项目|标签)，可点击整行展开/收缩；层级靠 kind 图标表达；悬浮时右侧露出分组切换 tab */}
                  <div className="sidebar-section-head min-w-0">
                    <div className="flex min-w-0 min-h-8 flex-1 items-center">
                      <button
                        type="button"
                        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                        aria-expanded={!sectionCollapsed}
                        onClick={() => toggleSection(section.kind)}
                      >
                        <span className="sidebar-label min-w-0 flex-1 truncate tracking-normal">{section.label}</span>
                      </button>
                      {section.kind !== 'pinned' ? (
                        <div
                          className="sidebar-view-switch"
                          role="group"
                          aria-label="分组视图切换"
                        >
                          <button
                            type="button"
                            title="按项目分组"
                            aria-pressed={groupBy === 'project'}
                            className={`sidebar-view-switch-btn${groupBy === 'project' ? ' is-on' : ''}`}
                            onClick={() => changeGroupBy('project')}
                          >
                            <FolderIcon {...chromeIcon} />
                          </button>
                          <button
                            type="button"
                            title="按标签分组"
                            aria-pressed={groupBy === 'tag'}
                            className={`sidebar-view-switch-btn${groupBy === 'tag' ? ' is-on' : ''}`}
                            onClick={() => changeGroupBy('tag')}
                          >
                            <TagIcon {...chromeIcon} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <ChatCount
                      count={
                        section.sessions
                          ? section.sessions.length
                          : section.groups?.reduce((sum, g) => sum + g.sessions.length, 0) ?? 0
                      }
                    />
                  </div>

                  <SidebarFold open={!sectionCollapsed}>
                    <div className="flex min-w-0 flex-col gap-px pt-0.5">
                      {section.sessions
                        ? section.sessions.map((item) => (
                          <SessionRow
                            key={`pinned:${item.id}`}
                            item={item}
                            active={item.id === highlightId}
                            busy={Boolean(busySessions[item.id])}
                            dancing={dancing}
                            onDelete={requestDeleteChat}
                            onPin={pinChat}
                            onOpen={variant === 'popover' ? openSession : undefined}
                          />
                        ))
                        : section.groups?.map((group) => {
                          const collapsed = Boolean(collapsedProjects[group.key])
                          const isUngrouped = group.key === UNGROUPED_PROJECT_KEY || group.key === UNGROUPED_TAG_KEY
                          const canAddHere = group.kind === 'project' || group.kind === 'ungrouped'
                          return (
                            <div key={group.key} className="min-w-0">
                              <div className="sidebar-group-head">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit outline-none hover:text-(--dsw-sidebar-fg-active) focus-visible:ring-1 focus-visible:ring-(--dsw-border)"
                                  title={group.path ?? group.label}
                                  aria-expanded={!collapsed}
                                  onClick={() => toggleProjectGroup(group.key)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      toggleProjectGroup(group.key)
                                    }
                                  }}
                                >
                                  <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
                                    <span className="sidebar-group-fold-face">
                                      {group.kind === 'pinned' ? (
                                        <StarIcon className={chromeIconClass('text-[#f5b700]')} />
                                      ) : group.key === UNGROUPED_PROJECT_KEY ? (
                                        <FolderMinusIcon className={chromeIconClass('opacity-80')} />
                                      ) : group.key === UNGROUPED_TAG_KEY ? (
                                        <BookmarkSlashIcon className={chromeIconClass('opacity-80')} />
                                      ) : group.kind === 'tag' ? (
                                        <TagIcon className={chromeIconClass('opacity-80')} />
                                      ) : (
                                        <FolderGlyph className="opacity-80" />
                                      )}
                                    </span>
                                    <span className="sidebar-group-fold-chevron">
                                      {collapsed ? (
                                        <ChevronRightIcon className={chromeIconClass('opacity-80')} />
                                      ) : (
                                        <ChevronDownIcon className={chromeIconClass('opacity-80')} />
                                      )}
                                    </span>
                                  </span>
                                  <span className="sidebar-label min-w-0 flex-1 truncate">{group.label}</span>
                                  {canAddHere ? (
                                    <button
                                      type="button"
                                      className="sidebar-add"
                                      title={isUngrouped ? '在未分组下添加聊天' : `在 ${group.label} 下添加聊天`}
                                      aria-label={isUngrouped ? '在未分组下添加聊天' : `在 ${group.label} 下添加聊天`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        createChat({
                                          ...(group.path ? { projectPath: group.path } : {}),
                                        })
                                      }}
                                    >
                                      <PlusIcon {...chromeIcon} />
                                    </button>
                                  ) : null}
                                </div>
                                <ChatCount count={group.sessions.length} />
                              </div>
                              <SidebarFold open={!collapsed} className="sidebar-session-list min-w-0">
                                {group.sessions.map((item) => (
                                  <SessionRow
                                    key={`${group.key}:${item.id}`}
                                    item={item}
                                    active={item.id === highlightId}
                                    busy={Boolean(busySessions[item.id])}
                                    dancing={dancing}
                                    onDelete={requestDeleteChat}
                                    onPin={pinChat}
                                    onOpen={variant === 'popover' ? openSession : undefined}
                                  />
                                ))}
                              </SidebarFold>
                            </div>
                          )
                        })
                      }
                    </div>
                  </SidebarFold>
                </section>
              )
            })
          )}
        </div>
      </div>
  )

  const deleteDialog = pendingDelete && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-80 flex items-center justify-center bg-black/55 p-4"
        data-testid="chat-session-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-session-delete-title"
        onClick={() => setPendingDelete(null)}
      >
        <div
          className="w-[min(100%,320px)] rounded-[10px] border border-(--dsw-border) bg-(--dsw-sidebar) p-4 text-(--dsw-label)"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="chat-session-delete-title" className="m-0 text-[13px] font-semibold">
            删除「{pendingDelete.title}」？
          </h2>
          <p className="mt-1.5 mb-0 text-[11px] leading-[1.45] text-(--dsw-label-3)">
            删除后无法恢复这份会话。
          </p>
          <div className="mt-3 flex justify-end gap-1.5">
            <button
              type="button"
              className="rounded-md border-0 bg-(--dsw-hover) px-2.5 py-1 text-[11px] text-(--dsw-label) hover:bg-[#353535]"
              data-testid="chat-session-delete-cancel"
              onClick={() => setPendingDelete(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md border-0 bg-(--dsw-hover) px-2.5 py-1 text-[11px] font-medium text-(--dsw-label) hover:bg-[#353535]"
              data-testid="chat-session-delete-confirm"
              onClick={confirmDeleteChat}
            >
              确认删除
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  if (variant === 'popover') {
    return (
      <div
        className="brand-agent-menu chat-sidebar-popover"
        data-testid="dock-chat-sidebar"
        role="dialog"
        aria-label="聊天"
      >
        {body}
        {deleteDialog}
      </div>
    )
  }

  if (embedded) {
    return (
      <>
        {body}
        {deleteDialog}
      </>
    )
  }

  return (
    <ShellSidebarFrame
      visible={visible}
      narrow={narrow}
      showTags={showTags}
      onCollapse={onCollapse}
      onExpand={onExpand}
      onWidthChange={onWidthChange}
      testId="chat-sidebar"
    >
      {body}
      {deleteDialog}
    </ShellSidebarFrame>
  )
})
