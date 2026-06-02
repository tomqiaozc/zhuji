import { useEffect, useRef, useState } from 'react'

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'loading'> {
  src: string
  alt?: string
  rootMargin?: string
  /** Default placeholder size if width/height not set explicitly. Avoids
   *  CLS while images load. */
  placeholderWidth?: number | string
  placeholderHeight?: number | string
}

// Defers setting <img src> until the placeholder div is within `rootMargin` of
// the viewport. Works around the fact that blob: URLs don't benefit from the
// browser's native `loading="lazy"` heuristic.
export function LazyImage({
  src,
  alt,
  rootMargin = '200px',
  style,
  width,
  height,
  placeholderWidth = '100%',
  placeholderHeight = 160,
  onError,
  ...rest
}: Props) {
  const ref = useRef<HTMLImageElement>(null)
  const [visible, setVisible] = useState(false)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  // Reset error state when the src changes so a retry-by-prop works.
  useEffect(() => {
    setErrored(false)
  }, [src])

  const resolvedAlt = alt && alt.trim() ? alt : errored ? '图片加载失败' : '图片'
  const dimW = width ?? placeholderWidth
  const dimH = height ?? placeholderHeight

  return (
    <img
      ref={ref}
      src={visible ? src : undefined}
      data-src={src}
      alt={resolvedAlt}
      loading="lazy"
      width={width}
      height={height}
      onError={(e) => {
        setErrored(true)
        onError?.(e)
      }}
      style={{
        background: errored ? '#fee2e2' : '#f3f4f6',
        width: dimW,
        height: dimH,
        objectFit: 'cover',
        display: 'inline-block',
        ...style,
      }}
      {...rest}
    />
  )
}
