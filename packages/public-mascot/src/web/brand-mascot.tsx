import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { HeadlessDismiss, useWorkspaceProfile } from '@biu/public-ui'
import { SidebarMascot } from './sidebar-mascot.tsx'
import { resolveSessionMascot } from './session-mascot.ts'

export type CornerAgent = {
  id: string
  title: string
  updatedAt?: number
  mascot?: { shape: string; color: string; eye?: number }
}

/** Grok Bot `shapes.blob.path`（最早提交里的小人轮廓）。 */
const BRAND_BLOB_PATH =
  'M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z'

/** `eyes[1]` 静止帧，与 blob.face.eye=1 对齐。 */
const BRAND_EYE_LEFT =
  'M86.14 124.79L89.16 124.92L92.06 125.76L94.68 127.27L96.86 129.36L98.48 131.92L99.51 134.76L100.12 137.73L100.56 140.72L101.01 143.72L101.52 146.71L102.06 149.69L102.62 152.67L103.2 155.64L103.81 158.61L104.44 161.57L105.11 164.52L105.81 167.47L106.49 170.42L106.72 173.44L106.01 176.37L104.37 178.9L102.03 180.81L99.26 181.99L96.27 182.46L93.25 182.25L90.34 181.43L87.65 180.04L85.32 178.11L83.51 175.7L82.37 172.9L81.66 169.96L80.98 167L80.32 164.05L79.69 161.08L79.08 158.12L78.5 155.14L77.94 152.16L77.4 149.18L76.89 146.2L76.4 143.21L75.93 140.21L75.56 137.21L75.7 134.19L76.6 131.3L78.22 128.76L80.47 126.74L83.18 125.4Z'
const BRAND_EYE_RIGHT =
  'M147.23 112.87L150.24 113.13L153.07 114.19L155.53 115.94L157.46 118.26L158.73 121.01L159.53 123.93L160.21 126.88L160.88 129.84L161.52 132.8L162.15 135.76L162.74 138.73L163.32 141.71L163.87 144.69L164.39 147.67L164.9 150.66L165.39 153.65L165.8 156.65L165.76 159.67L164.98 162.59L163.56 165.26L161.61 167.58L159.23 169.45L156.52 170.77L153.57 171.46L150.55 171.4L147.67 170.52L145.19 168.79L143.45 166.33L142.57 163.44L142.08 160.45L141.61 157.46L141.11 154.47L140.59 151.48L140.04 148.5L139.47 145.53L138.87 142.56L138.25 139.59L137.6 136.63L136.94 133.68L136.25 130.72L135.59 127.77L135.47 124.75L136.07 121.78L137.34 119.04L139.19 116.65L141.53 114.74L144.26 113.44Z'
const BRAND_FACE =
  'translate(114.2705 114.2705) scale(1.18 1) translate(-114.2705 -114.2705)'

/** 纯白圆角底 + 黑色 blob 小人（Grok Bot 几何，不依赖 GROK_GEO 异步加载）。 */
export function BrandMascot({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      data-testid="brand-mascot"
    >
      <rect width="36" height="36" rx="8" fill="#fff" />
      <svg x="2" y="2" width="32" height="32" viewBox="-15 -15 259 259" overflow="visible">
        <path d={BRAND_BLOB_PATH} fill="#000" />
        <g transform={BRAND_FACE}>
          <path d={BRAND_EYE_LEFT} fill="#fff" />
          <path d={BRAND_EYE_RIGHT} fill="#fff" />
        </g>
      </svg>
    </svg>
  )
}

export function SidebarBrandLockup() {
  const profile = useWorkspaceProfile()
  const name = profile.name.trim()
  const avatar = profile.avatar.trim()
  return (
    <span
      className={`sidebar-brand-lockup${avatar ? ' has-avatar' : ''}${name ? ' has-name' : ''}`}
      data-testid="sidebar-brand-lockup"
    >
      {avatar ? (
        <img className="sidebar-brand-avatar" src={avatar} alt="" data-testid="sidebar-brand-avatar" />
      ) : (
        <BrandMascot className="sidebar-brand-mascot" size={22} />
      )}
      {name ? (
        <span className="sidebar-brand-name" data-testid="sidebar-brand-name">
          {name}
        </span>
      ) : null}
    </span>
  )
}

export function rankCornerAgents(agents: CornerAgent[]) {
  return [...agents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id))
}

export function BrandAgentMenu({
  agents,
  activeId,
  onSelect,
  busyIds,
}: {
  agents: CornerAgent[]
  activeId?: string | null
  onSelect: (id: string) => void
  busyIds?: Record<string, true>
}) {
  const ranked = useMemo(() => rankCornerAgents(agents), [agents])
  const currentId = activeId ?? ranked[0]?.id
  return (
    <div className="brand-agent-menu" role="menu" data-testid="brand-agent-menu">
      {ranked.length ? (
        ranked.map((item) => {
          const face = resolveSessionMascot(item.id, item.mascot)
          const active = item.id === currentId
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`inspector-catalog-item${active ? ' is-active' : ''}`}
              data-testid={`brand-agent-${item.id}`}
              onClick={() => onSelect(item.id)}
            >
              <SidebarMascot size={24} sessionId={item.id} identity={face} busy={Boolean(busyIds?.[item.id])} animate={false} title={item.title} />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </button>
          )
        })
      ) : (
        <p className="inspector-catalog-empty">还没有 Agent</p>
      )}
    </div>
  )
}

export const CORNER_TAP_DANCE_MS = 3200

export function BrandCornerMascot({
  agents = [],
  activeId,
  onSelect,
  onToggle,
  open,
  leading,
  menu,
  size = 36,
  busy = false,
  busyIds,
  tapToDance = false,
}: {
  agents?: CornerAgent[]
  activeId?: string | null
  onSelect?: (id: string) => void
  onToggle?: () => void
  open?: boolean
  leading?: ReactNode
  menu?: ReactNode | ((close: () => void) => ReactNode)
  size?: number
  busy?: boolean
  busyIds?: Record<string, true>
  /** 聊天页点不开悬浮窗时，点击改播一段 Grok 跳舞。 */
  tapToDance?: boolean
}) {
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [tapDance, setTapDance] = useState(false)
  const [playNonce, setPlayNonce] = useState(0)
  const danceTimer = useRef(0)
  const ranked = useMemo(() => rankCornerAgents(agents), [agents])
  const current = ranked.find((item) => item.id === activeId) ?? ranked[0]
  const identity = current ? resolveSessionMascot(current.id, current.mascot) : undefined
  const name = current?.title?.trim() || (onToggle ? '聊天' : '切换 Agent')
  const closeMenu = useCallback(() => setAgentsOpen(false), [])
  const expanded = onToggle ? Boolean(open) : agentsOpen
  const panel = onToggle || !agentsOpen
    ? null
    : menu
      ? typeof menu === 'function'
        ? menu(closeMenu)
        : menu
      : (
        <BrandAgentMenu
          agents={ranked}
          activeId={activeId ?? current?.id}
          busyIds={busyIds}
          onSelect={(id) => {
            onSelect?.(id)
            closeMenu()
          }}
        />
      )

  useEffect(() => () => window.clearTimeout(danceTimer.current), [])

  function playTapDance() {
    setTapDance(true)
    setPlayNonce((n) => n + 1)
    window.clearTimeout(danceTimer.current)
    danceTimer.current = window.setTimeout(() => setTapDance(false), CORNER_TAP_DANCE_MS)
  }

  const tip = tapToDance
    ? tapDance
      ? '跳舞中'
      : '跳舞'
    : onToggle
      ? expanded
        ? '关闭聊天窗'
        : '打开聊天窗'
      : name

  return (
    <div className="brand-corner-cluster" data-testid="brand-corner-mascot">
      <div className="brand-corner-leading" data-plugin-tray>
        {leading}
      </div>
      <div className="brand-corner-mascot">
        <button
          type="button"
          className={`brand-corner-mascot-btn${expanded ? ' is-active' : ''}${tapDance ? ' is-dancing' : ''}`}
          title={tip}
          aria-label={tip}
          aria-haspopup={tapToDance ? undefined : onToggle ? 'dialog' : menu ? 'dialog' : 'menu'}
          aria-expanded={tapToDance ? undefined : expanded}
          data-dock-tip={tip}
          data-testid="brand-corner-mascot-toggle"
          onClick={() => {
            if (tapToDance) {
              playTapDance()
              return
            }
            if (onToggle) {
              onToggle()
              return
            }
            setAgentsOpen((prev) => !prev)
          }}
        >
          {identity && current ? (
            <SidebarMascot
              size={size}
              sessionId={current.id}
              identity={identity}
              busy={busy}
              animate={false}
              dancing={tapDance}
              playNonce={playNonce}
              title=""
            />
          ) : (
            <BrandMascot className="size-9" />
          )}
        </button>
        {isValidElement(panel) ? (
          <HeadlessDismiss
            onDismiss={closeMenu}
            inside={(node) =>
              Boolean(node instanceof Element && node.closest('.brand-corner-cluster, [data-testid="chat-session-delete-dialog"]'))
            }
          >
            {panel as ReactElement}
          </HeadlessDismiss>
        ) : (
          panel
        )}
      </div>
    </div>
  )
}
