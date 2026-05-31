// Tiny global toast bus for one-off success/error notices. Designed for use
// from anywhere (including non-React code) without prop-drilling.

export interface ToastMessage {
  id: string
  level: 'info' | 'success' | 'error'
  text: string
  ttl: number
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
  setTimeout(() => dismissToast(id), ttl)
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
