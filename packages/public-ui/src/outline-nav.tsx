import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export type OutlineNavItem = {
  id: string
  text: string
  robot?: boolean
  /** 1 / 2 / 3 级标题：刻度左齐，右侧长度 h1 > h2 > h3 */
  level?: 1 | 2 | 3
}

/** 详情正文滚动：和悬浮目录点 heading 一样。 */
export function scrollOutlineTarget(el: HTMLElement | null) {
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}

function outlineExpandOn() {
  return typeof document === 'undefined' || document.documentElement.getAttribute('data-outline-expand') !== '0'
}

function hitKeepsOutline(el: Element | null) {
  return Boolean(el?.closest('.chat-outline-rail, .chat-outline-tick, .chat-outline-item, .chat-outline-panel, .chat-outline'))
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
  const rootRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef(0)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  function keepOpen() {
    window.clearTimeout(leaveTimer.current)
  }

  function closeNow() {
    window.clearTimeout(leaveTimer.current)
    setHoverId(null)
  }

  function scheduleClose() {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => {
      setHoverId(null)
    }, 80)
  }

  function hoverTick(id: string) {
    keepOpen()
    if (!outlineExpandOn()) return
    setHoverId(id)
  }

  function nearestTick(event: ReactMouseEvent) {
    const rail = railRef.current
    if (!rail || !items.length) return items[0]?.id ?? null
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
    return bestId
  }

  function hoverRail(event: ReactMouseEvent) {
    if (!outlineExpandOn() || !items.length) return
    const id = nearestTick(event)
    if (id) hoverTick(id)
  }

  useEffect(() => {
    const onPrefs = () => {
      if (!outlineExpandOn()) closeNow()
    }
    window.addEventListener('biu:page-prefs', onPrefs)
    return () => window.removeEventListener('biu:page-prefs', onPrefs)
  }, [])

  useEffect(() => {
    if (!hoverId) return
    const onMove = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      if (hitKeepsOutline(hit)) keepOpen()
      else scheduleClose()
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [hoverId])

  if (!items.length) return null

  return (
    <aside
      ref={rootRef}
      className={`chat-outline${hoverId ? ' is-open' : ''}`}
      aria-label={label}
      data-testid={testId}
      onMouseEnter={hoverRail}
      onMouseLeave={scheduleClose}
    >
      <div
        className="chat-outline-rail"
        ref={railRef}
        data-testid={`${testId}-rail`}
        onMouseMove={hoverRail}
      >
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
        <nav className="chat-outline-panel" data-testid={`${testId}-panel`}>
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
