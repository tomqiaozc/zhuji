import { useState } from 'react'
import { updateProject, deleteProject } from '@/lib/repository'
import { loadDemoProject } from '@/data/seed'
import { useApp } from '@/store/app'
import { useAuth } from '@/store/auth'
import type { Project, ProjectType } from '@/types'
import { exportProjectPdf } from '@/lib/backup'
import { TemplateEditor } from '@/components/TemplateEditor'
import { clearLocalCache, hydrateEverything } from '@/lib/repository'
import { clearAssetViewerToken } from '@/lib/api'
import { alertDialog, confirmDialog } from '@/lib/dialog'

interface Props {
  project: Project
  onNewProject: () => void
}

export function Settings({ project, onNewProject }: Props) {
  const setProject = useApp((s) => s.setProject)
  const resetApp = useApp((s) => s.reset)
  const user = useAuth((s) => s.user)
  const clearSession = useAuth((s) => s.clearSession)
  const [name, setName] = useState(project.name)
  const [address, setAddress] = useState(project.address ?? '')
  const [area, setArea] = useState(project.area != null ? String(project.area) : '')
  const [type, setType] = useState<ProjectType>(project.type ?? '毛坯')
  const [startDate, setStartDate] = useState(project.startDate ?? '')
  const [expectedEndDate, setExpectedEndDate] = useState(project.expectedEndDate ?? '')
  const [saved, setSaved] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoMsg, setDemoMsg] = useState<string | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  async function save() {
    await updateProject(project.id, {
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
    const ok = await confirmDialog({
      title: '删除项目',
      message: `删除项目「${project.name}」？\n所有节点和采购都会一起删除（云端数据也会删除，无法撤销）。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
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
      setDemoMsg(
        `✓ 已加载「${r.project.name}」，含 ${r.nodeCount} 个节点 / ${r.purchaseCount} 笔采购`,
      )
      setTimeout(() => setDemoMsg(null), 3000)
    } catch (e) {
      setDemoMsg('✗ ' + ((e as Error)?.message ?? '加载失败'))
    } finally {
      setDemoBusy(false)
    }
  }

  async function handleResync() {
    if (syncBusy) return
    setSyncBusy(true)
    setSyncMsg(null)
    try {
      await clearLocalCache()
      await hydrateEverything()
      setSyncMsg('✓ 已从云端重新拉取数据')
      setTimeout(() => setSyncMsg(null), 2500)
    } catch (e) {
      setSyncMsg('✗ ' + ((e as Error)?.message ?? '同步失败'))
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleLogout() {
    await clearLocalCache()
    clearAssetViewerToken()
    // Clear UI state too — currentProjectId persists in zhuji-app-state
    // and would otherwise carry across to the next account's first boot.
    resetApp()
    clearSession()
  }

  async function handleExportPdf() {
    try {
      await exportProjectPdf(project.id)
    } catch (e) {
      await alertDialog({
        title: '导出 PDF 失败',
        message: (e as Error)?.message ?? '未知错误',
      })
    }
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
          <h2 className="card-title">基本信息</h2>
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
              <input
                type="number"
                inputMode="decimal"
                value={area}
                onChange={(e) => setArea(e.target.value)}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save}>
              保存
            </button>
            {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ 已保存</span>}
          </div>
        </div>

        <div className="col-12 card">
          <h2 className="card-title">账号</h2>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            当前登录：<strong data-testid="current-username">{user?.username ?? '—'}</strong>
            。退出登录会清空本设备的缓存，云端数据不会受影响。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              data-testid="btn-resync"
              onClick={handleResync}
              disabled={syncBusy}
            >
              {syncBusy ? '同步中…' : '从云端重新同步'}
            </button>
            <button className="btn" data-testid="btn-logout" onClick={handleLogout}>
              退出登录
            </button>
            {syncMsg && <span style={{ fontSize: 13 }}>{syncMsg}</span>}
          </div>
        </div>

        <div className="col-12 card">
          <h2 className="card-title">演示数据</h2>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            一键加载一个"已经装到一半"的真实感样本项目（89㎡ 毛坯，11 阶段 / 62 节点 / 约 30
            笔采购），方便快速体验各项功能。可重复加载，每次新建一个独立项目，不影响你已有的数据。
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
          <h2 className="card-title">导出装修档案 PDF</h2>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            生成一份当前项目的可打印档案（节点进度、各阶段花费、采购流水），在新窗口里使用浏览器的"打印
            → 另存为 PDF"即可保存。
          </p>
          <button className="btn btn-primary" onClick={handleExportPdf}>
            生成 PDF
          </button>
        </div>

        <div className="col-12 card">
          <h2 className="card-title">节点模板管理</h2>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            管理新建项目时使用的默认节点模板（阶段、节点、避坑要点、checklist）。 模板变更只影响
            <strong>新建</strong>项目，已有项目的节点不会被改动。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowTemplates(true)}
              data-testid="btn-open-templates"
            >
              打开模板编辑器
            </button>
          </div>
        </div>

        <div className="col-12 card">
          <h2 className="card-title">危险操作</h2>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            删除当前项目会同时删除其下所有节点、采购、图片，云端无法撤销。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-danger" onClick={handleDelete}>
              删除当前项目
            </button>
          </div>
        </div>
      </div>

      {showTemplates && <TemplateEditor onClose={() => setShowTemplates(false)} />}
    </section>
  )
}
