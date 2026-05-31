import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Last-resort UI for crashes inside the React tree. We surface a recovery
// affordance instead of leaving a blank page.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          padding: 24,
          maxWidth: 560,
          margin: '40px auto',
          background: 'var(--panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
        }}
      >
        <h2 style={{ marginTop: 0 }}>页面崩了 :(</h2>
        <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>
          抱歉，发生了一个未预期的错误。你的数据保存在本地，不会丢失。
        </p>
        <pre
          style={{
            background: '#f3f4f6',
            padding: 10,
            fontSize: 11,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 160,
          }}
        >
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={this.reset}>
            重新尝试
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
