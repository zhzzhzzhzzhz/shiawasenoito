import { useState, useEffect } from 'react';

// 桌面客户端（preload 注入 windowControls）：控制原生全屏，状态由主进程推送
// 网页版（无 windowControls）：回退 HTML5 全屏
type WindowControls = {
  toggleFullscreen?: () => Promise<boolean>;
  onFullscreenChanged?: (cb: (v: boolean) => void) => () => void;
  quitGame?: () => void;
};

const wc: WindowControls | undefined = (window as unknown as { windowControls?: WindowControls }).windowControls;

export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // 网页版：HTML5 全屏状态
    if (!wc?.onFullscreenChanged) {
      const handler = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', handler);
      return () => document.removeEventListener('fullscreenchange', handler);
    }
    // 桌面版：订阅主进程推送的原生全屏状态
    return wc.onFullscreenChanged(setIsFullscreen);
  }, []);

  const toggle = () => {
    if (wc?.toggleFullscreen) {
      void wc.toggleFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <button
      onClick={toggle}
      className="absolute top-3 right-3 z-20 p-1.5 rounded-lg text-sm opacity-50 hover:opacity-100 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-dim)' }}
      title={isFullscreen ? '退出全屏 (Esc)' : '全屏'}
    >
      ⛶
    </button>
  );
}
