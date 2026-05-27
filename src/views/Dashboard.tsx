import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { db } from '@/db'
import { fmtMoney } from '@/lib/format'
import type { Project } from '@/types'

interface Props {
  project: Project
  onAddPurchase: () => void
}

const STAGE_COLORS: Record<string, string> = {
  前期准备: '#94a3b8',
  设计: '#6366f1',
  主体改造: '#0ea5e9',
  水电改造: '#2563eb',
  防水: '#06b6d4',
  瓦工: '#7c3aed',
  木工: '#f59e0b',
  油工: '#ec4899',
  安装: '#10b981',
  软装家电: '#84cc16',
  收尾: '#ef4444',
}

const PIE_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#f59e0b',
  '#16a34a',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#6b7280',
]

export function Dashboard({ project, onAddPurchase }: Props) {
  const nodes =
    useLiveQuery(() => db.nodes.where('projectId').equals(project.id).toArray(), [project.id]) ?? []
  const purchases =
    useLiveQuery(
      () => db.purchases.where('projectId').equals(project.id).toArray(),
      [project.id],
    ) ?? []

  const doneCount = nodes.filter((n) => n.status === 'done').length
  const totalNodes = nodes.length
  const progress = totalNodes > 0 ? Math.round((doneCount / totalNodes) * 100) : 0

  const totalSpent = useMemo(
    () => purchases.reduce((s, p) => s + (p.totalPrice || 0), 0),
    [purchases],
  )

  const weekStart = dayjs().startOf('week').toISOString()
  const weekCount = purchases.filter((p) => p.createdAt >= weekStart).length

  const stageCost = useMemo(() => {
    const byNode = new Map(nodes.map((n) => [n.id, n.stage]))
    const map = new Map<string, number>()
    for (const p of purchases) {
      const stage = byNode.get(p.nodeId) ?? '其他'
      map.set(stage, (map.get(stage) ?? 0) + p.totalPrice)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [purchases, nodes])

  const stageTotal = stageCost.reduce((s, [, v]) => s + v, 0)

  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of purchases) {
      map.set(p.category, (map.get(p.category) ?? 0) + p.totalPrice)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [purchases])

  const recent = useMemo(
    () =>
      [...purchases]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 5),
    [purchases],
  )

  const startDate = project.startDate ? dayjs(project.startDate) : null
  const daysIn = startDate ? dayjs().diff(startDate, 'day') : null
  const endDate = project.expectedEndDate ? dayjs(project.expectedEndDate) : null
  const daysLeft = endDate ? endDate.diff(dayjs(), 'day') : null
  const activeStage = nodes.find((n) => n.status === 'doing')?.stage

  const subtitleParts: string[] = []
  if (daysIn != null && daysIn >= 0) subtitleParts.push(`开工 ${daysIn} 天`)
  if (daysLeft != null) {
    subtitleParts.push(daysLeft >= 0 ? `预计还有 ${daysLeft} 天` : `已超期 ${-daysLeft} 天`)
  }
  if (activeStage) subtitleParts.push(`当前阶段：${activeStage}`)

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">总览</h1>
          {subtitleParts.length > 0 && (
            <div className="view-subtitle">{subtitleParts.join(' · ')}</div>
          )}
        </div>
        <div>
          <button className="btn btn-primary" onClick={onAddPurchase}>
            + 记一笔
          </button>
        </div>
      </div>

      <div className="dash-grid">
        <div className="col-3 card">
          <div className="card-title">装修进度</div>
          <div className="progress-ring">
            <div
              className="ring"
              style={{
                background: `conic-gradient(var(--primary) 0% ${progress}%, #e5e7eb ${progress}% 100%)`,
              }}
            >
              <span>{progress}%</span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>已完成节点</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                {doneCount} / {totalNodes}
              </div>
            </div>
          </div>
        </div>

        <div className="col-3 card">
          <div className="card-title">累计支出</div>
          <div className="metric">
            <div className="num">{fmtMoney(totalSpent)}</div>
            <div className="sub">{purchases.length} 笔采购</div>
          </div>
        </div>

        <div className="col-3 card">
          <div className="card-title">本周采购</div>
          <div className="metric">
            <div className="num">{weekCount} 笔</div>
            <div className="sub">
              {weekCount > 0
                ? recent
                    .filter((p) => p.createdAt >= weekStart)
                    .slice(0, 3)
                    .map((p) => p.name.slice(0, 6))
                    .join('、')
                : '还没有记录'}
            </div>
          </div>
        </div>

        <div className="col-3 card">
          <div className="card-title">当前进行中</div>
          <div className="metric">
            <div className="num" style={{ color: 'var(--primary)' }}>
              {nodes.filter((n) => n.status === 'doing').length}
            </div>
            <div className="sub">
              {nodes
                .filter((n) => n.status === 'doing')
                .slice(0, 3)
                .map((n) => n.name)
                .join(' / ') || '暂无进行中节点'}
            </div>
          </div>
        </div>

        <div className="col-8 card">
          <div className="card-title">各阶段花费分布</div>
          {stageTotal === 0 ? (
            <div className="empty">还没有采购记录</div>
          ) : (
            <>
              <div className="stage-bar">
                {stageCost.map(([stage, v]) => (
                  <div
                    key={stage}
                    style={{
                      width: `${(v / stageTotal) * 100}%`,
                      background: STAGE_COLORS[stage] ?? '#6b7280',
                    }}
                    title={`${stage} ${fmtMoney(v)}`}
                  >
                    {(v / stageTotal) * 100 >= 10 ? stage : ''}
                  </div>
                ))}
              </div>
              <div className="stage-legend">
                {stageCost.map(([stage, v]) => (
                  <span key={stage}>
                    <span
                      className="dot"
                      style={{ background: STAGE_COLORS[stage] ?? '#6b7280' }}
                    />
                    {stage} {fmtMoney(v)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="col-4 card">
          <div className="card-title">品类支出</div>
          {categoryData.length === 0 ? (
            <div className="empty">暂无数据</div>
          ) : (
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-12 card">
          <div className="card-title">最近采购</div>
          {recent.length === 0 ? (
            <div className="empty">还没有采购记录，点右上"记一笔"开始</div>
          ) : (
            <div className="activity-list">
              {recent.map((p) => {
                const node = nodes.find((n) => n.id === p.nodeId)
                return (
                  <div key={p.id} className="activity-item">
                    <div className="icon-wrap">🧾</div>
                    <div className="meta">
                      <div className="t">{p.name}</div>
                      <div className="s">
                        {node?.stage ?? '—'} · {dayjs(p.purchaseDate).format('M月D日')}
                        {p.channel ? ` · ${p.channel}` : ''}
                      </div>
                    </div>
                    <div className="price">{fmtMoney(p.totalPrice)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
