import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '@/store/app'
import { db } from '@/db'

interface Props {
  mobileOpen: boolean
  onNav: () => void
}

export function Sidebar({ mobileOpen, onNav }: Props) {
  const { view, setView, currentProjectId } = useApp()

  // One combined live query instead of two separate ones. Dexie still
  // re-runs when either table changes, but we register a single listener
  // and a single transaction round-trip per change.
  const counts = useLiveQuery(
    async () => {
      if (!currentProjectId) return { nodes: 0, purchases: 0 }
      const [nodes, purchases] = await Promise.all([
        db.nodes.where('projectId').equals(currentProjectId).count(),
        db.purchases.where('projectId').equals(currentProjectId).count(),
      ])
      return { nodes, purchases }
    },
    [currentProjectId],
    { nodes: 0, purchases: 0 },
  )

  const items: {
    key: typeof view
    icon: string
    label: string
    badge?: number
  }[] = [
    { key: 'dashboard', icon: '📊', label: '总览' },
    { key: 'node', icon: '📋', label: '节点工作台', badge: counts.nodes },
    { key: 'timeline', icon: '📅', label: '时间轴' },
    { key: 'purchase', icon: '🧾', label: '采购流水', badge: counts.purchases },
  ]

  return (
    <nav className={`sidebar ${mobileOpen ? 'mobile-open' : 'mobile-hidden'}`}>
      <div className="nav-section">项目</div>
      {items.map((it) => (
        <button
          key={it.key}
          className={`nav-item ${view === it.key ? 'active' : ''}`}
          onClick={() => {
            setView(it.key)
            onNav()
          }}
        >
          <span className="icon">{it.icon}</span>
          {it.label}
          {it.badge != null && it.badge > 0 && <span className="badge">{it.badge}</span>}
        </button>
      ))}
      <div className="nav-section">设置</div>
      <button
        className={`nav-item ${view === 'settings' ? 'active' : ''}`}
        onClick={() => {
          setView('settings')
          onNav()
        }}
      >
        <span className="icon">⚙️</span>项目设置
      </button>
    </nav>
  )
}
