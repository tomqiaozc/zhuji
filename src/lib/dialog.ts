// Promise-based confirm/alert bus. Replaces window.confirm / window.alert so
// the visual style matches the rest of the app and dialogs are testable.

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface AlertOptions {
  title?: string
  message: string
  okLabel?: string
}

export type DialogRequest =
  | { id: number; kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: 'alert'; opts: AlertOptions; resolve: () => void }

type Listener = (req: DialogRequest | null) => void

let current: DialogRequest | null = null
const queue: DialogRequest[] = []
const listeners = new Set<Listener>()
let nextId = 0

function emit() {
  for (const l of listeners) l(current)
}

function pump() {
  if (current || queue.length === 0) return
  current = queue.shift() ?? null
  emit()
}

export function subscribeDialog(l: Listener): () => void {
  listeners.add(l)
  l(current)
  return () => listeners.delete(l)
}

export function resolveCurrent(value: boolean) {
  const c = current
  if (!c) return
  current = null
  if (c.kind === 'confirm') c.resolve(value)
  else c.resolve()
  emit()
  pump()
}

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
  return new Promise<boolean>((resolve) => {
    queue.push({ id: ++nextId, kind: 'confirm', opts: o, resolve })
    pump()
  })
}

export function alertDialog(opts: AlertOptions | string): Promise<void> {
  const o: AlertOptions = typeof opts === 'string' ? { message: opts } : opts
  return new Promise<void>((resolve) => {
    queue.push({ id: ++nextId, kind: 'alert', opts: o, resolve })
    pump()
  })
}
