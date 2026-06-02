/**
 * Reactive viewport breakpoint hook — re-renders the calling component
 * when the viewport crosses the threshold so layouts can swap between
 * mobile and desktop shapes without `window.innerWidth` polling.
 *
 * The default 720px matches the `@media (max-width: 720px)` block in
 * `styles.css`, so JS-driven branches stay aligned with the CSS-driven
 * ones.
 */

import { useEffect, useState } from 'react'

export function useIsMobile(maxWidthPx = 720): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidthPx])
  return isMobile
}
