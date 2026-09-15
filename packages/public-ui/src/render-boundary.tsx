import { Component, type ErrorInfo, type ReactNode } from 'react'

type RenderBoundaryProps = {
  /** 出错时显示的来源，通常是插件 id 或缝名，方便一眼看出是谁崩的。 */
  label?: string
  /** 自定义降级内容。不传就用内置的一行提示加重试按钮。 */
  fallback?: (error: Error, retry: () => void) => ReactNode
  children: ReactNode
}

type RenderBoundaryState = { error: Error | null }

/**
 * 把一段子树的渲染错误就地圈住。
 *
 * React 的规则是组件在 render 阶段抛错且无人接住，就卸载整棵树。没有这层保护时，
 * 任意一个插件读到 undefined.foo 或把变量顺序写反（`useEffect` 的依赖数组是渲染时
 * 同步求值的，很容易踩到 TDZ），整个应用就是一片空白，只能翻 console 猜是谁。
 *
 * 注意只拦得住渲染同步路径。事件处理器、effect 回调体、异步代码里的错误不会走到
 * 这里，那些本来也不会导致卸载。
 */
export class RenderBoundary extends Component<RenderBoundaryProps, RenderBoundaryState> {
  state: RenderBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RenderBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[render-boundary] ${this.props.label ?? '未知来源'} 渲染失败`, error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.retry)
    return (
      <div
        role="alert"
        data-testid="render-boundary-fallback"
        data-render-boundary-label={this.props.label || undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          boxSizing: 'border-box',
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--dsw-border)',
          borderRadius: 8,
          background: 'var(--dsw-danger-soft)',
          color: 'var(--dsw-label)',
          font: 'inherit',
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 650 }}>{this.props.label || '这块内容'}</span>
        <span style={{ color: 'var(--dsw-label-2)', minWidth: 0, overflowWrap: 'anywhere' }}>
          渲染失败：{error.message || String(error)}
        </span>
        <button
          type="button"
          onClick={this.retry}
          style={{
            marginLeft: 'auto',
            flex: 'none',
            border: '1px solid var(--dsw-border)',
            borderRadius: 6,
            padding: '2px 8px',
            background: 'transparent',
            color: 'var(--dsw-label)',
            font: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          重试
        </button>
      </div>
    )
  }
}
