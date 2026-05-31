import { useEffect, useRef, useState } from 'react'

export interface LightboxImage {
  id: string
  src: string
  alt?: string
  caption?: string
}

interface Props {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onIndexChange: (i: number) => void
}

// Single-finger swipe to navigate, two-finger pinch to zoom, double-tap to
// reset. Arrow keys / Esc for desktop. We intentionally keep the gesture math
// simple — this is a viewer, not Lightroom.
export function ImageLightbox({ images, index, onClose, onIndexChange }: Props) {
  const [zoom, setZoom] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const touchesRef = useRef<{
    startX: number
    startY: number
    moved: boolean
    pinchStartDist?: number
    pinchStartZoom?: number
    lastTap?: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cur = images[index]

  const reset = () => {
    setZoom(1)
    setTx(0)
    setTy(0)
  }

  function goPrev() {
    if (images.length <= 1) return
    onIndexChange((index - 1 + images.length) % images.length)
    reset()
  }
  function goNext() {
    if (images.length <= 1) return
    onIndexChange((index + 1) % images.length)
    reset()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z * 1.25, 4))
      else if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(z / 1.25, 1))
      else if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length])

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      touchesRef.current = {
        startX: 0,
        startY: 0,
        moved: false,
        pinchStartDist: dist,
        pinchStartZoom: zoom,
      }
      return
    }
    const t = e.touches[0]
    const now = Date.now()
    const last = touchesRef.current?.lastTap ?? 0
    if (now - last < 300) {
      // Double-tap toggles between fit and 2x.
      setZoom((z) => (z > 1 ? 1 : 2))
      setTx(0)
      setTy(0)
      touchesRef.current = { startX: t.clientX, startY: t.clientY, moved: false, lastTap: 0 }
      return
    }
    touchesRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      moved: false,
      lastTap: now,
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = touchesRef.current
    if (!s) return
    if (e.touches.length === 2 && s.pinchStartDist != null && s.pinchStartZoom != null) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = Math.max(1, Math.min(4, s.pinchStartZoom * (dist / s.pinchStartDist)))
      setZoom(next)
      return
    }
    const t = e.touches[0]
    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) s.moved = true
    if (zoom > 1) {
      // pan
      setTx((x) => x + (t.clientX - (s.startX || t.clientX)))
      setTy((y) => y + (t.clientY - (s.startY || t.clientY)))
      s.startX = t.clientX
      s.startY = t.clientY
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = touchesRef.current
    if (!s) return
    if (e.changedTouches.length === 0) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    if (zoom === 1 && s.moved && Math.abs(dx) > 50 && Math.abs(dy) < 80) {
      if (dx > 0) goPrev()
      else goNext()
    }
  }

  if (!cur) return null

  return (
    <div
      ref={containerRef}
      className="lightbox"
      data-testid="image-lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {index + 1} / {images.length}
          {cur.caption ? ` · ${cur.caption}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.max(z / 1.25, 1))}
            aria-label="缩小"
          >
            −
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.min(z * 1.25, 4))}
            aria-label="放大"
          >
            ＋
          </button>
          <button className="btn btn-sm" onClick={reset} aria-label="重置缩放">
            1:1
          </button>
          <button
            className="btn btn-sm"
            onClick={onClose}
            aria-label="关闭"
            data-testid="lightbox-close"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
        onClick={(e) => {
          // click outside the image (img element won't bubble e.target===div)
          if (e.target === e.currentTarget) onClose()
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {images.length > 1 && (
          <button
            className="lightbox-nav"
            data-testid="lightbox-prev"
            onClick={(e) => {
              e.stopPropagation()
              goPrev()
            }}
            aria-label="上一张"
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ‹
          </button>
        )}
        <img
          src={cur.src}
          alt={cur.alt ?? ''}
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: zoom === 1 ? 'transform 0.18s ease' : 'none',
            userSelect: 'none',
            touchAction: 'none',
          }}
        />
        {images.length > 1 && (
          <button
            className="lightbox-nav"
            data-testid="lightbox-next"
            onClick={(e) => {
              e.stopPropagation()
              goNext()
            }}
            aria-label="下一张"
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}
