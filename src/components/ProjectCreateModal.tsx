import { useState } from 'react'
import { loadDemoProject } from '@/data/seed'
import type { ProjectType } from '@/types'
import { Modal } from './ui/Modal'

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
  onDemoLoaded?: (projectId: string) => void
  onClose: () => void
}

export function ProjectCreateModal({ allowCancel, onSubmit, onDemoLoaded, onClose }: Props) {
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
    <Modal
      onClose={onClose}
      labelledBy="project-create-title"
      closeOnBackdrop={allowCancel}
      closeOnEsc={allowCancel}
    >
      <div className="drawer-header">
        <h2 id="project-create-title" className="drawer-title">
          新建项目
        </h2>
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
          data-testid="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：朝阳保利和光屿湖"
          data-autofocus
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
            inputMode="decimal"
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
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
        {onDemoLoaded && (
          <button
            className="btn"
            data-testid="btn-load-demo-modal"
            onClick={async () => {
              if (busy) return
              setBusy(true)
              try {
                const r = await loadDemoProject()
                onDemoLoaded(r.project.id)
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
          >
            Load Demo Project
          </button>
        )}
        <button
          className="btn btn-primary"
          data-testid="project-create-submit"
          onClick={submit}
          disabled={!name.trim() || busy}
        >
          {busy ? '创建中…' : '创建项目'}
        </button>
      </div>
    </Modal>
  )
}
