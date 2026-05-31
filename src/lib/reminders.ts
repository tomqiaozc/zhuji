import dayjs from 'dayjs'
import { db } from '@/db'
import type { Reminder } from '@/types'

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

function fireNotification(r: Reminder) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const n = new Notification('🔔 筑迹提醒', {
      body: r.title,
      tag: r.id,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // ignore
  }
}

async function bumpRepeat(r: Reminder): Promise<void> {
  if (!r.repeated || r.repeated === 'none') {
    await db.reminders.update(r.id, { done: true })
    return
  }
  const next =
    r.repeated === 'daily'
      ? dayjs(r.triggerAt).add(1, 'day')
      : dayjs(r.triggerAt).add(1, 'week')
  await db.reminders.update(r.id, { triggerAt: next.toISOString() })
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
        if (fired.has(r.id + ':' + r.triggerAt)) continue
        fired.add(r.id + ':' + r.triggerAt)
        fireNotification(r)
        await bumpRepeat(r)
      }
    } catch {
      // swallow — keep loop alive
    }
  }
  tick()
  window.setInterval(tick, 30_000)
}
