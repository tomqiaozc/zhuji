interface Props {
  onCreateProject: () => void
  onLoadDemo: () => void | Promise<void>
  demoBusy?: boolean
}

// Centered welcome card for the "no project yet" state.
export function EmptyHero({ onCreateProject, onLoadDemo, demoBusy }: Props) {
  return (
    <div className="view" data-testid="empty-hero">
      <div className="empty-hero-card">
        <div className="empty-hero-emoji" aria-hidden="true">
          🏠
        </div>
        <h2 className="empty-hero-title">欢迎使用 筑迹</h2>
        <p className="empty-hero-lede">
          单人业主的装修管家：节点进度、采购流水、阶段花费、提醒、PDF 档案，云端同步、多设备共享。
          <br />
          从一个新项目开始，或加载一个示例项目体验。
        </p>
        <div className="empty-hero-actions">
          <button
            className="btn btn-primary"
            onClick={onCreateProject}
            data-testid="empty-hero-create"
          >
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
        <div className="empty-hero-foot">
          数据存于云端（你的账号专属），登录后多设备共享同一份记录
        </div>
      </div>
    </div>
  )
}
