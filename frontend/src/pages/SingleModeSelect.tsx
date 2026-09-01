import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { createRoom } from '../api/room';
import type { GameRole, AiDifficulty } from '../types';
import ModeSelectBackground from '../components/ModeSelectBackground';

const goodGradient = 'linear-gradient(135deg, #10b981, #059669)';
const evilGradient = 'linear-gradient(135deg, #ef4444, #dc2626)';

export default function SingleModeSelect() {
  const navigate = useNavigate();
  const setRoom = useGameStore((s) => s.setRoom);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);

  const [role, setRole] = useState<GameRole | null>(null);
  const [difficulty, setDifficulty] = useState<AiDifficulty | null>(null);
  const [loading, setLoading] = useState(false);

  const difficultyLabels: Record<AiDifficulty, string> = {
    easy: '简单',
    normal: '普通',
    hard: '困难',
  };

  const difficultyKeys: AiDifficulty[] = ['easy', 'normal', 'hard'];

  const handleStart = async () => {
    if (!role || !difficulty) return;
    setLoading(true);
    try {
      const res = await createRoom('single', role, difficulty);
      console.log('[SingleModeSelect] API response:', res);
      if (res.code === 0) {
        console.log('[SingleModeSelect] Setting roomId:', res.data.roomId, 'role:', role);
        setAiDifficulty(difficulty);
        setRoom(res.data.roomId, 'single', role);
        navigate('/single/game');
      } else {
        console.error('创建房间失败:', res.message);
      }
    } catch (err) {
      console.error('请求失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a1a] overflow-hidden">
      <ModeSelectBackground />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#7c3aed] rounded-full blur-[150px] opacity-10 pointer-events-none" />

      <motion.div
        className="relative w-full max-w-md mx-auto px-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="glass p-8">
          {/* Back button */}
          <button
            onClick={() => navigate('/main')}
            className="text-[var(--color-text-dim)] hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors"
          >
            <span>&larr;</span> 返回
          </button>

          <motion.h2
            className="text-2xl font-bold text-white text-center mb-6"
            style={{ fontFamily: 'var(--font-game)' }}
          >
            选择阵营
          </motion.h2>

          {/* Role selection */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <motion.button
              className={`py-5 px-4 rounded-xl border-2 text-center transition-all duration-300 ${
                role === 'good'
                  ? 'border-[#10b981] bg-[#10b981]/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-[#10b981]/50'
              }`}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setRole('good'); setDifficulty(null); }}
            >
              <div
                className="text-lg font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: goodGradient, WebkitBackgroundClip: 'text' }}
              >
                正派
              </div>
              <div className="text-xs text-white/40 mt-1">推理方</div>
            </motion.button>

            <motion.button
              className={`py-5 px-4 rounded-xl border-2 text-center transition-all duration-300 ${
                role === 'evil'
                  ? 'border-[#ef4444] bg-[#ef4444]/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-[#ef4444]/50'
              }`}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setRole('evil'); setDifficulty(null); }}
            >
              <div
                className="text-lg font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: evilGradient, WebkitBackgroundClip: 'text' }}
              >
                反派
              </div>
              <div className="text-xs text-white/40 mt-1">行动方</div>
            </motion.button>
          </div>

          {/* Difficulty selection */}
          <AnimatePresence mode="wait">
            {role && (
              <motion.div
                key="difficulty"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-sm text-[var(--color-text-dim)] text-center mb-3">
                  选择难度
                </h3>
                <div className="flex gap-3 mb-8">
                  {difficultyKeys.map((d) => {
                    const isSelected = difficulty === d;
                    return (
                      <motion.button
                        key={d}
                        className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all duration-300 ${
                          isSelected
                            ? 'border-[#7c3aed] bg-[#7c3aed]/20 text-white'
                            : 'border-white/10 bg-white/[0.03] text-[var(--color-text-dim)] hover:border-white/20'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setDifficulty(d)}
                      >
                        {difficultyLabels[d]}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Start button */}
          <AnimatePresence>
            {role && difficulty && (
              <motion.button
                className="w-full btn-premium py-4 text-lg font-bold"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                whileHover={{ scale: 1.03, boxShadow: '0 12px 40px rgba(124, 58, 237, 0.5)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStart}
                disabled={loading}
              >
                {loading ? '正在创建房间...' : '开始游戏'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}