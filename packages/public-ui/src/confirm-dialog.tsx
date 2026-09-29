import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { overlayPortalRoot, overlayZ } from './overlay-portal.ts'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
  icon,
  testId = 'confirm-dialog',
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  icon?: ReactNode
  testId?: string
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="biu-confirm-overlay"
      style={{ zIndex: overlayZ(260) }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className="biu-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        aria-describedby={`${testId}-message`}
        data-testid={testId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`biu-confirm-mark${danger ? ' is-danger' : ''}`} aria-hidden>
          {icon ?? '!'}
        </div>
        <div className="biu-confirm-copy">
          <h2 id={`${testId}-title`}>{title}</h2>
          <div id={`${testId}-message`}>{message}</div>
        </div>
        <div className="biu-confirm-actions">
          <button ref={cancelRef} type="button" className="biu-confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`biu-confirm-submit${danger ? ' is-danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    overlayPortalRoot() ?? document.body,
  )
}
