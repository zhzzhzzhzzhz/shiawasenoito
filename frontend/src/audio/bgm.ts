/**
 * BGM 管理器（单例）——场景化背景音乐，Electron file:// 本地加载。
 *
 * 场景池约定（素材放 frontend/public/audio/，缺失时静默跳过不影响游戏）：
 * - splash: splash_1.ogg, splash_2.ogg（开屏待机，循环随机抽取）
 * - enter:   enter_1.ogg（进入动画，固定一首无缝循环直到界面切换）
 * - menu:    menu_1~3.ogg（主菜单，循环随机抽取）
 * - game:    game_1.ogg, game_2.ogg（对局，循环随机抽取）
 *
 * 使用 HTMLAudioElement（file:// 下无 CORS 限制），所有曲目启动即预加载；
 * 同场景重复调用不重启；跨场景切换淡出旧曲、淡入新曲；曲目播完自动抽取下一首（不与上一首重复）。
 */

export type BgmScene = 'splash' | 'enter' | 'menu' | 'game';

const POOLS: Record<BgmScene, string[]> = {
  splash: ['audio/splash_1.ogg', 'audio/splash_2.ogg'],
  enter: ['audio/enter_1.ogg'],
  menu: ['audio/menu_1.ogg', 'audio/menu_2.ogg', 'audio/menu_3.ogg'],
  game: ['audio/game_1.ogg', 'audio/game_2.ogg'],
};

const BASE = import.meta.env.BASE_URL;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 150;
const FADE_TICK = 20;

class BgmManager {
  private tracks = new Map<string, HTMLAudioElement>();
  private currentScene: BgmScene | null = null;
  private currentKey: string | null = null;
  private volume = 0.5;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  private getTrack(key: string): HTMLAudioElement | null {
    const url = BASE + key;
    let a = this.tracks.get(url);
    if (!a) {
      a = new Audio(url);
      a.preload = 'auto';
      a.loop = false;
      a.volume = 0;
      this.tracks.set(url, a);
    }
    return a;
  }

  private stopFade() {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** 切换场景：同场景不重启；跨场景淡出旧曲后开始新池 */
  playScene(scene: BgmScene) {
    if (this.currentScene === scene && this.currentKey) return; // 已在播
    this.stopFade();
    if (this.currentKey) {
      const cur = this.tracks.get(BASE + this.currentKey);
      if (cur) this.fadeOut(cur);
    }
    this.currentScene = scene;
    this.currentKey = null;
    this.playNext(scene);
  }

  private pickNext(scene: BgmScene, excludeKey: string | null): string | null {
    const pool = POOLS[scene];
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    const options = pool.filter((k) => k !== excludeKey);
    return options[Math.floor(Math.random() * options.length)];
  }

  private playNext(scene: BgmScene) {
    if (this.currentScene !== scene) return;
    const key = this.pickNext(scene, this.currentKey);
    if (!key) {
      this.currentKey = null;
      return;
    }
    this.currentKey = key;
    const a = this.getTrack(key);
    if (!a) return;

    // 进入动画固定一首：无缝循环直到界面切换；其余场景播完抽下一首
    a.loop = scene === 'enter' && POOLS[scene].length === 1;

    a.onended = () => {
      if (this.currentScene === scene && this.currentKey === key) this.playNext(scene);
    };
    a.onerror = () => {
      // 素材缺失：静默抽下一首，池空则静音运行
      if (this.currentScene === scene && this.currentKey === key) this.playNext(scene);
    };
    a.currentTime = 0;
    this.fadeIn(a);
    a.play().catch(() => { /* 自动播放受限时静默 */ });
  }

  private fadeIn(a: HTMLAudioElement) {
    a.volume = 0;
    const target = this.volume;
    const step = target / (FADE_IN_MS / FADE_TICK);
    this.stopFade();
    this.fadeTimer = setInterval(() => {
      a.volume = Math.min(target, a.volume + step);
      if (a.volume >= target) this.stopFade();
    }, FADE_TICK);
  }

  private fadeOut(a: HTMLAudioElement) {
    const start = a.volume;
    if (start <= 0) {
      a.pause();
      a.currentTime = 0;
      return;
    }
    const step = start / (FADE_OUT_MS / FADE_TICK);
    const timer = setInterval(() => {
      a.volume = Math.max(0, a.volume - step);
      if (a.volume <= 0) {
        clearInterval(timer);
        a.pause();
        a.currentTime = 0;
      }
    }, FADE_TICK);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    const cur = this.currentKey ? this.tracks.get(BASE + this.currentKey) : null;
    if (cur && !cur.paused) cur.volume = this.volume;
  }

  stop() {
    this.currentScene = null;
    this.stopFade();
    if (this.currentKey) {
      const cur = this.tracks.get(BASE + this.currentKey);
      if (cur) this.fadeOut(cur);
      this.currentKey = null;
    }
  }
}

export const bgm = new BgmManager();
