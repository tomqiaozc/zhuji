import { memo, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { db } from '@/db'
import { fmtMoney } from '@/lib/format'
import { useApp } from '@/store/app'
import type { Project } from '@/types'

// Recharts 3.x widened Tooltip `formatter` to receive
// `ValueType | undefined` (ValueType itself = number | string | array).
// We always feed `Tooltip` numeric data, but the type signature requires
// us to accept the broader shape. Narrow once here so both call sites
// stay simple. Returns 0 for missing / non-numeric input.
function toMoney(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

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

export function Dashboard(props: Props) {
  return <DashboardInner {...props} />
}

// Memoize the heavy inner so the parent (which re-renders on every
// global store change) doesn't drag the chart/recharts subtree along
// when only its own state moved. Project / onAddPurchase are stable
// across normal navigation, so reference-equality memo is enough.
const DashboardInner = memo(function DashboardInner({ project, onAddPurchase }: Props) {
  const jumpToPurchasesByStage = useApp((s) => s.jumpToPurchasesByStage)
  const [trendGrain, setTrendGrain] = useState<'week' | 'month'>('week')

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
    () => [...purchases].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
    [purchases],
  )

  const topPurchases = useMemo(
    () =>
      [...purchases]
        .filter((p) => p.totalPrice > 0)
        .sort((a, b) => b.totalPrice - a.totalPrice)
        .slice(0, 5),
    [purchases],
  )

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // Bucket purchases into the last 8 weeks / 6 months by purchaseDate.
  const trendData = useMemo(() => {
    if (purchases.length === 0) return [] as { label: string; amount: number; count: number }[]
    const buckets = new Map<string, { amount: number; count: number }>()
    const now = dayjs()
    if (trendGrain === 'week') {
      for (let i = 7; i >= 0; i--) {
        const k = now.subtract(i, 'week').startOf('week').format('MM/DD')
        buckets.set(k, { amount: 0, count: 0 })
      }
      for (const p of purchases) {
        if (!p.purchaseDate) continue
        const k = dayjs(p.purchaseDate).startOf('week').format('MM/DD')
        const b = buckets.get(k)
        if (b) {
          b.amount += p.totalPrice
          b.count += 1
        }
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const k = now.subtract(i, 'month').format('YYYY/MM')
        buckets.set(k, { amount: 0, count: 0 })
      }
      for (const p of purchases) {
        if (!p.purchaseDate) continue
        const k = dayjs(p.purchaseDate).format('YYYY/MM')
        const b = buckets.get(k)
        if (b) {
          b.amount += p.totalPrice
          b.count += 1
        }
      }
    }
    return [...buckets.entries()].map(([label, v]) => ({ label, ...v }))
  }, [purchases, trendGrain])

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
          <h2 className="card-title">装修进度</h2>
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
          <h2 className="card-title">累计支出</h2>
          <div className="metric">
            <div className="num">{fmtMoney(totalSpent)}</div>
            <div className="sub">{purchases.length} 笔采购</div>
          </div>
        </div>

        {project.budget != null && project.budget > 0 && (
          <div className="col-12 card" data-testid="budget-card">
            <h2 className="card-title">预算 vs 实际</h2>
            <BudgetBar budget={project.budget} spent={totalSpent} />
          </div>
        )}

        <div className="col-3 card">
          <h2 className="card-title">本周采购</h2>
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
          <h2 className="card-title">当前进行中</h2>
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
          <h2 className="card-title">各阶段花费分布（点击查看明细）</h2>
          {stageTotal === 0 ? (
            <div className="empty">还没有采购记录</div>
          ) : (
            <>
              <div className="stage-bar" data-testid="stage-bar">
                {stageCost.map(([stage, v]) => (
                  <button
                    key={stage}
                    type="button"
                    data-testid={`stage-bar-seg-${stage}`}
                    onClick={() => jumpToPurchasesByStage(stage)}
                    style={{
                      width: `${(v / stageTotal) * 100}%`,
                      background: STAGE_COLORS[stage] ?? '#6b7280',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 12,
                      lineHeight: '28px',
                      height: 28,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                    title={`${stage} ${fmtMoney(v)} · 点击查看`}
                    aria-label={`${stage} 花费 ${fmtMoney(v)}，点击筛选采购`}
                  >
                    {(v / stageTotal) * 100 >= 10 ? stage : ''}
                  </button>
                ))}
              </div>
              <div className="stage-legend">
                {stageCost.map(([stage, v]) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => jumpToPurchasesByStage(stage)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: 12,
                      color: 'var(--text-soft)',
                    }}
                  >
                    <span
                      className="dot"
                      style={{ background: STAGE_COLORS[stage] ?? '#6b7280' }}
                    />
                    {stage} {fmtMoney(v)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="col-4 card">
          <h2 className="card-title">品类支出</h2>
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
                  <Tooltip formatter={(v, name) => [fmtMoney(toMoney(v)), String(name ?? '')]} />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-8 card">
          <h2
            className="card-title"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>采购时间趋势</span>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              <button
                type="button"
                className={trendGrain === 'week' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                data-testid="trend-grain-week"
                onClick={() => setTrendGrain('week')}
              >
                按周
              </button>
              <button
                type="button"
                className={trendGrain === 'month' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                data-testid="trend-grain-month"
                onClick={() => setTrendGrain('month')}
              >
                按月
              </button>
            </div>
          </h2>
          {trendData.length === 0 ? (
            <div className="empty">暂无趋势数据</div>
          ) : (
            <div style={{ width: '100%', height: 220 }} data-testid="trend-chart">
              <ResponsiveContainer>
                <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(v, key) => {
                      const n = toMoney(v)
                      return key === 'amount' ? [fmtMoney(n), '金额'] : [n, '笔数']
                    }}
                  />
                  <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-4 card">
          <h2 className="card-title">Top 5 高价采购</h2>
          {topPurchases.length === 0 ? (
            <div className="empty">暂无采购</div>
          ) : (
            <ol
              data-testid="top-purchases"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {topPurchases.map((p, i) => {
                const node = nodeMap.get(p.nodeId)
                return (
                  <li
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: i === 0 ? '#f59e0b' : 'var(--border-strong)',
                        color: i === 0 ? '#fff' : 'var(--text-soft)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={p.name}
                      >
                        {p.name}
                      </div>
                      <div style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                        {node?.stage ?? '—'} · {p.category}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600 }}>{fmtMoney(p.totalPrice)}</div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="col-12 card">
          <h2 className="card-title">最近采购</h2>
          {recent.length === 0 ? (
            <div className="empty">还没有采购记录，点右上"记一笔"开始</div>
          ) : (
            <div className="activity-list">
              {recent.map((p) => {
                const node = nodeMap.get(p.nodeId)
                return (
                  <div key={p.id} className="activity-item">
                    <div className="icon-wrap">🧾</div>
                    <div className="meta">
                      <div className="t">{p.name}</div>
                      <div className="s">
                        {node?.stage ?? '—'} ·{' '}
                        {p.purchaseDate ? dayjs(p.purchaseDate).format('M月D日') : '日期未填'}
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
})

function BudgetBar({ budget, spent }: { budget: number; spent: number }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0
  const over = spent > budget
  const remaining = budget - spent
  const barColor = over ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#16a34a'
  const fillPct = Math.min(pct, 100)

  return (
    <div data-testid="budget-bar">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          fontSize: 13,
          color: 'var(--text-soft)',
        }}
      >
        <span>
          已花 <strong data-testid="budget-spent" style={{ color: 'var(--text)' }}>
            {fmtMoney(spent)}
          </strong>{' '}
          / 预算 <strong style={{ color: 'var(--text)' }}>{fmtMoney(budget)}</strong>
        </span>
        <span
          data-testid="budget-pct"
          style={{ color: over ? '#ef4444' : 'var(--text-soft)', fontWeight: 600 }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          height: 14,
          width: '100%',
          background: '#e5e7eb',
          borderRadius: 7,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${fillPct}%`,
            background: barColor,
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <div
        data-testid="budget-status"
        style={{
          marginTop: 8,
          fontSize: 12,
          color: over ? '#ef4444' : 'var(--text-soft)',
          fontWeight: over ? 600 : 400,
        }}
      >
        {over
          ? `⚠️ 已超预算 ${fmtMoney(-remaining)}`
          : pct >= 80
            ? `⚠️ 接近预算上限，剩余 ${fmtMoney(remaining)}`
            : `剩余预算 ${fmtMoney(remaining)}`}
      </div>
    </div>
  )
}
