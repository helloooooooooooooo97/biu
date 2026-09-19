import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { BrandMascot } from '@biu/public-mascot'
import { HeadlessDismiss } from '@biu/public-ui'
import type { ShareSnapshot } from '@biu/host-share/snapshot'

const extras = new Map<string, () => ReactNode>()
const listeners = new Set<() => void>()
let extraList: Array<[string, () => ReactNode]> = []

function emitShareOwnerExtras() {
  extraList = [...extras.entries()]
  for (const listen of listeners) listen()
}

function subscribeShareOwnerExtras(onStore: () => void) {
  listeners.add(onStore)
  return () => {
    listeners.delete(onStore)
  }
}

function listShareOwnerExtras() {
  return extraList
}

/** 分享页右下角名片扩展点：联系方式、slogan 等由插件挂上来。 */
export function registerShareOwnerExtra(id: string, render: () => ReactNode) {
  extras.set(id, render)
  emitShareOwnerExtras()
  return () => {
    extras.delete(id)
    emitShareOwnerExtras()
  }
}

export function ShareOwnerCorner({
  owner,
  open,
  onOpenChange,
}: {
  owner?: ShareSnapshot['owner']
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const name = owner?.name?.trim() || '分享者'
  const slogan = owner?.slogan?.trim()
  const extraItems = useSyncExternalStore(subscribeShareOwnerExtras, listShareOwnerExtras, listShareOwnerExtras)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <div className="fsdb-share-owner-corner" data-testid="fsdb-share-owner">
      <button
        type="button"
        className={`brand-corner-mascot-btn${open ? ' is-active' : ''}`}
        title={name}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-dock-tip={open ? undefined : name}
        data-testid="fsdb-share-owner-toggle"
        onClick={() => onOpenChange(!open)}
      >
        {owner?.avatar ? (
          <img className="fsdb-share-owner-face" src={owner.avatar} alt="" data-testid="fsdb-share-owner-face" />
        ) : (
          <BrandMascot className="size-9" />
        )}
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={close}>
          <div
            className="fsdb-share-owner-card"
            role="dialog"
            aria-label={name}
            data-testid="fsdb-share-owner-card"
            data-share-owner-card
          >
            <div className="fsdb-share-owner-card-head">
              {owner?.avatar ? (
                <img className="fsdb-share-owner-card-photo" src={owner.avatar} alt="" />
              ) : (
                <span className="fsdb-share-owner-card-initial" aria-hidden>
                  {name.slice(0, 1)}
                </span>
              )}
              <div className="fsdb-share-owner-card-copy">
                <strong>{name}</strong>
                {slogan ? <p>{slogan}</p> : null}
              </div>
            </div>
            <div className="fsdb-share-owner-extras" data-share-owner-extras>
              {extraItems.map(([id, render]) => (
                <div key={id} data-share-owner-extra={id}>
                  {render()}
                </div>
              ))}
            </div>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}
