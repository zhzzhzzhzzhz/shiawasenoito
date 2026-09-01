import { useState, useEffect } from 'react';

export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) {
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
      {isFullscreen ? '⛶' : '⛶'}
    </button>
  );
}
