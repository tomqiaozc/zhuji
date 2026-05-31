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
      data-testid="toast-host"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {items.map((it) => {
        const c = COLORS[it.level]
        return (
          <div
            key={it.id}
            data-testid={`toast-${it.level}`}
            onClick={() => dismissToast(it.id)}
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.fg,
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
            }}
          >
            {it.text}
          </div>
        )
      })}
    </div>
  )
}
