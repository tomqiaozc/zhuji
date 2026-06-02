// Tiny global toast bus for one-off success/error notices. Designed for use
// from anywhere (including non-React code) without prop-drilling.

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMessage {
  id: string
  level: 'info' | 'success' | 'error'
  text: string
  ttl: number
  action?: ToastAction
}

type Listener = (items: ToastMessage[]) => void

let items: ToastMessage[] = []
const listeners = new Set<Listener>()
let nextId = 0

function emit() {
  for (const l of listeners) l([...items])
}

export function pushToast(text: string, level: ToastMessage['level'] = 'info', ttl = 4000) {
  const id = `t${++nextId}`
  items = [...items, { id, level, text, ttl }]
  emit()
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl)
  return id
}

/**
 * Sticky toast with an action button. ttl=0 means it stays until the user
 * clicks the action or dismisses it. Used for "new version available — reload?".
 */
export function pushActionToast(
  text: string,
  action: ToastAction,
  level: ToastMessage['level'] = 'info',
): string {
  const id = `t${++nextId}`
  items = [...items, { id, level, text, ttl: 0, action }]
  emit()
  return id
}

export function dismissToast(id: string) {
  const before = items.length
  items = items.filter((i) => i.id !== id)
  if (items.length !== before) emit()
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l)
  l([...items])
  return () => listeners.delete(l)
}
