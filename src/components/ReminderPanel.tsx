import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { ensureNotificationPermission } from '@/lib/reminders'
import {
  createReminder,
  deleteReminder,
  updateReminder,
} from '@/lib/repository'
import type { Reminder } from '@/types'
import { Modal } from './ui/Modal'

interface Props {
  projectId: string | null
  onClose: () => void
}

export function ReminderPanel({ projectId, onClose }: Props) {
  const reminders =
    useLiveQuery(
      () =>
        projectId
          ? db.reminders.where('projectId').equals(projectId).sortBy('triggerAt')
          : Promise.resolve([] as Reminder[]),
      [projectId],
    ) ?? []
  const nodes =
    useLiveQuery(
      () =>
        projectId
          ? db.nodes.where('projectId').equals(projectId).sortBy('order')
          : Promise.resolve([] as { id: string; stage: string; name: string }[]),
      [projectId],
    ) ?? []

  const [title, setTitle] = useState('')
  const [triggerAt, setTriggerAt] = useState(dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'))
  const [repeated, setRepeated] = useState<'none' | 'daily' | 'weekly'>('none')
  const [nodeId, setNodeId] = useState<string>('')
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  async function requestPerm() {
    const p = await ensureNotificationPermission()
    setPermission(p)
  }

  async function add() {
    if (!projectId || !title.trim() || !triggerAt) return
    // First time you save a reminder, ask for notification permission.
    // Browsers reject prompts that aren't tied to a clear user gesture,
    // and "creating a reminder" is the most natural moment to ask.
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const p = await ensureNotificationPermission()
        setPermission(p)
      } catch {
        // Ignore — saving the reminder is still the primary action.
      }
    }
    await createReminder(projectId, {
      nodeId: nodeId || undefined,
      title: title.trim(),
      triggerAt: new Date(triggerAt).toISOString(),
      repeated,
      done: false,
    })
    setTitle('')
    setNodeId('')
    setRepeated('none')
    setTriggerAt(dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'))
  }

  async function toggleDone(r: Reminder) {
    await updateReminder(r.id, { done: !r.done })
  }

  async function remove(id: string) {
    await deleteReminder(id)
  }

  return (
    <Modal onClose={onClose} variant="drawer" labelledBy="reminder-panel-title">
      <div className="drawer-header">
        <h2 id="reminder-panel-title" className="drawer-title">🔔 提醒</h2>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>

      {!('Notification' in window) ? (
        <div className="empty" style={{ fontSize: 12 }}>
          当前浏览器不支持桌面通知（提醒仍会在面板里显示）
        </div>
      ) : permission !== 'granted' ? (
        <div className="card" style={{ marginBottom: 12, padding: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            开启浏览器通知，提醒到点会弹出系统通知
          </div>
          <button className="btn btn-sm btn-primary" onClick={requestPerm}>
            开启通知
          </button>
        </div>
      ) : null}

      <div className="form-row">
        <label>标题 *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：周五下午验防水"
          data-autofocus
        />
      </div>
      <div className="form-grid">
        <div className="form-row">
          <label>触发时间 *</label>
          <input
            type="datetime-local"
            value={triggerAt}
            onChange={(e) => setTriggerAt(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>重复</label>
          <select
            value={repeated}
            onChange={(e) => setRepeated(e.target.value as 'none' | 'daily' | 'weekly')}
          >
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <label>关联节点</label>
        <select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          <option value="">不关联</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.stage} / {n.name}
            </option>
          ))}
        </select>
      </div>
      <div className="drawer-actions">
        <button className="btn btn-primary" onClick={add} disabled={!title.trim() || !triggerAt}>
          添加提醒
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 className="card-title">全部提醒（{reminders.length}）</h3>
        {reminders.length === 0 ? (
          <div className="empty">还没有提醒</div>
        ) : (
          <div className="reminder-list">
            {reminders.map((r) => {
              const overdue = !r.done && r.triggerAt < new Date().toISOString()
              return (
                <div
                  key={r.id}
                  className={`reminder-item ${r.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={() => toggleDone(r)}
                    aria-label="完成"
                  />
                  <div className="meta">
                    <div className="t">{r.title}</div>
                    <div className="s">
                      {dayjs(r.triggerAt).format('M/D HH:mm')}
                      {r.repeated && r.repeated !== 'none'
                        ? ` · ${r.repeated === 'daily' ? '每天' : '每周'}`
                        : ''}
                      {overdue ? ' · 已到点' : ''}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => remove(r.id)}
                    aria-label="删除"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
