import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useApp } from '@/store/app'
import { createProject } from '@/lib/projects'
import { startReminderLoop } from '@/lib/reminders'
import { loadDemoProject } from '@/data/seed'
import { pushToast } from '@/lib/toast'
import { Topbar } from '@/components/Topbar'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/views/Dashboard'
import { NodeWorkspace } from '@/views/NodeWorkspace'
import { Purchases } from '@/views/Purchases'
import { Settings } from '@/views/Settings'
import { Timeline } from '@/views/Timeline'
import { ProjectCreateModal } from '@/components/ProjectCreateModal'
import { PurchaseDrawer } from '@/components/PurchaseDrawer'
import { ReminderPanel } from '@/components/ReminderPanel'
import { SearchPalette } from '@/components/SearchPalette'
import { ReminderToastHost } from '@/components/ReminderToastHost'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { EmptyHero } from '@/components/EmptyHero'
import { ToastHost } from '@/components/ToastHost'
import { KeyboardHelp } from '@/components/KeyboardHelp'
import { ConfirmDialogHost } from '@/components/ConfirmDialog'

export default function App() {
  const { currentProjectId, setProject, view, setActiveNode, setView } = useApp()
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const [showCreate, setShowCreate] = useState(false)
  const [drawer, setDrawer] = useState<{ open: boolean; nodeId?: string }>({ open: false })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showReminders, setShowReminders] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const projectsLoaded = projects !== undefined
  const list = projects ?? []
  const autoOpenedRef = useRef(false)

  useEffect(() => {
    startReminderLoop()
  }, [])

  useEffect(() => {
    function inEditable(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (currentProjectId) setShowSearch(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (currentProjectId) setDrawer({ open: true })
        return
      }
      if (e.key === '?' && !inEditable(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShowHelp(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentProjectId])

  // No projects yet — keep the welcome screen visible; don't auto-pop the
  // creation modal anymore (the EmptyHero replaces it).
  useEffect(() => {
    if (!projectsLoaded) return
    if (list.length === 0) {
      autoOpenedRef.current = true
      return
    }
    autoOpenedRef.current = false
    if (!currentProjectId) {
      setProject(list[0].id)
    }
  }, [projectsLoaded, list, currentProjectId, setProject])

  const current = list.find((p) => p.id === currentProjectId) ?? null

  async function handleCreate(data: {
    name: string
    address?: string
    area?: number
    type?: '毛坯' | '老房改造' | '局部翻新'
    startDate?: string
    expectedEndDate?: string
    budget?: number
  }) {
    try {
      const proj = await createProject(data)
      setProject(proj.id)
      setShowCreate(false)
      pushToast(`已创建项目「${proj.name}」`, 'success')
    } catch (e) {
      pushToast(`新建失败：${(e as Error)?.message ?? ''}`, 'error', 6000)
    }
  }

  async function handleLoadDemo() {
    if (demoBusy) return
    setDemoBusy(true)
    try {
      const r = await loadDemoProject()
      setProject(r.project.id)
      pushToast(`✓ 已加载「${r.project.name}」`, 'success')
    } catch (e) {
      pushToast(`加载示例失败：${(e as Error)?.message ?? ''}`, 'error', 6000)
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="app">
      <Topbar
        project={current}
        projects={list}
        onSwitch={(id) => setProject(id)}
        onNewProject={() => setShowCreate(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenReminders={() => setShowReminders(true)}
        onOpenSearch={() => current && setShowSearch(true)}
      />
      <div className="body">
        <Sidebar mobileOpen={sidebarOpen} onNav={() => setSidebarOpen(false)} />
        <main className="main">
          <ErrorBoundary>
            {!current ? (
              projectsLoaded && list.length === 0 ? (
                <EmptyHero
                  onCreateProject={() => setShowCreate(true)}
                  onLoadDemo={handleLoadDemo}
                  demoBusy={demoBusy}
                />
              ) : (
                <div className="view">
                  <div className="empty">加载中…</div>
                </div>
              )
            ) : view === 'dashboard' ? (
              <Dashboard project={current} onAddPurchase={() => setDrawer({ open: true })} />
            ) : view === 'node' ? (
              <NodeWorkspace
                project={current}
                onAddPurchase={(nodeId) => setDrawer({ open: true, nodeId })}
              />
            ) : view === 'purchase' ? (
              <Purchases project={current} onAddPurchase={() => setDrawer({ open: true })} />
            ) : view === 'timeline' ? (
              <Timeline project={current} />
            ) : (
              <Settings
                key={current.id}
                project={current}
                onNewProject={() => setShowCreate(true)}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {showCreate && (
        <ProjectCreateModal
          allowCancel={list.length > 0}
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

      {showReminders && (
        <ReminderPanel projectId={currentProjectId} onClose={() => setShowReminders(false)} />
      )}

      {showSearch && current && (
        <SearchPalette
          projectId={current.id}
          onClose={() => setShowSearch(false)}
          onJumpNode={(nodeId) => {
            setActiveNode(nodeId)
            setView('node')
          }}
        />
      )}

      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

      <ReminderToastHost />
      <ToastHost />
      <ConfirmDialogHost />
    </div>
  )
}
