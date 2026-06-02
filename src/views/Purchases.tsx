import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { deletePurchase } from '@/lib/cascade'
import { fmtMoney } from '@/lib/format'
import { useApp } from '@/store/app'
import type { Project, Purchase } from '@/types'
import { PurchaseDrawer } from '@/components/PurchaseDrawer'
import { confirmDialog } from '@/lib/dialog'

interface Props {
  project: Project
  onAddPurchase: () => void
}

export function Purchases({ project, onAddPurchase }: Props) {
  const nodes =
    useLiveQuery(
      () => db.nodes.where('projectId').equals(project.id).sortBy('order'),
      [project.id],
    ) ?? []
  const purchases =
    useLiveQuery(
      () => db.purchases.where('projectId').equals(project.id).toArray(),
      [project.id],
    ) ?? []

  const [nodeFilter, setNodeFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Purchase | null>(null)

  // Sync external "jump to stage" requests from Dashboard.
  const externalStageFilter = useApp((s) => s.purchaseStageFilter)
  const setExternalStageFilter = useApp((s) => s.setPurchaseStageFilter)
  useEffect(() => {
    if (externalStageFilter) {
      setStageFilter(externalStageFilter)
      setNodeFilter('all')
      setExternalStageFilter(null)
    }
  }, [externalStageFilter, setExternalStageFilter])

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const stages = useMemo(() => [...new Set(nodes.map((n) => n.stage))], [nodes])
  const categories = useMemo(
    () => [...new Set(purchases.map((p) => p.category))],
    [purchases],
  )

  const filtered = useMemo(() => {
    return purchases
      .filter((p) => {
        if (nodeFilter !== 'all' && p.nodeId !== nodeFilter) return false
        const node = nodeMap.get(p.nodeId)
        if (stageFilter !== 'all' && node?.stage !== stageFilter) return false
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
        if (search.trim()) {
          const q = search.toLowerCase()
          const hay = `${p.name} ${p.brand ?? ''} ${p.channel ?? ''} ${p.spec ?? ''} ${p.remark ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => ((a.purchaseDate ?? '') < (b.purchaseDate ?? '') ? 1 : -1))
  }, [purchases, nodeFilter, stageFilter, categoryFilter, search, nodeMap])

  const total = filtered.reduce((s, p) => s + p.totalPrice, 0)

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const rows = filtered.map((p) => {
      const node = nodeMap.get(p.nodeId)
      return {
        日期: p.purchaseDate ?? '',
        阶段: node?.stage ?? '',
        节点: node?.name ?? '',
        商品: p.name,
        品牌: p.brand ?? '',
        规格: p.spec ?? '',
        品类: p.category,
        渠道: p.channel ?? '',
        单价: p.unitPrice,
        数量: p.quantity,
        金额: p.totalPrice,
        购买链接: p.purchaseUrl ?? '',
        备注: p.remark ?? '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '采购流水')
    const filename = `筑迹-${project.name}-采购流水-${dayjs().format('YYYYMMDD')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">采购流水</h1>
          <div className="view-subtitle">全项目所有采购记录</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportExcel} disabled={filtered.length === 0}>
            📥 导出 Excel
          </button>
          <button className="btn btn-primary" onClick={onAddPurchase}>
            + 记一笔
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value)
              setNodeFilter('all')
            }}
            style={selectStyle}
          >
            <option value="all">全部阶段</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">全部节点</option>
            {nodes
              .filter((n) => stageFilter === 'all' || n.stage === stageFilter)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.stage} / {n.name}
                </option>
              ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">全部品类</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索商品/品牌/渠道"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              flex: 1,
              minWidth: 180,
            }}
          />
          <div className="purchase-total" style={{ marginLeft: 'auto' }}>
            筛选结果 <strong>{fmtMoney(total)}</strong>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty">没有匹配的记录</div>
        ) : (
          <table className="purchase-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>节点</th>
                <th>品类</th>
                <th>渠道</th>
                <th>日期</th>
                <th style={{ textAlign: 'right' }}>金额</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const node = nodeMap.get(p.nodeId)
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="item-name">
                        {p.purchaseUrl ? (
                          <a href={p.purchaseUrl} target="_blank" rel="noreferrer">
                            {p.name}
                          </a>
                        ) : (
                          p.name
                        )}
                      </div>
                      <div className="item-spec">
                        {[p.brand, p.spec].filter(Boolean).join(' · ')}
                        {p.quantity > 1 ? ` × ${p.quantity}` : ''}
                      </div>
                    </td>
                    <td>
                      {node?.stage}
                      {node ? ` / ${node.name}` : ''}
                    </td>
                    <td>
                      <span className="tag">{p.category}</span>
                    </td>
                    <td>{p.channel ?? '—'}</td>
                    <td>{p.purchaseDate ? dayjs(p.purchaseDate).format('M/D') : '—'}</td>
                    <td className="price-cell">{fmtMoney(p.totalPrice)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="icon-btn"
                        title="编辑"
                        aria-label="编辑"
                        onClick={() => setEditing(p)}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-btn"
                        title="删除"
                        aria-label="删除"
                        onClick={() => {
                          void (async () => {
                            const ok = await confirmDialog({
                              message: '删除这笔采购？',
                              confirmLabel: '删除',
                              danger: true,
                            })
                            if (ok) await deletePurchase(p.id)
                          })()
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PurchaseDrawer
          project={project}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--panel)',
  fontSize: 13,
}
