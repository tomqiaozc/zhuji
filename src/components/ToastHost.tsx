import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type ToastMessage } from '@/lib/toast'

const COLORS: Record<ToastMessage['level'], { bg: string; border: string; fg: string }> = {
  info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af' },
  success: { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857' },
  error: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div
      className="toast-host"
      data-testid="toast-host"
      role="status"
      aria-live="polite"
    >
      {items.map((it) => {
        const c = COLORS[it.level]
        return (
          <div
            key={it.id}
            data-testid={`toast-${it.level}`}
            onClick={(e) => {
              // Don't dismiss when the action button is clicked — let
              // the action handler own its own toast lifecycle.
              if ((e.target as HTMLElement).closest('button')) return
              if (!it.action) dismissToast(it.id)
            }}
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.fg,
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              cursor: it.action ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ flex: 1 }}>{it.text}</span>
            {it.action && (
              <>
                <button
                  type="button"
                  data-testid={`toast-action-${it.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    it.action!.onClick()
                  }}
                  style={{
                    background: c.fg,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {it.action.label}
                </button>
                <button
                  type="button"
                  aria-label="忽略"
                  onClick={(e) => {
                    e.stopPropagation()
                    dismissToast(it.id)
                  }}
                  style={{
                    background: 'transparent',
                    color: c.fg,
                    border: 'none',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: '2px 6px',
                  }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
