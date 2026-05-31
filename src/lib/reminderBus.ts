import type { Reminder } from '@/types'

export interface PendingReminder {
  reminder: Reminder
  onDismiss: () => Promise<void> | void
}

type Listener = (list: PendingReminder[]) => void

let queue: PendingReminder[] = []
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(queue)
}

export function addInAppReminder(reminder: Reminder, onDismiss: () => Promise<void> | void) {
  // Dedup by reminder id + triggerAt so the 30s tick doesn't pile up duplicates.
  const key = reminder.id + ':' + reminder.triggerAt
  if (queue.some((p) => p.reminder.id + ':' + p.reminder.triggerAt === key)) return
  queue = [...queue, { reminder, onDismiss }]
  emit()
}

export async function dismissInAppReminder(id: string, triggerAt: string) {
  const item = queue.find((p) => p.reminder.id === id && p.reminder.triggerAt === triggerAt)
  queue = queue.filter((p) => !(p.reminder.id === id && p.reminder.triggerAt === triggerAt))
  emit()
  if (item) await item.onDismiss()
}

export function subscribeInAppReminders(fn: Listener): () => void {
  listeners.add(fn)
  fn(queue)
  return () => listeners.delete(fn)
}

export function _resetReminderBusForTests() {
  queue = []
  listeners.clear()
}
