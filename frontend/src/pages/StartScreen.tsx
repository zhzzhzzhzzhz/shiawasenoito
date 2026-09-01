import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import FullscreenButton from '../components/FullscreenButton';
import TitleThreads from '../components/TitleThreads';

const particles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  size: Math.random() * 4 + 2,
  x: Math.random() * 100,
  delay: Math.random() * 5,
  duration: Math.random() * 10 + 15,
  opacity: Math.random() * 0.3 + 0.1,
}));

const floatingLines = Array.from({ length: 3 }, (_, i) => ({
  id: i,
  top: 20 + i * 30 + Math.random() * 10,
  delay: i * 0.8,
  duration: 8 + i * 4,
}));

// 开屏视频路径（后续补充视频后替换，无需改代码）
const SPLASH_MAIN = '/placeholder-videos/splash_main.mp4';       // 开屏主视频（80%）
const SPLASH_EXTRA_1 = '/placeholder-videos/splash_extra_1.mp4'; // 开屏穿插视频 1（10%）
const SPLASH_EXTRA_2 = '/placeholder-videos/splash_extra_2.mp4'; // 开屏穿插视频 2（10%）
const INTRO_VIDEO = '/placeholder-videos/intro.mp4'; // 点击后播放一次，播完进入模式选择

// 视频缺失时的兜底等待时间（秒）
const FALLBACK_WAIT = 3;

export default function StartScreen() {
  const navigate = useNavigate();
  const user = useGameStore((s) => s.user);
  const setUser = useGameStore((s) => s.setUser);
  const reset = useGameStore((s) => s.reset);
  const reduceMotion = useReducedMotion();

  // playing: false=待点击(循环背景视频) | true=点击后播放过渡视频
  const [playing, setPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(true); // 主视频是否可用（缺失时回退粒子动画）
  const [currentVideo, setCurrentVideo] = useState(SPLASH_MAIN); // 当前播放的开屏视频
  const [playToken, setPlayToken] = useState(0); // 递增触发视频重挂载重播
  const [introFailed, setIntroFailed] = useState(false); // 过渡视频是否缺失
  const navigateRef = useRef(navigate);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introRef = useRef<HTMLVideoElement>(null);

  // 页面卸载清理定时器
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // 切换/重播开屏视频：更新 currentVideo 并递增 token 强制重挂载
  const playSplash = (src: string) => {
    setCurrentVideo(src);
    setPlayToken((t) => t + 1);
  };

  // 待点击态视频播放结束：按 80/10/10 概率决定下一个播放
  const handleSplashEnded = () => {
    if (playing) return;
    if (currentVideo !== SPLASH_MAIN) {
      playSplash(SPLASH_MAIN); // 穿插视频播完回到主视频
      return;
    }
    const r = Math.random();
    if (r < 0.8) playSplash(SPLASH_MAIN);         // 80% 继续主视频
    else if (r < 0.9) playSplash(SPLASH_EXTRA_1); // 10% 穿插视频 1
    else playSplash(SPLASH_EXTRA_2);              // 10% 穿插视频 2
  };

  // 待点击态视频加载失败：主视频缺失回退粒子动画，穿插视频缺失跳过回主视频
  const handleSplashError = () => {
    if (currentVideo === SPLASH_MAIN) setVideoReady(false);
    else playSplash(SPLASH_MAIN);
  };

  const handleEnter = () => {
    if (playing) return; // 已在过渡播放中
    // 账号设置关闭开屏动画 → 直接进入模式选择
    if (user?.playIntro === false) {
      navigateRef.current('/main');
      return;
    }
    setPlaying(true);
    setIntroFailed(false);

    const v = introRef.current;
    // 视频尚未预加载就绪 → 设置加载超时兜底（缺失/加载失败时 3 秒后进入）
    if (!v || v.readyState < 3) {
      timerRef.current = setTimeout(() => {
        navigateRef.current('/main');
      }, FALLBACK_WAIT * 1000);
    }
    // 播放已预加载的过渡视频
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => setIntroFailed(true));
    }
  };

  // 过渡视频就绪 → 取消加载兜底，等待自然播完（保证完整播放）
  const handleIntroCanPlay = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // 过渡视频播放完成 → 进入模式选择
  const handleIntroEnded = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    navigateRef.current('/main');
  };

  const handleLogout = () => {
    setUser(null, null);
    reset();
  };

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1040 40%, #0d1b3e 70%, #0a0a1a 100%)' }}
      onClick={handleEnter}
    >
      <FullscreenButton />

      {/* ===== 背景视频（待点击态：三视频按 80/10/10 穿插循环） ===== */}
      {!playing && videoReady && (
        <video
          key={`${currentVideo}-${playToken}`}
          className="absolute inset-0 w-full h-full object-cover"
          src={currentVideo}
          autoPlay
          muted
          playsInline
          onEnded={handleSplashEnded}
          onError={handleSplashError}
        />
      )}

      {/* ===== 背景视频缺失时回退：粒子 + 浮动线条动画 ===== */}
      {(!playing || !videoReady) && (
        <>
          {floatingLines.map((line) => (
            <div key={line.id}
              className="absolute left-0 w-full"
              style={{
                top: `${line.top}%`,
                height: '1px',
                background: `linear-gradient(90deg, transparent, rgba(124, 58, 237, ${0.06 + line.id * 0.02}), transparent)`,
                animation: `floatLine ${line.duration}s ${line.delay}s infinite linear`,
              }}
            />
          ))}
          {particles.map((p) => (
            <div key={p.id}
              className="absolute rounded-full"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                left: `${p.x}%`,
                background: `rgba(167, 139, 250, ${p.opacity})`,
                animation: `floatParticle ${p.duration}s ${p.delay}s infinite linear`,
              }}
            />
          ))}
        </>
      )}

      {/* ===== 过渡视频（始终挂载预加载；点击后淡入播放一次，播完进入模式选择） ===== */}
      <video
        ref={introRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        src={INTRO_VIDEO}
        preload="auto"
        muted
        playsInline
        onEnded={handleIntroEnded}
        onCanPlay={handleIntroCanPlay}
        onError={() => setIntroFailed(true)}
      />

      {/* ===== 过渡视频缺失提示 ===== */}
      {playing && introFailed && (
        <motion.div
          className="relative z-20 text-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        >
          <motion.h1
            className="text-5xl md:text-7xl font-bold tracking-wider mb-4"
            style={{
              fontFamily: 'var(--font-title)',
              color: '#f5f3ff',
              textShadow: '0 0 24px rgba(245, 158, 11, 0.5), 0 0 64px rgba(245, 158, 11, 0.22)',
            }}
          >
            幸せの糸
          </motion.h1>
          <p className="text-[var(--color-text-dim)] text-lg tracking-widest">
            正在进入游戏...
          </p>
        </motion.div>
      )}

      <style>{`
        @keyframes floatLine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes floatParticle {
          0% { transform: translateY(100vh); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-10vh); opacity: 0; }
        }
      `}</style>

      {/* ===== 标题层（待点击态：日文标题浮于视频/丝线之上） ===== */}
      {!playing && (
        <>
          <TitleThreads centerY={0.26} />
          <div
            className="absolute inset-x-0 z-10 flex flex-col items-center px-4"
            style={{ top: '22vh' }}
          >
            <motion.h1
              className="select-none"
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: 'clamp(56px, 8vw, 128px)',
                letterSpacing: '0.12em',
                lineHeight: 1,
                color: '#f5f3ff',
                whiteSpace: 'nowrap',
                textShadow: '0 0 24px rgba(245, 158, 11, 0.5), 0 0 64px rgba(245, 158, 11, 0.22), 0 2px 0 rgba(245, 158, 11, 0.35)',
              }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(20px)' }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
              transition={reduceMotion
                ? { delay: 0.2, duration: 0.4 }
                : { delay: 1.1, duration: 0.9, ease: 'easeOut' }}
            >
              幸せの糸
            </motion.h1>

            <motion.p
              className="select-none"
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: 'clamp(14px, 1.6vw, 24px)',
                letterSpacing: '0.3em',
                marginTop: '6vh',
                color: 'var(--color-text-dim)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduceMotion
                ? { delay: 0.4, duration: 0.4 }
                : { delay: 1.6, duration: 0.8 }}
            >
              — 縁を紡ぐ推理ゲーム —
            </motion.p>

            {user && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                className="mt-6 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-evil)] transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0.5 : 2, duration: 0.4 }}
              >
                退出登录
              </motion.button>
            )}
          </div>
        </>
      )}

      {/* ===== 全屏点击引导（待点击态，贴底 6vh） ===== */}
      {!playing && (
        <motion.div
          className="absolute left-0 right-0 z-20 flex justify-center pointer-events-none"
          style={{ bottom: '6vh' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.5, 1] }}
          transition={{ delay: reduceMotion ? 1 : 2.2, duration: 2, repeat: Infinity }}
        >
          <span className="text-sm text-white/60 bg-black/30 px-4 py-2 rounded-full backdrop-blur-sm">
            点击任意处开始
          </span>
        </motion.div>
      )}
    </div>
  );
}
