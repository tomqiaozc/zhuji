import { useEffect, useMemo, useState } from 'react'
import {
  getActiveTemplates,
  getDefaultTemplates,
  isCustomized,
  resetTemplates,
  saveCustomTemplates,
} from '@/data/userTemplates'
import { confirmDialog } from '@/lib/dialog'
import type { StageTemplate, StageTemplateNode } from '@/types'
import { Modal } from './ui/Modal'

interface Props {
  onClose: () => void
}

function cloneTemplates(t: StageTemplate[]): StageTemplate[] {
  return JSON.parse(JSON.stringify(t)) as StageTemplate[]
}

export function TemplateEditor({ onClose }: Props) {
  const [templates, setTemplates] = useState<StageTemplate[]>(() => getActiveTemplates())
  const [activeStage, setActiveStage] = useState<number>(0)
  const [activeNode, setActiveNode] = useState<number>(0)
  const [dirty, setDirty] = useState(false)
  const [customized, setCustomized] = useState<boolean>(() => isCustomized())
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    // Clamp selections when stage/node arrays shrink.
    if (activeStage >= templates.length) setActiveStage(Math.max(0, templates.length - 1))
    const cur = templates[activeStage]
    if (cur && activeNode >= cur.nodes.length) setActiveNode(Math.max(0, cur.nodes.length - 1))
  }, [templates, activeStage, activeNode])

  const stage = templates[activeStage]
  const node = stage?.nodes[activeNode]

  const stageCount = templates.length
  const totalNodes = useMemo(
    () => templates.reduce((s, t) => s + t.nodes.length, 0),
    [templates],
  )

  function mutate(fn: (draft: StageTemplate[]) => void) {
    const next = cloneTemplates(templates)
    fn(next)
    setTemplates(next)
    setDirty(true)
  }

  function handleAddStage() {
    const name = prompt('新阶段名称')
    if (!name?.trim()) return
    mutate((d) => {
      d.push({ stage: name.trim(), icon: String(d.length), nodes: [] })
    })
    setActiveStage(templates.length)
    setActiveNode(0)
  }

  async function handleRemoveStage() {
    if (!stage) return
    const ok = await confirmDialog({
      title: '删除阶段',
      message: `删除阶段「${stage.stage}」？其下所有节点也会一起删除。\n仅影响新建项目，已有项目不受影响。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.splice(activeStage, 1)
    })
    setActiveNode(0)
  }

  function handleRenameStage() {
    if (!stage) return
    const name = prompt('阶段名称', stage.stage)
    if (!name?.trim()) return
    mutate((d) => {
      d[activeStage].stage = name.trim()
    })
  }

  function handleMoveStage(delta: number) {
    const to = activeStage + delta
    if (to < 0 || to >= templates.length) return
    mutate((d) => {
      const [it] = d.splice(activeStage, 1)
      d.splice(to, 0, it)
    })
    setActiveStage(to)
  }

  function handleAddNode() {
    if (!stage) return
    const name = prompt('节点名称')
    if (!name?.trim()) return
    mutate((d) => {
      d[activeStage].nodes.push({ name: name.trim(), tips: [], checklist: [] })
    })
    setActiveNode(stage.nodes.length)
  }

  async function handleRemoveNode() {
    if (!stage || !node) return
    const ok = await confirmDialog({
      title: '删除节点',
      message: `删除节点「${node.name}」？仅影响新建项目。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d[activeStage].nodes.splice(activeNode, 1)
    })
  }

  function handleRenameNode() {
    if (!stage || !node) return
    const name = prompt('节点名称', node.name)
    if (!name?.trim()) return
    mutate((d) => {
      d[activeStage].nodes[activeNode].name = name.trim()
    })
  }

  function handleMoveNode(delta: number) {
    if (!stage) return
    const to = activeNode + delta
    if (to < 0 || to >= stage.nodes.length) return
    mutate((d) => {
      const arr = d[activeStage].nodes
      const [it] = arr.splice(activeNode, 1)
      arr.splice(to, 0, it)
    })
    setActiveNode(to)
  }

  function patchNode(patch: Partial<StageTemplateNode>) {
    mutate((d) => {
      const cur = d[activeStage].nodes[activeNode]
      Object.assign(cur, patch)
    })
  }

  function handleSave() {
    saveCustomTemplates(templates)
    setDirty(false)
    setCustomized(true)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  async function handleReset() {
    const ok = await confirmDialog({
      title: '恢复出厂模板',
      message: '恢复出厂模板？你对模板的所有修改都会丢失（已有项目的节点不会被改动）。',
      confirmLabel: '恢复',
      danger: true,
    })
    if (!ok) return
    resetTemplates()
    const def = getDefaultTemplates()
    setTemplates(def)
    setDirty(false)
    setCustomized(false)
    setActiveStage(0)
    setActiveNode(0)
  }

  return (
    <Modal
      onClose={onClose}
      testId="template-editor"
      labelledBy="template-editor-title"
      panelStyle={{ maxWidth: 980, width: '92vw', padding: 0 }}
    >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px 8px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 id="template-editor-title" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>节点模板管理</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--text-mute)' }}>
          {stageCount} 个阶段 · {totalNodes} 个节点 · 模板变更{customized ? '已保存（自定义）' : '为出厂默认'}，仅影响新建项目，已有项目节点不受影响。
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 200px 1fr',
            gap: 12,
            padding: 12,
            minHeight: 460,
            maxHeight: '72vh',
          }}
        >
          <div className="card" style={{ padding: 8, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '4px 6px' }}>阶段</div>
            {templates.map((s, i) => (
              <button
                key={i}
                className={`node-link ${i === activeStage ? 'active' : ''}`}
                onClick={() => {
                  setActiveStage(i)
                  setActiveNode(0)
                }}
                data-testid={`tpl-stage-${i}`}
              >
                <span className="stage-num">{s.icon}</span>
                <span>{s.stage}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={handleAddStage} data-testid="tpl-add-stage">
                + 阶段
              </button>
              <button className="btn btn-sm" onClick={handleRenameStage} disabled={!stage}>
                改名
              </button>
              <button className="btn btn-sm" onClick={() => handleMoveStage(-1)} disabled={!stage}>
                ↑
              </button>
              <button className="btn btn-sm" onClick={() => handleMoveStage(1)} disabled={!stage}>
                ↓
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={handleRemoveStage}
                disabled={!stage}
                data-testid="tpl-remove-stage"
              >
                删除
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 8, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '4px 6px' }}>节点</div>
            {stage?.nodes.map((n, i) => (
              <button
                key={i}
                className={`node-link ${i === activeNode ? 'active' : ''}`}
                onClick={() => setActiveNode(i)}
              >
                <span>{n.name}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={handleAddNode} disabled={!stage} data-testid="tpl-add-node">
                + 节点
              </button>
              <button className="btn btn-sm" onClick={handleRenameNode} disabled={!node}>
                改名
              </button>
              <button className="btn btn-sm" onClick={() => handleMoveNode(-1)} disabled={!node}>
                ↑
              </button>
              <button className="btn btn-sm" onClick={() => handleMoveNode(1)} disabled={!node}>
                ↓
              </button>
              <button className="btn btn-sm btn-danger" onClick={handleRemoveNode} disabled={!node}>
                删除
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, overflowY: 'auto' }}>
            {!node ? (
              <div className="empty">选择一个节点开始编辑</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  {stage?.stage} / {node.name}
                </div>
                <div className="form-row">
                  <label>避坑要点（每行一条）</label>
                  <textarea
                    className="notes-area"
                    style={{ minHeight: 160 }}
                    value={node.tips.join('\n')}
                    onChange={(e) =>
                      patchNode({
                        tips: e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      })
                    }
                    data-testid="tpl-node-tips"
                  />
                </div>
                <div className="form-row">
                  <label>Checklist（每行一条）</label>
                  <textarea
                    className="notes-area"
                    style={{ minHeight: 140 }}
                    value={node.checklist.join('\n')}
                    onChange={(e) =>
                      patchNode({
                        checklist: e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      })
                    }
                    data-testid="tpl-node-checklist"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: 12,
            alignItems: 'center',
            borderTop: '1px solid var(--border)',
          }}
        >
          {savedFlash && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ 已保存</span>}
          {dirty && !savedFlash && (
            <span style={{ fontSize: 13, color: 'var(--text-mute)' }}>有未保存修改</span>
          )}
          <button className="btn" onClick={handleReset} data-testid="tpl-reset">
            恢复出厂模板
          </button>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!dirty}
            data-testid="tpl-save"
          >
            保存模板
          </button>
        </div>
    </Modal>
  )
}
