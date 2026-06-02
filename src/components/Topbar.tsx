import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/store/app'
import { useAuth } from '@/store/auth'
import { clearLocalCache } from '@/lib/repository'
import { clearAssetViewerToken } from '@/lib/api'
import type { Project } from '@/types'

interface Props {
  project: Project | null
  projects: Project[]
  onSwitch: (id: string) => void
  onNewProject: () => void
  onToggleSidebar: () => void
  onOpenReminders: () => void
  onOpenSearch: () => void
}

export function Topbar({
  project,
  projects,
  onSwitch,
  onNewProject,
  onToggleSidebar,
  onOpenReminders,
  onOpenSearch,
}: Props) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const user = useAuth((s) => s.user)
  const clearSession = useAuth((s) => s.clearSession)
  const resetApp = useApp((s) => s.reset)

  // Close the project menu when the user clicks outside or presses Esc.
  // `onMouseLeave` (the prior approach) never fires on touch devices, so
  // the menu would stay stuck open on mobile.
  useEffect(() => {
    if (!menu) return
    function onPointerDown(e: PointerEvent) {
      const root = menuRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setMenu(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  async function handleLogout() {
    await clearLocalCache()
    clearAssetViewerToken()
    // Clear UI state BEFORE the auth token — otherwise the persisted
    // currentProjectId leaks into the next account's first render.
    resetApp()
    clearSession()
  }
  return (
    <header className="topbar">
      <button
        className="icon-btn hamburger"
        aria-label="菜单"
        onClick={onToggleSidebar}
        title="菜单"
      >
        ☰
      </button>
      <div className="logo">
        <span className="logo-mark">筑</span>
        <span>筑迹 Zhuji</span>
      </div>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          className="project-switcher"
          onClick={() => setMenu((v) => !v)}
          aria-label="切换项目"
          aria-haspopup="menu"
          aria-expanded={menu}
        >
          <span>🏠</span>
          <span>
            {project
              ? project.name + (project.area ? ` · ${project.area}㎡` : '')
              : '新建项目'}
          </span>
          <span className="arrow">▾</span>
        </button>
        {menu && (
          <div className="menu" role="menu">
            {projects.map((p) => (
              <div
                key={p.id}
                className="menu-item"
                onClick={() => {
                  onSwitch(p.id)
                  setMenu(false)
                }}
                role="menuitem"
              >
                <span>🏠</span>
                <span style={{ flex: 1 }}>{p.name}</span>
                {project?.id === p.id && <span style={{ color: 'var(--primary)' }}>✓</span>}
              </div>
            ))}
            {projects.length > 0 && <div className="menu-divider" />}
            <div
              className="menu-item"
              onClick={() => {
                onNewProject()
                setMenu(false)
              }}
              role="menuitem"
            >
              <span>＋</span>
              <span>新建项目</span>
            </div>
          </div>
        )}
      </div>
      <div className="topbar-actions">
        <button
          className="icon-btn"
          title="搜索 (⌘K)"
          aria-label="搜索"
          onClick={onOpenSearch}
        >
          🔍
        </button>
        <button
          className="icon-btn"
          title="提醒"
          aria-label="提醒"
          onClick={onOpenReminders}
        >
          🔔
        </button>
        {user && (
          <div className="topbar-user">
            <span data-testid="topbar-user" title="当前账号">
              👤 {user.username}
            </span>
            <button data-testid="topbar-logout" onClick={handleLogout}>
              退出
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
