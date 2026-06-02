import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { deletePurchase } from '@/lib/cascade'
import {
  addChecklistItem,
  patchChecklistItem,
  removeChecklistItem,
  updateNode,
} from '@/lib/repository'
import { useApp } from '@/store/app'
import { fmtMoney } from '@/lib/format'
import { useIsMobile } from '@/lib/useIsMobile'
import type { DecorNode, NodeStatus, Project } from '@/types'
import { RichTextEditor } from '@/components/RichTextEditor'
import { NodeImagesPanel } from '@/components/NodeImagesPanel'
import { NodeWorkspaceOnboarding } from '@/components/NodeWorkspaceOnboarding'
import { confirmDialog } from '@/lib/dialog'

// Lightweight dirty-exit registry. TipsPanel registers a "do we have
// unsaved tip edits?" probe; the surrounding NodeWorkspace / NodePanel
// consult it before switching tab or active node. Keeping this at module
// scope is simpler than threading a context, and there's only ever one
// editable TipsPanel mounted at a time.
let unsavedProbe: (() => boolean) | null = null

export function registerUnsavedTipsProbe(probe: (() => boolean) | null) {
  unsavedProbe = probe
}

async function confirmLoseTipsDraft(): Promise<boolean> {
  if (!unsavedProbe || !unsavedProbe()) return true
  return confirmDialog({
    title: '放弃未保存的修改？',
    message: '避坑要点编辑还没保存，离开后内容会丢失。',
    confirmLabel: '放弃',
    cancelLabel: '继续编辑',
    danger: true,
  })
}

interface Props {
  project: Project
  onAddPurchase: (nodeId: string) => void
}

type TabKey = 'tips' | 'check' | 'purchase' | 'image' | 'note'

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
  const isMobile = useIsMobile()
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!activeNodeId && nodes.length > 0) setActiveNode(nodes[0].id)
  }, [nodes, activeNodeId, setActiveNode])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapsed = useCallback(
    (stage: string) => setCollapsed((s) => ({ ...s, [stage]: !s[stage] })),
    [],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, DecorNode[]>()
    for (const n of nodes) {
      if (!map.has(n.stage)) map.set(n.stage, [])
      map.get(n.stage)!.push(n)
    }
    return [...map.entries()]
  }, [nodes])

  // Prev / next navigation across the flat node order. On mobile this is
  // sticky-pinned under the topbar so the user can move between nodes
  // without re-opening the picker sheet every time.
  const activeIdx = activeNode ? nodes.findIndex((n) => n.id === activeNode.id) : -1
  const prevNode = activeIdx > 0 ? nodes[activeIdx - 1] : null
  const nextNode = activeIdx >= 0 && activeIdx < nodes.length - 1 ? nodes[activeIdx + 1] : null

  async function gotoNode(id: string) {
    if (id === activeNode?.id) return
    if (await confirmLoseTipsDraft()) {
      setActiveNode(id)
      setPickerOpen(false)
    }
  }

  const tree = (
    <>
      {grouped.map(([stage, list], si) => {
        const isCollapsed = collapsed[stage]
        return (
          <div key={stage} className="stage-group">
            <button
              className={`stage-header ${isCollapsed ? 'collapsed' : ''}`}
              onClick={() => toggleCollapsed(stage)}
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
                  onClick={() => gotoNode(n.id)}
                >
                  <span className={`status-dot ${n.status}`} />
                  <span>{n.name}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )

  return (
    <section className="view" style={{ padding: '24px 24px' }}>
      <div className={`node-shell ${isMobile ? 'mobile' : ''}`}>
        {isMobile ? (
          <>
            {/* Sticky breadcrumb-style bar: prev / current (opens picker) / next.
                Keeps the detail pane full-width while letting the user step
                through the 62-node sequence without scrolling a stuck list. */}
            <div className="node-mobile-bar">
              <button
                className="btn btn-sm"
                onClick={() => prevNode && gotoNode(prevNode.id)}
                disabled={!prevNode}
                aria-label="上一节点"
              >
                ←
              </button>
              <button
                className="node-mobile-current"
                onClick={() => setPickerOpen(true)}
                aria-label="切换节点"
                aria-haspopup="dialog"
              >
                <span className="node-mobile-current-stage">{activeNode?.stage ?? '—'}</span>
                <span className="node-mobile-current-name">
                  {activeNode?.name ?? '选择节点'}
                </span>
                <span aria-hidden="true">▾</span>
              </button>
              <button
                className="btn btn-sm"
                onClick={() => nextNode && gotoNode(nextNode.id)}
                disabled={!nextNode}
                aria-label="下一节点"
              >
                →
              </button>
            </div>
            {pickerOpen && (
              <div
                className="node-picker-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="选择节点"
              >
                <div className="node-picker-backdrop" onClick={() => setPickerOpen(false)} />
                <div className="node-picker-panel">
                  <div className="node-picker-header">
                    <span>选择节点（{nodes.length} 个）</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => setPickerOpen(false)}
                      aria-label="关闭"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="node-picker-body node-tree">{tree}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <aside className="node-tree">{tree}</aside>
        )}

        {activeNode && (
          <NodePanel node={activeNode} project={project} onAddPurchase={onAddPurchase} />
        )}
      </div>
      <NodeWorkspaceOnboarding />
    </section>
  )
}

// Memoize so the heavy panel (live queries, tabs, charts) doesn't
// re-render when only the sidebar's `collapsed` state changes. The
// parent now passes `onAddPurchase` through unchanged, so reference
// equality holds across sidebar interactions.
const NodePanel = memo(function NodePanel({
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
    await updateNode(node.id, patch)
  }

  async function switchTab(next: TabKey) {
    if (next === tab) return
    // Leaving the tips tab while a draft is dirty: ask first.
    if (tab === 'tips' && next !== 'tips') {
      if (!(await confirmLoseTipsDraft())) return
    }
    setTab(next)
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
            onChange={(v) => updateNode(node.id, { plannedStart: v || undefined })}
          />
          <DateField
            label="计划完成"
            value={node.plannedEnd}
            onChange={(v) => updateNode(node.id, { plannedEnd: v || undefined })}
          />
          <DateField
            label="实际开始"
            value={node.actualStart}
            onChange={(v) => updateNode(node.id, { actualStart: v || undefined })}
          />
          <DateField
            label="实际完成"
            value={node.actualEnd}
            onChange={(v) => updateNode(node.id, { actualEnd: v || undefined })}
          />
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'tips' ? 'active' : ''}`}
          onClick={() => switchTab('tips')}
        >
          📌 避坑清单
          <span className="count">{node.tips.split('\n').filter((l) => l.trim()).length}</span>
        </button>
        <button
          className={`tab ${tab === 'check' ? 'active' : ''}`}
          onClick={() => switchTab('check')}
        >
          ✅ Checklist
          <span className="count">
            {checkDone}/{checkTotal}
          </span>
        </button>
        <button
          className={`tab ${tab === 'purchase' ? 'active' : ''}`}
          onClick={() => switchTab('purchase')}
        >
          🧾 采购<span className="count">{purchases.length}</span>
        </button>
        <button
          className={`tab ${tab === 'image' ? 'active' : ''}`}
          onClick={() => switchTab('image')}
        >
          🖼️ 图片
        </button>
        <button
          className={`tab ${tab === 'note' ? 'active' : ''}`}
          onClick={() => switchTab('note')}
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
                      <td>{p.purchaseDate ? dayjs(p.purchaseDate).format('M/D') : '—'}</td>
                      <td className="price-cell">{fmtMoney(p.totalPrice)}</td>
                      <td>
                        <button
                          className="icon-btn"
                          title="删除"
                          aria-label="删除"
                          onClick={() => void deletePurchase(p.id)}
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
          <RichTextEditor
            value={node.notes}
            onChange={(html) => updateNode(node.id, { notes: html })}
            placeholder="记录这个节点的备注、现场沟通要点、师傅联系方式…"
          />
        </div>
      )}
      {tab === 'image' && (
        <div className="tab-panel">
          <NodeImagesPanel node={node} />
        </div>
      )}
    </div>
  )
})

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

  // Keep refs so the registered probe always reads current state, not the
  // closure captured at register time.
  const editingRef = useRef(editing)
  const draftRef = useRef(draft)
  const nodeTipsRef = useRef(node.tips)
  editingRef.current = editing
  draftRef.current = draft
  nodeTipsRef.current = node.tips

  useEffect(() => {
    registerUnsavedTipsProbe(() => editingRef.current && draftRef.current !== nodeTipsRef.current)
    return () => registerUnsavedTipsProbe(null)
  }, [])

  const lines = node.tips
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)

  async function cancelEdit() {
    if (draft !== node.tips) {
      const ok = await confirmDialog({
        title: '放弃未保存的修改？',
        message: '取消后未保存的内容会丢失。',
        confirmLabel: '放弃',
        cancelLabel: '继续编辑',
        danger: true,
      })
      if (!ok) return
      setDraft(node.tips)
    }
    setEditing(false)
  }

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
                await updateNode(node.id, { tips: draft, tipsModified: true })
                setEditing(false)
              }}
            >
              保存
            </button>
            <button className="btn btn-sm" onClick={cancelEdit}>
              取消
            </button>
            {draft !== node.tips && (
              <span style={{ fontSize: 12, color: 'var(--text-mute)', alignSelf: 'center' }}>
                有未保存修改
              </span>
            )}
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
    const item = node.checklist.find((c) => c.id === id)
    if (!item) return
    await patchChecklistItem(node.id, id, { done: !item.done })
  }

  async function remove(id: string) {
    await removeChecklistItem(node.id, id)
  }

  async function add() {
    const t = newText.trim()
    if (!t) return
    await addChecklistItem(node.id, { text: t, done: false })
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
              }}
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
