import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HeadlessDismiss } from './headless-dismiss.tsx'
import { overlayPortalRoot, overlayZ } from './overlay-portal.ts'

export function AnchorMenu({
  anchor,
  onClose,
  children,
  className = 'fsdb-cellselect-menu',
  role = 'listbox',
  zIndex = 200,
  minWidth = 220,
  placement = 'bottom',
  inside,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  className?: string
  role?: string
  zIndex?: number
  minWidth?: number
  placement?: 'bottom' | 'right' | 'left'
  inside?: (node: Node) => boolean
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className' | 'children'>) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ top: 0, left: 0, width: 200 })

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(minWidth, rect.width)
      if (placement === 'right' || placement === 'left') {
        const gap = 8
        const left =
          placement === 'left'
            ? Math.max(8, Math.min(rect.left - width - gap, window.innerWidth - width - gap))
            : Math.min(rect.right + gap, Math.max(8, window.innerWidth - width - gap))
        const top = Math.min(rect.top, Math.max(8, window.innerHeight - 8 - 120))
        setBox({ top, left, width })
        return
      }
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8))
      const top = rect.bottom + 4
      setBox({ top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, minWidth, placement])

  if (!anchor) return null
  return createPortal(
    <HeadlessDismiss onDismiss={onClose} inside={(node) => Boolean(anchor.contains(node) || inside?.(node))}>
      <div
        ref={menuRef}
        className={className}
        role={role}
        style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, zIndex: overlayZ(zIndex) }}
        {...rest}
      >
        {children}
      </div>
    </HeadlessDismiss>,
    overlayPortalRoot() ?? document.body,
  )
}
