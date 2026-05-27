import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useApp } from '@/store/app'
import { createProject } from '@/lib/projects'
import { Topbar } from '@/components/Topbar'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/views/Dashboard'
import { NodeWorkspace } from '@/views/NodeWorkspace'
import { Purchases } from '@/views/Purchases'
import { Settings } from '@/views/Settings'
import { ProjectCreateModal } from '@/components/ProjectCreateModal'
import { PurchaseDrawer } from '@/components/PurchaseDrawer'

export default function App() {
  const { currentProjectId, setProject, view } = useApp()
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? []
  const [showCreate, setShowCreate] = useState(false)
  const [drawer, setDrawer] = useState<{ open: boolean; nodeId?: string }>({ open: false })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (projects.length === 0) {
      setShowCreate(true)
      return
    }
    if (!currentProjectId || !projects.find((p) => p.id === currentProjectId)) {
      setProject(projects[0].id)
    }
  }, [projects, currentProjectId, setProject])

  const current = projects.find((p) => p.id === currentProjectId) ?? null

  async function handleCreate(data: {
    name: string
    address?: string
    area?: number
    type?: '毛坯' | '老房改造' | '局部翻新'
    startDate?: string
    expectedEndDate?: string
  }) {
    const proj = await createProject(data)
    setProject(proj.id)
    setShowCreate(false)
  }

  return (
    <div className="app">
      <Topbar
        project={current}
        projects={projects}
        onSwitch={(id) => setProject(id)}
        onNewProject={() => setShowCreate(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className="body">
        <Sidebar mobileOpen={sidebarOpen} onNav={() => setSidebarOpen(false)} />
        <main className="main">
          {!current ? (
            <div className="view">
              <div className="empty">
                还没有项目。{' '}
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  新建项目
                </button>
              </div>
            </div>
          ) : view === 'dashboard' ? (
            <Dashboard project={current} onAddPurchase={() => setDrawer({ open: true })} />
          ) : view === 'node' ? (
            <NodeWorkspace
              project={current}
              onAddPurchase={(nodeId) => setDrawer({ open: true, nodeId })}
            />
          ) : view === 'purchase' ? (
            <Purchases project={current} onAddPurchase={() => setDrawer({ open: true })} />
          ) : (
            <Settings key={current.id} project={current} onNewProject={() => setShowCreate(true)} />
          )}
        </main>
      </div>

      {showCreate && (
        <ProjectCreateModal
          allowCancel={projects.length > 0}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          onDemoLoaded={(id) => {
            setProject(id)
            setShowCreate(false)
          }}
        />
      )}

      {drawer.open && current && (
        <PurchaseDrawer
          project={current}
          presetNodeId={drawer.nodeId}
          onClose={() => setDrawer({ open: false })}
        />
      )}
    </div>
  )
}
