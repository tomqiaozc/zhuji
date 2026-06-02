interface Props {
  onCreateProject: () => void
  onLoadDemo: () => void | Promise<void>
  demoBusy?: boolean
}

// Centered welcome card for the "no project yet" state.
export function EmptyHero({ onCreateProject, onLoadDemo, demoBusy }: Props) {
  return (
    <div className="view" data-testid="empty-hero">
      <div
        style={{
          maxWidth: 520,
          margin: '60px auto',
          padding: 32,
          background: 'var(--panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏠</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>欢迎使用 筑迹</h2>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          单人业主的装修管家：节点进度、采购流水、阶段花费、提醒、PDF 档案，云端同步、多设备共享。
          <br />
          从一个新项目开始，或加载一个示例项目体验。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onCreateProject} data-testid="empty-hero-create">
            + 新建项目
          </button>
          <button
            className="btn"
            onClick={() => void onLoadDemo()}
            disabled={demoBusy}
            data-testid="empty-hero-demo"
          >
            {demoBusy ? '加载中…' : '加载示例项目'}
          </button>
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-mute)' }}>
          数据存于云端（你的账号专属），登录后多设备共享同一份记录
        </div>
      </div>
    </div>
  )
}
