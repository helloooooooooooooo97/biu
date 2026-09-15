import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE, overlayPortalRoot, overlayZ } from '@biu/public-ui'
import type { FieldType } from '@biu/type-file-system'

export function cellUsesPop(kind: FieldType, writable?: boolean) {
  if (!writable) return false
  return kind !== 'action' && kind !== 'file' && kind !== 'boolean' && kind !== 'datetime'
}

export function CellPop({
  open,
  anchor,
  onClose,
  className,
  children,
}: {
  open: boolean
  anchor: HTMLElement | null
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ top: 0, left: 0, width: 200, minHeight: 32 })

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      setBox({
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 240),
        minHeight: Math.max(rect.height, 32),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, open])

  if (!open || !anchor) return null
  return createPortal(
    <HeadlessDismiss
      onDismiss={onClose}
      inside={(node) => Boolean(anchor.contains(node))}
      ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu`}
    >
      <div
        ref={menuRef}
        className={`fsdb-cell-pop${className ? ` ${className}` : ''}`}
        role="dialog"
        style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, minHeight: box.minHeight, zIndex: overlayZ(180) }}
      >
        {children}
      </div>
    </HeadlessDismiss>,
    overlayPortalRoot() ?? document.body,
  )
}
