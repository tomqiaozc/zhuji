import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function getFocusable(root: HTMLElement): HTMLElement[] {
  const list = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return list.filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.offsetParent !== null,
  )
}

/**
 * Trap keyboard focus inside `containerRef`, restore focus to the previously
 * focused element on unmount, and (optionally) close on Escape.
 *
 * The container must be mounted (ref bound) before the effect runs. If
 * `autoFocus` is true and nothing inside the container is currently focused,
 * the first element marked with `data-autofocus` (or the first focusable)
 * receives focus.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  opts: {
    active?: boolean
    onEscape?: () => void
    autoFocus?: boolean
  } = {},
) {
  const { active = true, onEscape, autoFocus = true } = opts
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    restoreRef.current = document.activeElement as HTMLElement | null

    if (autoFocus) {
      // Defer one frame so any autoFocus attribute on inputs wins first
      // (the input's native autoFocus runs synchronously in the same tick).
      const t = window.setTimeout(() => {
        if (!container.contains(document.activeElement)) {
          const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
          const first = preferred ?? getFocusable(container)[0] ?? container
          first.focus()
        }
      }, 0)
      // Track timer for cleanup if unmount happens before timer fires.
      ;(container as unknown as { __focusTimer?: number }).__focusTimer = t
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = getFocusable(container!)
      if (focusables.length === 0) {
        e.preventDefault()
        container!.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (activeEl === last || !container!.contains(activeEl)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const timer = (container as unknown as { __focusTimer?: number }).__focusTimer
      if (timer) window.clearTimeout(timer)
      // Restore focus to the element that opened us, if it's still in the
      // DOM. Skip if focus has already moved elsewhere by a later effect.
      const toRestore = restoreRef.current
      if (toRestore && document.contains(toRestore)) {
        try {
          toRestore.focus({ preventScroll: true })
        } catch {
          // ignore — element may be unfocusable
        }
      }
    }
  }, [active, autoFocus, containerRef, onEscape])
}
