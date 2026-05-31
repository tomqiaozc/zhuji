import { useEffect, useState } from 'react'

const LS_KEY = 'zhuji-onboarded-node-workspace-v1'

interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: '阶段 / 节点',
    body:
      '左侧按阶段（前期 → 设计 → 主体 → 水电 → 防水 → 瓦工 → 木工 → 油工 → 安装 → 软装家电 → 收尾）罗列了 60 多个节点。点击节点进入它的工作台。',
  },
  {
    title: '5 个 Tab',
    body:
      '每个节点都有 5 个 Tab：避坑要点、Checklist、采购记录、现场照片、施工笔记。所有的修改都自动保存到本地。',
  },
  {
    title: '改状态拖时间',
    body:
      '右上角可以切换状态（未开始 / 进行中 / 已完成 / 已跳过）。在「时间线」视图里还能直接拖拽节点条调整计划日期。',
  },
  {
    title: '快捷键',
    body:
      '⌘K 全局搜索；⌘N 新建采购；Esc 关闭弹窗。在「设置 → 节点模板管理」可以编辑默认节点模板。',
  },
]

export function NodeWorkspaceOnboarding() {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_KEY)) setOpen(true)
    } catch {
      // localStorage blocked — show once per session is fine
      setOpen(true)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(LS_KEY, '1')
    } catch {
      // ignore
    }
    setOpen(false)
  }

  if (!open) return null

  const isLast = step === STEPS.length - 1
  const cur = STEPS[step]

  return (
    <div
      className="modal-bg"
      data-testid="node-onboarding"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
      style={{ zIndex: 250 }}
    >
      <div className="modal" style={{ maxWidth: 460 }}>
        <div style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 16,
              justifyContent: 'center',
            }}
          >
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 24 : 8,
                  height: 4,
                  borderRadius: 2,
                  background: i === step ? 'var(--primary)' : 'var(--border-strong)',
                  transition: 'width 0.2s',
                }}
              />
            ))}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
            {step + 1}. {cur.title}
          </h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            {cur.body}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: '#fafafa',
          }}
        >
          <button className="btn btn-sm" onClick={dismiss} data-testid="onboarding-skip">
            跳过
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-sm" onClick={() => setStep((s) => s - 1)}>
                上一步
              </button>
            )}
            {!isLast ? (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setStep((s) => s + 1)}
                data-testid="onboarding-next"
              >
                下一步
              </button>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={dismiss}
                data-testid="onboarding-done"
              >
                开始使用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
