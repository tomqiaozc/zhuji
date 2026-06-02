import { ReactNode, useEffect, useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

interface ModalProps {
  open?: boolean
  onClose: () => void
  variant?: 'modal' | 'drawer'
  labelledBy?: string
  describedBy?: string
  /** Default true. Backdrop click closes the dialog when allowed. */
  closeOnBackdrop?: boolean
  /** Default true. Esc closes the dialog when allowed. */
  closeOnEsc?: boolean
  className?: string
  panelClassName?: string
  panelStyle?: React.CSSProperties
  zIndex?: number
  /** Element/test id forwarded onto the backdrop. */
  testId?: string
  children: ReactNode
}

/**
 * Shared dialog primitive — backdrop + panel with focus trap, initial focus,
 * Esc-to-close, and focus restoration on unmount.
 *
 * Children that want a specific element to receive initial focus should
 * mark it with `data-autofocus`. Otherwise the first focusable element wins.
 */
export function Modal({
  open = true,
  onClose,
  variant = 'modal',
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  closeOnEsc = true,
  className,
  panelClassName,
  panelStyle,
  zIndex,
  testId,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap(panelRef, {
    active: open,
    onEscape: closeOnEsc ? onClose : undefined,
  })

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const backdropClass = (className ?? (variant === 'drawer' ? 'drawer-bg' : 'modal-bg')).trim()
  const panelClass = (panelClassName ?? (variant === 'drawer' ? 'drawer' : 'modal')).trim()

  return (
    <div
      className={backdropClass}
      data-testid={testId}
      style={zIndex != null ? { zIndex } : undefined}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={panelStyle}
      >
        {children}
      </div>
    </div>
  )
}
