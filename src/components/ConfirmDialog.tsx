import { useEffect, useRef, useState } from 'react'
import { resolveCurrent, subscribeDialog, type DialogRequest } from '@/lib/dialog'

export function ConfirmDialogHost() {
  const [req, setReq] = useState<DialogRequest | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => subscribeDialog(setReq), [])

  useEffect(() => {
    if (!req) return
    confirmBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        resolveCurrent(false)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        resolveCurrent(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [req])

  if (!req) return null

  const isConfirm = req.kind === 'confirm'
  const confirmLabel = isConfirm ? (req.opts.confirmLabel ?? '确定') : (req.opts.okLabel ?? '好的')
  const cancelLabel = isConfirm ? (req.opts.cancelLabel ?? '取消') : null
  const danger = isConfirm && req.opts.danger
  const title = req.opts.title

  return (
    <div
      className="modal-bg"
      data-testid="confirm-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) resolveCurrent(false)
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-dialog-title' : undefined}
        aria-describedby="confirm-dialog-message"
        style={{ maxWidth: 420, width: '92vw' }}
      >
        {title && (
          <h2
            id="confirm-dialog-title"
            style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}
          >
            {title}
          </h2>
        )}
        <div
          id="confirm-dialog-message"
          style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
        >
          {req.opts.message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          {cancelLabel && (
            <button
              className="btn"
              data-testid="confirm-cancel"
              onClick={() => resolveCurrent(false)}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            data-testid="confirm-ok"
            onClick={() => resolveCurrent(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
