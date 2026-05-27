import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { useApp } from '@/store/app'
import { fmtMoney } from '@/lib/format'
import { uid } from '@/lib/uid'
import type { DecorNode, NodeStatus, Project } from '@/types'

interface Props {
  project: Project
  onAddPurchase: (nodeId: string) => void
}

type TabKey = 'tips' | 'check' | 'purchase' | 'note'

const STATUS_LABEL: Record<NodeStatus, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
  skipped: '已跳过',
}

export function NodeWorkspace({ project, onAddPurchase }: Props) {
  const { activeNodeId, setActiveNode } = useApp()
  const nodes =
    useLiveQuery(
      () => db.nodes.where('projectId').equals(project.id).sortBy('order'),
      [project.id],
    ) ?? []

  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? nodes[0] ?? null

  useEffect(() => {
    if (!activeNodeId && nodes.length > 0) setActiveNode(nodes[0].id)
  }, [nodes, activeNodeId, setActiveNode])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const map = new Map<string, DecorNode[]>()
    for (const n of nodes) {
      if (!map.has(n.stage)) map.set(n.stage, [])
      map.get(n.stage)!.push(n)
    }
    return [...map.entries()]
  }, [nodes])

  return (
    <section className="view" style={{ padding: '24px 24px' }}>
      <div className="node-shell">
        <aside className="node-tree">
          {grouped.map(([stage, list], si) => {
            const isCollapsed = collapsed[stage]
            return (
              <div key={stage} className="stage-group">
                <button
                  className={`stage-header ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => setCollapsed((s) => ({ ...s, [stage]: !s[stage] }))}
                >
                  <span className="caret">▾</span>
                  <span className="stage-num">{si}</span>
                  <span>{stage}</span>
                </button>
                <div className={`stage-nodes ${isCollapsed ? 'hidden' : ''}`}>
                  {list.map((n) => (
                    <button
                      key={n.id}
                      className={`node-link ${activeNode?.id === n.id ? 'active' : ''}`}
                      onClick={() => setActiveNode(n.id)}
                    >
                      <span className={`status-dot ${n.status}`} />
                      <span>{n.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </aside>

        {activeNode && <NodePanel node={activeNode} project={project} onAddPurchase={onAddPurchase} />}
      </div>
    </section>
  )
}

function NodePanel({
  node,
  project,
  onAddPurchase,
}: {
  node: DecorNode
  project: Project
  onAddPurchase: (nodeId: string) => void
}) {
  void project
  const [tab, setTab] = useState<TabKey>('tips')
  const purchases =
    useLiveQuery(
      () => db.purchases.where('nodeId').equals(node.id).reverse().sortBy('purchaseDate'),
      [node.id],
    ) ?? []

  const purchaseTotal = purchases.reduce((s, p) => s + p.totalPrice, 0)
  const checkDone = node.checklist.filter((c) => c.done).length
  const checkTotal = node.checklist.length

  async function setStatus(status: NodeStatus) {
    const patch: Partial<DecorNode> = { status }
    const now = dayjs().format('YYYY-MM-DD')
    if (status === 'doing' && !node.actualStart) patch.actualStart = now
    if (status === 'done' && !node.actualEnd) patch.actualEnd = now
    await db.nodes.update(node.id, patch)
  }

  return (
    <div className="node-panel">
      <div className="node-header">
        <div className="node-breadcrumb">
          {node.stage} / {node.name}
        </div>
        <div className="node-name">
          {node.name}
          <span className={`status-badge ${node.status}`}>{STATUS_LABEL[node.status]}</span>
          <select
            value={node.status}
            onChange={(e) => setStatus(e.target.value as NodeStatus)}
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--panel)',
            }}
            aria-label="节点状态"
          >
            <option value="todo">未开始</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
            <option value="skipped">已跳过</option>
          </select>
        </div>
        <div className="node-meta">
          <DateField
            label="计划开始"
            value={node.plannedStart}
            onChange={(v) => db.nodes.update(node.id, { plannedStart: v || undefined })}
          />
          <DateField
            label="计划完成"
            value={node.plannedEnd}
            onChange={(v) => db.nodes.update(node.id, { plannedEnd: v || undefined })}
          />
          <DateField
            label="实际开始"
            value={node.actualStart}
            onChange={(v) => db.nodes.update(node.id, { actualStart: v || undefined })}
          />
          <DateField
            label="实际完成"
            value={node.actualEnd}
            onChange={(v) => db.nodes.update(node.id, { actualEnd: v || undefined })}
          />
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'tips' ? 'active' : ''}`}
          onClick={() => setTab('tips')}
        >
          📌 避坑清单
          <span className="count">{node.tips.split('\n').filter((l) => l.trim()).length}</span>
        </button>
        <button
          className={`tab ${tab === 'check' ? 'active' : ''}`}
          onClick={() => setTab('check')}
        >
          ✅ Checklist
          <span className="count">
            {checkDone}/{checkTotal}
          </span>
        </button>
        <button
          className={`tab ${tab === 'purchase' ? 'active' : ''}`}
          onClick={() => setTab('purchase')}
        >
          🧾 采购<span className="count">{purchases.length}</span>
        </button>
        <button
          className={`tab ${tab === 'note' ? 'active' : ''}`}
          onClick={() => setTab('note')}
        >
          📝 备注
        </button>
      </div>

      {tab === 'tips' && <TipsPanel node={node} />}
      {tab === 'check' && <ChecklistPanel node={node} />}
      {tab === 'purchase' && (
        <div className="tab-panel">
          <div className="purchase-toolbar">
            <div className="purchase-total">
              本节点合计 <strong>{fmtMoney(purchaseTotal)}</strong>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => onAddPurchase(node.id)}>
              + 加一笔
            </button>
          </div>
          {purchases.length === 0 ? (
            <div className="empty">该节点还没有采购</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>品类</th>
                    <th>渠道</th>
                    <th>日期</th>
                    <th style={{ textAlign: 'right' }}>金额</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
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
                        <span className="tag">{p.category}</span>
                      </td>
                      <td>{p.channel ?? '—'}</td>
                      <td>{dayjs(p.purchaseDate).format('M/D')}</td>
                      <td className="price-cell">{fmtMoney(p.totalPrice)}</td>
                      <td>
                        <button
                          className="icon-btn"
                          title="删除"
                          aria-label="删除"
                          onClick={() => db.purchases.delete(p.id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'note' && (
        <div className="tab-panel">
          <textarea
            className="notes-area"
            placeholder="记录这个节点的备注、现场沟通要点、师傅联系方式…"
            value={node.notes}
            onChange={(e) => db.nodes.update(node.id, { notes: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
}) {
  return (
    <div className="item">
      {label}：
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '2px 6px',
          border: '1px solid var(--border)',
          borderRadius: 4,
          fontSize: 12,
          marginLeft: 4,
        }}
      />
    </div>
  )
}

function TipsPanel({ node }: { node: DecorNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.tips)
  useEffect(() => setDraft(node.tips), [node.tips])

  const lines = node.tips
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)

  return (
    <div className="tab-panel">
      {editing ? (
        <>
          <textarea
            className="notes-area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="每行一条，以 - 开头"
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                await db.nodes.update(node.id, { tips: draft, tipsModified: true })
                setEditing(false)
              }}
            >
              保存
            </button>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="tip-section-title">⚠️ 避坑要点</div>
          {lines.length === 0 ? (
            <div className="empty">还没有内容</div>
          ) : (
            <div className="tips-list">
              {lines.map((l, i) => (
                <div key={i} className="tip-item">
                  <span className="icon">💡</span>
                  <div>{l}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              ✎ 编辑
            </button>
            {node.tipsModified && (
              <span style={{ fontSize: 12, color: 'var(--text-mute)', alignSelf: 'center' }}>
                已自定义
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ChecklistPanel({ node }: { node: DecorNode }) {
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')

  const done = node.checklist.filter((c) => c.done).length
  const total = node.checklist.length
  const pct = total > 0 ? (done / total) * 100 : 0

  async function toggle(id: string) {
    const items = node.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c))
    await db.nodes.update(node.id, { checklist: items })
  }

  async function remove(id: string) {
    const items = node.checklist.filter((c) => c.id !== id)
    await db.nodes.update(node.id, { checklist: items })
  }

  async function add() {
    const t = newText.trim()
    if (!t) return
    const items = [...node.checklist, { id: uid('chk'), text: t, done: false }]
    await db.nodes.update(node.id, { checklist: items })
    setNewText('')
    setAdding(false)
  }

  return (
    <div className="tab-panel">
      <div className="check-progress">
        <span>进度</span>
        <div className="bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <span>
          <strong style={{ color: 'var(--text)' }}>
            {done}/{total}
          </strong>
        </span>
      </div>
      <div className="check-list">
        {node.checklist.map((c) => (
          <label key={c.id} className={`check-item ${c.done ? 'done' : ''}`}>
            <input type="checkbox" checked={c.done} onChange={() => toggle(c.id)} />
            <span className="text">{c.text}</span>
            <button
              className="icon-btn"
              onClick={(e) => {
                e.preventDefault()
                remove(c.id)
              }}
              title="删除"
              aria-label="删除"
            >
              ✕
            </button>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {adding ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newText}
              autoFocus
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="新增一项"
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={add}>
              添加
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setAdding(false)
                setNewText('')
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            + 添加一项
          </button>
        )}
      </div>
    </div>
  )
}
