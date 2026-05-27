import { useState } from 'react'
import type { ProjectType } from '@/types'

interface Props {
  allowCancel: boolean
  onSubmit: (data: {
    name: string
    address?: string
    area?: number
    type?: ProjectType
    startDate?: string
    expectedEndDate?: string
  }) => void | Promise<void>
  onClose: () => void
}

export function ProjectCreateModal({ allowCancel, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [type, setType] = useState<ProjectType>('毛坯')
  const [startDate, setStartDate] = useState('')
  const [expectedEndDate, setExpectedEndDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(),
        address: address.trim() || undefined,
        area: area ? Number(area) : undefined,
        type,
        startDate: startDate || undefined,
        expectedEndDate: expectedEndDate || undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => allowCancel && e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div className="drawer-title">新建项目</div>
          {allowCancel && (
            <button className="icon-btn" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          )}
        </div>
        <div className="form-row">
          <label>项目名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：朝阳保利和光屿湖"
            autoFocus
          />
        </div>
        <div className="form-row">
          <label>地址</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="北京市朝阳区…"
          />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>面积（㎡）</label>
            <input
              type="number"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="89"
            />
          </div>
          <div className="form-row">
            <label>装修类型</label>
            <select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              <option value="毛坯">毛坯</option>
              <option value="老房改造">老房改造</option>
              <option value="局部翻新">局部翻新</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>开工日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>预计完工</label>
            <input
              type="date"
              value={expectedEndDate}
              onChange={(e) => setExpectedEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="drawer-actions">
          {allowCancel && (
            <button className="btn" onClick={onClose}>
              取消
            </button>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? '创建中…' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  )
}
