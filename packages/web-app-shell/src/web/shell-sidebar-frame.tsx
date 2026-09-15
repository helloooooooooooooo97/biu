import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/16/solid'
import { SidebarBrandLockup } from '@biu/public-mascot'
import { chromeIcon } from './chrome-icon.ts'
import { ShellSidePlaces } from './shell-chrome.tsx'
import {
  isSidebarFlyoutKeepTarget,
  isSidebarFlyoutIgnoreTarget,
  SIDEBAR_FLYOUT_HIDE_MS,
  shouldKeepSidebarFlyout,
} from './sidebar-flyout.ts'

export type ShellSidebarFrameProps = {
  visible: boolean
  narrow?: boolean
  showTags?: boolean
  onCollapse?: () => void
  onExpand?: () => void
  onWidthChange?: (width: number) => void
  onWidthLive?: (width: number) => void
  testId?: string
  activeId?: string
  agentHref?: string
  onSettings?: () => void
  onSearch?: () => void
  searchOpen?: boolean
  children: ReactNode
}

/** 聊天与数据库共用的左侧栏外框：品牌头、收起/展开、拖宽。 */
export const ShellSidebarFrame = memo(function ShellSidebarFrame({
  visible,
  narrow = false,
  showTags = false,
  onCollapse,
  onExpand,
  onWidthChange,
  onWidthLive,
  testId = 'shell-sidebar',
  activeId,
  agentHref,
  onSettings,
  onSearch,
  searchOpen = false,
  children,
}: ShellSidebarFrameProps) {
  const dragRef = useRef<{ startX: number; startWidth: number; last: number } | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const peekRef = useRef(false)
  const hideRef = useRef<number | null>(null)
  const [peek, setPeek] = useState(false)

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = drag.startWidth + (event.clientX - drag.startX)
      drag.last = next
      if (onWidthLive) onWidthLive(next)
      else onWidthChange?.(next)
    }
    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      if (drag && onWidthLive) onWidthChange?.(drag.last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onWidthChange, onWidthLive])

  useEffect(() => {
    if (visible) {
      peekRef.current = false
      setPeek(false)
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
      return
    }

    const openPeek = () => {
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
      peekRef.current = true
      setPeek(true)
    }
    const scheduleHide = () => {
      if (hideRef.current != null) return
      hideRef.current = window.setTimeout(() => {
        hideRef.current = null
        peekRef.current = false
        setPeek(false)
      }, SIDEBAR_FLYOUT_HIDE_MS)
    }
    const onPointer = (event: PointerEvent) => {
      const host = hostRef.current
      const shell = host?.parentElement
      const raw = shell ? getComputedStyle(shell).getPropertyValue('--sidebar-flyout-width') : ''
      const width = Number.parseFloat(raw) || 240
      if (isSidebarFlyoutIgnoreTarget(event.target)) {
        if (peekRef.current) scheduleHide()
        return
      }
      if (
        isSidebarFlyoutKeepTarget(event.target, host) ||
        shouldKeepSidebarFlyout(event.clientX, event.clientY, peekRef.current, width, window.innerWidth, window.innerHeight)
      ) {
        openPeek()
        return
      }
      if (peekRef.current) scheduleHide()
    }
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
    }
  }, [visible])

  return (
    <div
      ref={hostRef}
      className={`sidebar-flyout-host${visible ? '' : ' is-collapsed'}${!visible && peek ? ' is-flyout-open' : ''}`}
      data-testid="sidebar-flyout-host"
    >
      {visible ? null : <div className="sidebar-edge-hot" data-testid="sidebar-edge-hot" aria-hidden />}
    <aside
      className={`app-side-bar min-h-0 flex-col overflow-hidden border-r border-(--dsw-border) bg-(--dsw-sidebar)${narrow ? ' is-narrow' : ''}${showTags ? ' is-wide' : ''}${visible ? ' flex' : ' is-closed flex'}`}
      aria-hidden={!visible}
      data-testid={testId}
    >
      {onWidthChange ? (
        <div
          className="sidebar-resize"
          data-biu-ignore
          data-testid="sidebar-resize"
          title="拖动调整宽度"
          onPointerDown={(event) => {
            event.preventDefault()
            const visual = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
            dragRef.current = { startX: event.clientX, startWidth: visual, last: visual }
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
        />
      ) : null}
      <div className="app-side-bar-head app-side-bar-head-brand" data-biu-ignore>
        <SidebarBrandLockup />
        {!visible || narrow ? (
          <button
            type="button"
            className="chat-view-header-expand"
            title="展开左侧边栏"
            aria-label="展开左侧边栏"
            data-testid="sidebar-expand"
            onClick={onExpand}
          >
            <ChevronDoubleRightIcon {...chromeIcon} />
          </button>
        ) : (
          <button
            type="button"
            className="chat-view-header-expand"
            title="收起左侧边栏"
            aria-label="收起左侧边栏"
            data-testid="sidebar-collapse"
            onClick={onCollapse}
          >
            <ChevronDoubleLeftIcon {...chromeIcon} />
          </button>
        )}
      </div>
      {onSettings && agentHref && activeId != null ? (
        <div className="shrink-0 px-2 pt-1" data-biu-ignore>
          <ShellSidePlaces
            activeId={activeId}
            agentHref={agentHref}
            onSettings={onSettings}
            onSearch={onSearch}
            searchOpen={searchOpen}
          />
        </div>
      ) : null}
      {children}
    </aside>
    </div>
  )
})
