import { Modal } from './ui/Modal'

interface Props {
  onClose: () => void
}

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['⌘', 'K'], desc: '全局搜索（节点 / 采购 / 提醒）' },
  { keys: ['⌘', 'N'], desc: '记一笔采购' },
  { keys: ['Esc'], desc: '关闭当前弹窗 / 抽屉 / 灯箱' },
  { keys: ['←', '→'], desc: '灯箱模式下切换上一张 / 下一张图片' },
  { keys: ['+', '−'], desc: '灯箱模式下放大 / 缩小' },
  { keys: ['0'], desc: '灯箱模式下重置缩放' },
  { keys: ['?'], desc: '打开此快捷键帮助' },
]

export function KeyboardHelp({ onClose }: Props) {
  return (
    <Modal
      onClose={onClose}
      testId="keyboard-help"
      zIndex={250}
      labelledBy="keyboard-help-title"
      panelStyle={{ maxWidth: 460 }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="keyboard-help-title" style={{ margin: 0, fontSize: 16 }}>
            键盘快捷键
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭" data-autofocus>
            ✕
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {SHORTCUTS.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 0', width: 140 }}>
                  {s.keys.map((k, j) => (
                    <span key={j}>
                      {j > 0 && <span style={{ margin: '0 4px' }}>+</span>}
                      <kbd
                        style={{
                          padding: '2px 8px',
                          background: '#f3f4f6',
                          border: '1px solid var(--border-strong)',
                          borderBottom: '2px solid var(--border-strong)',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'inherit',
                        }}
                      >
                        {k}
                      </kbd>
                    </span>
                  ))}
                </td>
                <td style={{ padding: '8px 0', color: 'var(--text-soft)' }}>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
