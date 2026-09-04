import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

/**
 * 全局错误边界：捕获第三方插件注入脚本、渲染异常等导致的崩溃，
 * 避免单个错误让整个应用白屏。展示可恢复的降级界面。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMsg: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      errorMsg: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // 生产环境不上报详细信息到控制台（避免暴露内部结构），仅本地记录
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMsg: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a1a',
          color: '#e8e8f0',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>游戏出现了点问题</h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 20, maxWidth: 420 }}>
          页面发生了意外错误（可能由浏览器插件引起）。点击下方按钮刷新恢复，若反复出现请尝试关闭部分浏览器插件。
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: '10px 28px',
            fontSize: 15,
            borderRadius: 8,
            border: '1px solid #7c6cf0',
            background: 'transparent',
            color: '#c9c2ff',
            cursor: 'pointer',
          }}
        >
          刷新页面
        </button>
        {import.meta.env.DEV && this.state.errorMsg ? (
          <pre style={{ marginTop: 16, fontSize: 12, opacity: 0.5, maxWidth: 480, overflow: 'auto' }}>
            {this.state.errorMsg}
          </pre>
        ) : null}
      </div>
    );
  }
}
