import { useState } from 'react'
import { db } from '@/db'
import { deleteProject } from '@/lib/projects'
import { useApp } from '@/store/app'
import type { Project, ProjectType } from '@/types'

interface Props {
  project: Project
  onNewProject: () => void
}

export function Settings({ project, onNewProject }: Props) {
  const { setProject } = useApp()
  const [name, setName] = useState(project.name)
  const [address, setAddress] = useState(project.address ?? '')
  const [area, setArea] = useState(project.area != null ? String(project.area) : '')
  const [type, setType] = useState<ProjectType>(project.type ?? '毛坯')
  const [startDate, setStartDate] = useState(project.startDate ?? '')
  const [expectedEndDate, setExpectedEndDate] = useState(project.expectedEndDate ?? '')
  const [saved, setSaved] = useState(false)

  async function save() {
    await db.projects.update(project.id, {
      name: name.trim() || project.name,
      address: address.trim() || undefined,
      area: area ? Number(area) : undefined,
      type,
      startDate: startDate || undefined,
      expectedEndDate: expectedEndDate || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function handleDelete() {
    if (!confirm(`删除项目「${project.name}」？所有节点和采购都会一起删除。`)) return
    await deleteProject(project.id)
    setProject(null)
  }

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">项目设置</h1>
          <div className="view-subtitle">编辑当前项目信息</div>
        </div>
        <button className="btn btn-primary" onClick={onNewProject}>
          + 新建项目
        </button>
      </div>

      <div className="dash-grid">
        <div className="col-12 card">
          <div className="card-title">基本信息</div>
          <div className="form-row">
            <label>项目名称</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-row">
            <label>地址</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>面积（㎡）</label>
              <input type="number" value={area} onChange={(e) => setArea(e.target.value)} />
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save}>
              保存
            </button>
            {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ 已保存</span>}
          </div>
        </div>

        <div className="col-12 card">
          <div className="card-title">危险操作</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            删除当前项目会同时删除其下所有节点、采购、图片，无法撤销。
          </p>
          <button className="btn btn-danger" onClick={handleDelete}>
            删除项目
          </button>
        </div>
      </div>
    </section>
  )
}
