import { useState } from 'react';

/**
 * 模式选择页背景：循环视频 + 灰化降亮降饱和 + 边缘羽化暗角。
 * 用于单机/联机选择页，突出前景的模式选择 UI。
 * 视频缺失时静默回退（不渲染视频，仅保留羽化遮罩）。
 */

const MENU_BG_VIDEO = '/placeholder-videos/menu_bg.mp4';

export default function ModeSelectBackground() {
  const [ready, setReady] = useState(true);

  return (
    <>
      {ready && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'grayscale(0.85) brightness(0.6) saturate(0.6)' }}
          src={MENU_BG_VIDEO}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setReady(false)}
        />
      )}
      {/* 边缘羽化暗角 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10, 10, 26, 0.6) 100%)',
        }}
      />
    </>
  );
}
