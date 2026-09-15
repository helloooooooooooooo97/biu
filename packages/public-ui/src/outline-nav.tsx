import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export type OutlineNavItem = {
  id: string
  text: string
  robot?: boolean
  /** 1 / 2 / 3 级标题：刻度左齐，右侧长度 h1 > h2 > h3 */
  level?: 1 | 2 | 3
}

function escapeId(id: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
}

/** 详情正文滚动：和悬浮目录点 heading 一样。 */
export function scrollOutlineTarget(el: HTMLElement | null) {
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}

/** 左侧刻度条 + 悬停展开列表。聊天区和会话详情共用。 */
export function OutlineNav({
  items,
  label = '消息大纲',
  testId = 'chat-outline',
  onSelect,
}: {
  items: OutlineNavItem[]
  label?: string
  testId?: string
  onSelect: (id: string) => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const leaveTimer = useRef(0)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  function keepOpen() {
    window.clearTimeout(leaveTimer.current)
  }

  function scheduleClose() {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => {
      setHoverId(null)
    }, 140)
  }

  function outlineExpandOn() {
    return typeof document === 'undefined' || document.documentElement.getAttribute('data-outline-expand') !== '0'
  }

  useEffect(() => {
    const onPrefs = () => {
      if (!outlineExpandOn()) setHoverId(null)
    }
    window.addEventListener('biu:page-prefs', onPrefs)
    return () => window.removeEventListener('biu:page-prefs', onPrefs)
  }, [])

  function hoverTick(id: string) {
    keepOpen()
    if (!outlineExpandOn()) return
    setHoverId(id)
  }

  function hoverRail(event: ReactMouseEvent) {
    keepOpen()
    if (!outlineExpandOn() || !items.length) return
    const rail = railRef.current
    if (!rail) {
      hoverTick(items[0]!.id)
      return
    }
    const ticks = rail.querySelectorAll<HTMLElement>('[data-outline-tick]')
    let bestId = items[0]!.id
    let best = Infinity
    ticks.forEach((tick) => {
      const box = tick.getBoundingClientRect()
      const dist = Math.abs((box.top + box.bottom) / 2 - event.clientY)
      const id = tick.getAttribute('data-outline-tick')
      if (id && dist < best) {
        best = dist
        bestId = id
      }
    })
    hoverTick(bestId)
  }

  useLayoutEffect(() => {
    if (!hoverId) return
    const rail = railRef.current
    const panel = panelRef.current
    const tick = rail?.querySelector<HTMLElement>(`[data-outline-tick="${escapeId(hoverId)}"]`)
    const row = panel?.querySelector<HTMLElement>(`[data-outline-row="${escapeId(hoverId)}"]`)
    tick?.scrollIntoView({ block: 'nearest' })
    row?.scrollIntoView({ block: 'nearest' })
  }, [hoverId, items.length])

  if (!items.length) return null

  return (
    <aside
      className="chat-outline"
      aria-label={label}
      data-testid={testId}
      onMouseEnter={hoverRail}
      onMouseMove={hoverRail}
      onMouseLeave={scheduleClose}
    >
      <div className="chat-outline-rail" ref={railRef} data-testid={`${testId}-rail`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chat-outline-tick${item.robot ? ' is-robot' : ''}${item.level ? ` is-h${item.level}` : ''}${hoverId === item.id ? ' is-active' : ''}`}
            title={item.text}
            aria-label={item.text}
            data-outline-tick={item.id}
            data-testid={`${testId}-tick-${item.id}`}
            onMouseEnter={() => hoverTick(item.id)}
            onFocus={() => hoverTick(item.id)}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
      {hoverId ? (
        <nav className="chat-outline-panel" ref={panelRef} data-testid={`${testId}-panel`}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chat-outline-item${item.robot ? ' is-robot' : ''}${item.level ? ` is-h${item.level}` : ''}${hoverId === item.id ? ' is-active' : ''}`}
              title={item.text}
              data-outline-row={item.id}
              data-testid={`${testId}-item-${item.id}`}
              onMouseEnter={() => hoverTick(item.id)}
              onClick={() => onSelect(item.id)}
            >
              <span className="chat-outline-label">{item.text}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </aside>
  )
}
