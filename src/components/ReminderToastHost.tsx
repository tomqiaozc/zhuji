import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  dismissInAppReminder,
  subscribeInAppReminders,
  type PendingReminder,
} from '@/lib/reminderBus'

export function ReminderToastHost() {
  const [items, setItems] = useState<PendingReminder[]>([])

  useEffect(() => subscribeInAppReminders(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="reminder-toast-host" data-testid="reminder-toast-host" role="alert">
      {items.map((it) => (
        <div key={it.reminder.id + ':' + it.reminder.triggerAt} className="reminder-toast">
          <div className="reminder-toast-head">
            <span className="bell">🔔</span>
            <span className="ttl">筑迹提醒</span>
            <span className="time">{dayjs(it.reminder.triggerAt).format('YYYY-MM-DD HH:mm')}</span>
          </div>
          <div className="reminder-toast-body">{it.reminder.title}</div>
          <div className="reminder-toast-foot">
            <button
              className="btn btn-sm btn-primary"
              data-testid="reminder-dismiss"
              onClick={() => void dismissInAppReminder(it.reminder.id, it.reminder.triggerAt)}
            >
              知道了
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
