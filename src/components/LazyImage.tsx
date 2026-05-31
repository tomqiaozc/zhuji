import { useEffect, useRef, useState } from 'react'

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'loading'> {
  src: string
  alt?: string
  rootMargin?: string
}

// Defers setting <img src> until the placeholder div is within `rootMargin` of
// the viewport. Works around the fact that blob: URLs don't benefit from the
// browser's native `loading="lazy"` heuristic.
export function LazyImage({ src, alt, rootMargin = '200px', style, ...rest }: Props) {
  const ref = useRef<HTMLImageElement>(null)
  const [visible, setVisible] = useState(false)

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

  return (
    <img
      ref={ref}
      src={visible ? src : undefined}
      data-src={src}
      alt={alt ?? ''}
      loading="lazy"
      style={{
        background: '#f3f4f6',
        ...style,
      }}
      {...rest}
    />
  )
}
