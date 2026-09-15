import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Bars3BottomLeftIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss, OutlineNav, scrollOutlineTarget } from '@biu/public-ui'
import { headingElById, headingsFromRoot, sameOutlineItems } from './heading-outline.ts'

function detailMain(from: HTMLElement | null) {
  const stage = from?.closest('.fsdb-detail-stage')
  const scoped = stage?.querySelector('.fsdb-detail-main')
  return scoped instanceof HTMLElement ? scoped : null
}

function subscribeSharePhone(onChange: () => void) {
  const mq = window.matchMedia('(max-width:720px)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function sharePhone() {
  return Boolean(document.querySelector('.fsdb-share-page')) && window.matchMedia('(max-width:720px)').matches
}

function useSharePhone() {
  return useSyncExternalStore(subscribeSharePhone, sharePhone, () => false)
}

export function HeadingOutline({ enabled }: { enabled: boolean }) {
  const mark = useRef<HTMLSpanElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(() => [] as ReturnType<typeof headingsFromRoot>)
  const sheet = useSharePhone()

  const scan = useCallback(() => {
    const main = detailMain(mark.current)
    const stage = mark.current?.closest('.fsdb-detail-stage')
    if (!main) {
      setItems((prev) => (prev.length ? [] : prev))
      return
    }
    const root = main.closest('.fsdb-right') ?? main.closest('.fsdb-right-body') ?? stage
    const nextHost = root instanceof HTMLElement ? root : main
    setHost((prev) => (prev === nextHost ? prev : nextHost))
    const next = headingsFromRoot(main)
    setItems((prev) => (sameOutlineItems(prev, next) ? prev : next))
  }, [])

  useLayoutEffect(() => {
    if (!enabled) {
      setItems((prev) => (prev.length ? [] : prev))
      setHost(null)
      return
    }
    scan()
    const main = detailMain(mark.current)
    if (!main) return
    const mo = new MutationObserver(scan)
    mo.observe(main, { subtree: true, childList: true, characterData: true })
    return () => mo.disconnect()
  }, [enabled, scan])

  const go = useCallback((id: string) => {
    const main = detailMain(mark.current)
    if (!main) return
    scrollOutlineTarget(headingElById(main, id))
    setOpen(false)
  }, [])

  if (!enabled) return null
  return (
    <>
      <span ref={mark} hidden aria-hidden="true" data-heading-outline-anchor="" />
      {host && items.length
        ? createPortal(
            sheet ? (
              <div className="heading-outline-host is-sheet" ref={sheetRef}>
                <button
                  type="button"
                  className={`fsdb-share-outline-toggle${open ? ' is-open' : ''}`}
                  title="标题大纲"
                  aria-label="标题大纲"
                  aria-expanded={open}
                  data-testid="heading-outline-toggle"
                  onClick={() => setOpen((value) => !value)}
                >
                  <Bars3BottomLeftIcon aria-hidden className="size-4" />
                </button>
                {open ? (
                  <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={sheetRef}>
                    <nav className="fsdb-share-outline-panel" aria-label="标题大纲" data-testid="heading-outline">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`fsdb-share-outline-item${item.level ? ` is-h${item.level}` : ''}`}
                          onClick={() => go(item.id)}
                        >
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  </HeadlessDismiss>
                ) : null}
              </div>
            ) : (
              <div className="heading-outline-host">
                <OutlineNav items={items} label="标题大纲" testId="heading-outline" onSelect={go} />
              </div>
            ),
            host,
          )
        : null}
    </>
  )
}
