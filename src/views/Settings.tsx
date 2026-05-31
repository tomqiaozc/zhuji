import { useRef, useState } from 'react'
import { db } from '@/db'
import { deleteProject } from '@/lib/projects'
import { clearAllData, loadDemoProject } from '@/data/seed'
import { useApp } from '@/store/app'
import type { Project, ProjectType } from '@/types'
import {
  disableMirror,
  downloadSnapshotZip,
  isFsAccessSupported,
  pickMirrorDir,
} from '@/lib/fsMirror'
import { exportFullZip, exportProjectPdf, importFullZip, triggerDownload } from '@/lib/backup'
import { TemplateEditor } from '@/components/TemplateEditor'
import dayjs from 'dayjs'

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
  const [mirrorMsg, setMirrorMsg] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function handlePickMirror() {
    try {
      const h = await pickMirrorDir()
      if (h) setMirrorMsg('✓ 已选择目录，数据变更将在 2 秒内自动同步到 筑迹/projects/<projectId>/data.json')
    } catch (e) {
      setMirrorMsg('✗ ' + ((e as Error)?.message ?? '选择失败'))
    }
  }

  async function handleDisableMirror() {
    await disableMirror()
    setMirrorMsg('已停用本地镜像')
  }

  async function handleDownloadSnapshot() {
    try {
      await downloadSnapshotZip()
      setMirrorMsg('✓ 已下载当前备份 Zip')
    } catch (e) {
      setMirrorMsg('✗ ' + ((e as Error)?.message ?? '下载失败'))
    }
  }

  async function handleExportZip() {
    if (backupBusy) return
    setBackupBusy(true)
    setBackupMsg(null)
    try {
      const blob = await exportFullZip()
      triggerDownload(blob, `zhuji-backup-${dayjs().format('YYYYMMDD-HHmm')}.zip`)
      setBackupMsg('✓ 已导出备份压缩包')
    } catch (e) {
      setBackupMsg('✗ ' + ((e as Error)?.message ?? '导出失败'))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleImportZip(file: File) {
    if (!confirm('导入会清空当前所有本地数据并替换为备份内容，确定继续？')) return
    setBackupBusy(true)
    setBackupMsg(null)
    try {
      const r = await importFullZip(file)
      setBackupMsg(
        `✓ 已导入 ${r.projects} 项目 / ${r.nodes} 节点 / ${r.purchases} 采购 / ${r.assets} 图片`,
      )
      setProject(null)
    } catch (e) {
      setBackupMsg('✗ ' + ((e as Error)?.message ?? '导入失败'))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleExportPdf() {
    try {
      await exportProjectPdf(project.id)
    } catch (e) {
      alert('导出 PDF 失败：' + ((e as Error)?.message ?? ''))
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
          <div className="card-title">完整备份与恢复</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            导出包含所有项目、节点、采购、提醒和图片的 Zip 压缩包；也可以从一个备份包导入还原（会清空当前数据）。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleExportZip} disabled={backupBusy}>
              {backupBusy ? '处理中…' : '导出备份 Zip'}
            </button>
            <button
              className="btn"
              onClick={() => importInputRef.current?.click()}
              disabled={backupBusy}
            >
              从 Zip 导入…
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleImportZip(f)
                e.target.value = ''
              }}
            />
            {backupMsg && <span style={{ fontSize: 13 }}>{backupMsg}</span>}
          </div>
        </div>

        <div className="col-12 card">
          <div className="card-title">本地镜像备份（Chrome / Edge）</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            选择本机一个目录后，数据每次变更都会在 2 秒内同步到 <code>筑迹/projects/&lt;projectId&gt;/data.json</code>，
            图片放在同目录的 <code>images/</code> 下；每天还会在 <code>筑迹/snapshots/</code> 下生成一个完整 Zip（保留 30 天）。
            适合放入 iCloud / OneDrive / Dropbox 文件夹做多端同步。
          </p>
          {isFsAccessSupported() ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handlePickMirror}>
                选择镜像目录…
              </button>
              <button className="btn" onClick={handleDisableMirror}>
                停用镜像
              </button>
              {mirrorMsg && <span style={{ fontSize: 13 }}>{mirrorMsg}</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: 'var(--text-mute)', flexBasis: '100%' }}>
                当前浏览器不支持 File System Access API（推荐使用 Chrome 或 Edge）。
                你仍然可以手动下载当前数据快照 Zip。
              </div>
              <button
                className="btn btn-primary"
                data-testid="btn-download-snapshot"
                onClick={handleDownloadSnapshot}
              >
                下载当前备份 Zip
              </button>
              {mirrorMsg && <span style={{ fontSize: 13 }}>{mirrorMsg}</span>}
            </div>
          )}
        </div>

        <div className="col-12 card">
          <div className="card-title">导出装修档案 PDF</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            生成一份当前项目的可打印档案（节点进度、各阶段花费、采购流水），在新窗口里使用浏览器的"打印 → 另存为 PDF"即可保存。
          </p>
          <button className="btn btn-primary" onClick={handleExportPdf}>
            生成 PDF
          </button>
        </div>

        <div className="col-12 card">
          <div className="card-title">节点模板管理</div>
          <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>
            管理新建项目时使用的默认节点模板（阶段、节点、避坑要点、checklist）。
            模板变更只影响<strong>新建</strong>项目，已有项目的节点不会被改动。
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

      {showTemplates && <TemplateEditor onClose={() => setShowTemplates(false)} />}
    </section>
  )
}
