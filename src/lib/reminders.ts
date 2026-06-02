import dayjs from 'dayjs'
import { db } from '@/db'
import { updateReminder } from '@/lib/repository'
import type { Reminder } from '@/types'
import { addInAppReminder } from './reminderBus'

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission()
    } catch {
      return 'denied'
    }
  }
  return Notification.permission
}

function tryNativeNotification(r: Reminder): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  try {
    const n = new Notification('🔔 筑迹提醒', {
      body: r.title,
      tag: r.id,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

async function bumpRepeat(r: Reminder): Promise<void> {
  if (!r.repeated || r.repeated === 'none') {
    await updateReminder(r.id, { done: true })
    return
  }
  const next =
    r.repeated === 'daily' ? dayjs(r.triggerAt).add(1, 'day') : dayjs(r.triggerAt).add(1, 'week')
  await updateReminder(r.id, { triggerAt: next.toISOString() })
}

let started = false
const fired = new Set<string>()

export function startReminderLoop() {
  if (started) return
  started = true
  const tick = async () => {
    try {
      const now = new Date().toISOString()
      const all = await db.reminders.toArray().catch(() => [] as Reminder[])
      for (const r of all) {
        if (r.done) continue
        if (r.triggerAt > now) continue
        const key = r.id + ':' + r.triggerAt
        if (fired.has(key)) continue
        fired.add(key)
        const delivered = tryNativeNotification(r)
        if (delivered) {
          // OS notification surfaced → safe to advance.
          await bumpRepeat(r)
        } else {
          // No permission or platform failure — surface in-app and wait for the
          // user to dismiss before advancing. The reminder stays in its current
          // state (not done, triggerAt unchanged) until dismissal.
          addInAppReminder(r, async () => {
            await bumpRepeat(r)
          })
        }
      }
    } catch {
      // swallow — keep loop alive
    }
  }
  tick()
  window.setInterval(tick, 30_000)
}
