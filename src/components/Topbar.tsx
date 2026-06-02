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
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const user = useAuth((s) => s.user)
  const clearSession = useAuth((s) => s.clearSession)
  const resetApp = useApp((s) => s.reset)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const itemCount = projects.length + 1 // projects + "新建项目"

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

  function openMenu(initialIdx = 0) {
    setMenu(true)
    setActiveIdx(initialIdx)
  }

  function closeMenu(restoreFocus: boolean) {
    setMenu(false)
    if (restoreFocus) {
      // Defer focus restore so the menu is unmounted first.
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  useEffect(() => {
    if (!menu) return
    const target = itemRefs.current[activeIdx]
    target?.focus()
  }, [menu, activeIdx])

  useEffect(() => {
    if (!menu) return
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current || !triggerRef.current) return
      if (
        menuRef.current.contains(e.target as Node) ||
        triggerRef.current.contains(e.target as Node)
      ) {
        return
      }
      setMenu(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menu])

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu(itemCount - 1)
    }
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % itemCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + itemCount) % itemCount)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIdx(itemCount - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu(true)
    } else if (e.key === 'Tab') {
      // Let Tab move focus out and close menu naturally.
      setMenu(false)
    }
  }

  function selectProject(id: string) {
    onSwitch(id)
    closeMenu(true)
  }

  function selectNew() {
    onNewProject()
    closeMenu(true)
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
      <div style={{ position: 'relative' }}>
        <button
          ref={triggerRef}
          className="project-switcher"
          onClick={() => (menu ? closeMenu(false) : openMenu(0))}
          onKeyDown={onTriggerKey}
          aria-label="切换项目"
          aria-haspopup="menu"
          aria-expanded={menu}
        >
          <span aria-hidden="true">🏠</span>
          <span>
            {project ? project.name + (project.area ? ` · ${project.area}㎡` : '') : '新建项目'}
          </span>
          <span className="arrow" aria-hidden="true">
            ▾
          </span>
        </button>
        {menu && (
          <div ref={menuRef} className="menu" role="menu" onKeyDown={onMenuKey}>
            {projects.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className={`menu-item ${i === activeIdx ? 'menu-item-active' : ''}`}
                onClick={() => selectProject(p.id)}
                role="menuitem"
                tabIndex={i === activeIdx ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true">🏠</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
                {project?.id === p.id && (
                  <span style={{ color: 'var(--primary)' }} aria-label="当前项目">
                    ✓
                  </span>
                )}
              </button>
            ))}
            {projects.length > 0 && <div className="menu-divider" />}
            <button
              ref={(el) => {
                itemRefs.current[projects.length] = el
              }}
              className={`menu-item ${projects.length === activeIdx ? 'menu-item-active' : ''}`}
              onClick={selectNew}
              role="menuitem"
              tabIndex={projects.length === activeIdx ? 0 : -1}
              type="button"
            >
              <span aria-hidden="true">＋</span>
              <span style={{ textAlign: 'left' }}>新建项目</span>
            </button>
          </div>
        )}
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" title="搜索 (⌘K)" aria-label="搜索" onClick={onOpenSearch}>
          🔍
        </button>
        <button className="icon-btn" title="提醒" aria-label="提醒" onClick={onOpenReminders}>
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
