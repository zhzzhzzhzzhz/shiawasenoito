import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameStore, restoreActiveGame } from '../store/gameStore';
import FullscreenButton from '../components/FullscreenButton';
import UserAvatar from '../components/UserAvatar';
import AccountSidebar from '../components/AccountSidebar';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

// 模式选择界面动态背景视频（后续补充视频后替换，无需改代码）
const MENU_BG_VIDEO = import.meta.env.BASE_URL + 'placeholder-videos/menu_bg.mp4';

export default function MainMenu() {
  const navigate = useNavigate();
  const user = useGameStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bgReady, setBgReady] = useState(true); // 背景视频是否可用（缺失时回退光晕背景）
  // 刷新/误退后有进行中的对局 → 显示恢复入口
  const [activeGame] = useState(() => restoreActiveGame());

  return (
    <div className="relative h-screen w-screen flex items-center justify-center bg-[#0a0a1a] overflow-hidden"><FullscreenButton />
      {/* 动态背景视频（缺失时回退下方光晕背景） */}
      {bgReady && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={MENU_BG_VIDEO}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setBgReady(false)}
        />
      )}

      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#7c3aed] rounded-full blur-[180px] opacity-10 pointer-events-none" />

      {/* 左上角用户头像入口 */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute top-5 left-5 z-30 flex items-center gap-2 px-2 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        title="账号设置"
      >
        <UserAvatar user={user} size={44} />
        <span className="pr-2 text-sm text-[var(--color-text-dim)] max-w-[120px] truncate">
          {user?.nickname || '游客'}
        </span>
      </button>

      <motion.div
        className="relative w-full max-w-2xl mx-auto px-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Game title */}
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-8 text-white text-center"
          variants={itemVariants}
          style={{ fontFamily: 'var(--font-title)', textShadow: '0 0 24px rgba(245, 158, 11, 0.3)' }}
        >
          シアワセノイト
        </motion.h1>

        {/* 恢复对局入口：刷新/误退后存在进行中的对局 */}
        {activeGame && (
          <motion.div
            className="mb-4"
            variants={itemVariants}
          >
            <button
              onClick={() => navigate(activeGame.mode === 'single' ? '/single/game' : '/multi/game')}
              className="w-full py-3 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 text-sm font-medium transition-all"
            >
              ⚡ 检测到进行中的对局，点击恢复
            </button>
          </motion.div>
        )}

        {/* Mode panels（单机左 / 联机右，极淡玻璃透出背景） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Single player panel */}
          <motion.button
            className="glass-subtle flex flex-col items-center justify-center py-10 text-lg w-full"
            variants={itemVariants}
            whileHover={{ scale: 1.03, borderColor: 'rgba(124, 58, 237, 0.6)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/single')}
          >
            <span className="font-bold text-xl text-white">ヒドリデ</span>
          </motion.button>

          {/* Multiplayer panel */}
          <motion.button
            className="glass-subtle flex flex-col items-center justify-center py-10 text-lg w-full"
            variants={itemVariants}
            whileHover={{ scale: 1.03, borderColor: 'rgba(124, 58, 237, 0.6)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/multi')}
          >
            <span className="font-bold text-xl text-white">ミンナト</span>
          </motion.button>
        </div>
      </motion.div>

      {/* 账号侧边栏 */}
      <AccountSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
