import { useState } from 'react'
import { db } from '@/db'
import { deleteProject } from '@/lib/projects'
import { clearAllData, loadDemoProject } from '@/data/seed'
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
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoMsg, setDemoMsg] = useState<string | null>(null)

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

  async function handleLoadDemo() {
    if (demoBusy) return
    setDemoBusy(true)
    setDemoMsg(null)
    try {
      const r = await loadDemoProject()
      setProject(r.project.id)
      setDemoMsg(`✓ 已加载「${r.project.name}」，含 ${r.nodeCount} 个节点 / ${r.purchaseCount} 笔采购`)
      setTimeout(() => setDemoMsg(null), 3000)
    } finally {
      setDemoBusy(false)
    }
  }

  async function handleClearAll() {
    if (!confirm('确定清空所有数据？\n\n这会删除全部项目、节点、采购记录、图片、提醒，无法撤销。')) return
    if (!confirm('再确认一次：真的要清空全部本地数据吗？')) return
    await clearAllData()
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
          <div className="card-title">演示数据</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            一键加载一个"已经装到一半"的真实感样本项目（89㎡ 毛坯，约 30 笔采购），
            方便快速体验各项功能。可重复加载，每次新建一个独立项目，不影响你已有的数据。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              data-testid="btn-load-demo"
              onClick={handleLoadDemo}
              disabled={demoBusy}
            >
              {demoBusy ? '加载中…' : 'Load Demo Project · 加载示例项目'}
            </button>
            {demoMsg && <span style={{ color: 'var(--success)', fontSize: 13 }}>{demoMsg}</span>}
          </div>
        </div>

        <div className="col-12 card">
          <div className="card-title">危险操作</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            删除当前项目会同时删除其下所有节点、采购、图片，无法撤销。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-danger" onClick={handleDelete}>
              删除当前项目
            </button>
            <button
              className="btn btn-danger"
              data-testid="btn-clear-all"
              onClick={handleClearAll}
            >
              清空所有数据
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
