import { useState } from 'react'
import type { Project } from '@/types'

interface Props {
  project: Project | null
  projects: Project[]
  onSwitch: (id: string) => void
  onNewProject: () => void
  onToggleSidebar: () => void
}

export function Topbar({ project, projects, onSwitch, onNewProject, onToggleSidebar }: Props) {
  const [menu, setMenu] = useState(false)
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
      <div style={{ position: 'relative' }}>
        <button className="project-switcher" onClick={() => setMenu((v) => !v)} aria-label="切换项目">
          <span>🏠</span>
          <span>
            {project
              ? project.name + (project.area ? ` · ${project.area}㎡` : '')
              : '新建项目'}
          </span>
          <span className="arrow">▾</span>
        </button>
        {menu && (
          <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
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
        <button className="icon-btn" title="提醒" aria-label="提醒">
          🔔
        </button>
      </div>
    </header>
  )
}
