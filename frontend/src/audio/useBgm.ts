import { useEffect } from 'react';
import { bgm, type BgmScene } from './bgm';

/**
 * 场景 BGM Hook：组件挂载时播放对应场景背景音乐，卸载时停止。
 * 场景切换（如 StartScreen 内 playing 变化）会自动 stop → playScene 新场景。
 */
export function useBgm(scene: BgmScene) {
  useEffect(() => {
    bgm.playScene(scene);
    return () => {
      bgm.stop();
    };
  }, [scene]);
}
