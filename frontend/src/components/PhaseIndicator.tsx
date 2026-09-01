import { motion, AnimatePresence } from 'framer-motion';
import type { GamePhase } from '../types';

interface PhaseIndicatorProps {
  phase: GamePhase;
  round: number;
  myRole: string | null;
  message?: string;
}

const phaseLabels: Record<GamePhase, string> = {
  placement: '正派行动',
  action: '反派行动',
  reveal: '公示结算',
  gameover: '游戏结束',
};

const roleLabels: Record<string, string> = {
  good: '正派',
  evil: '反派',
};

export default function PhaseIndicator({ phase, round, myRole, message }: PhaseIndicatorProps) {
  const isActive = phase !== 'gameover';

  return (
    <div className="relative flex items-center justify-between w-full max-w-lg mx-auto px-4 py-3">
      {/* 阶段指示器 */}
      <div className="phase-indicator">
        {isActive && <div className="phase-dot" />}
        <div className="flex items-baseline gap-2">
          {/* 回合数字：变化时动画强调 */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={round}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3 }}
              className="text-sm font-bold text-purple-200"
            >
              第 {round} 回合
            </motion.span>
          </AnimatePresence>
          <span className="text-xs text-gray-400">
            · {phaseLabels[phase]}
          </span>
        </div>
      </div>

      {/* 角色标识 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">身份:</span>
        <span
          className="font-bold px-3 py-1 rounded-full text-xs"
          style={{
            background: myRole === 'good' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: myRole === 'good' ? '#10b981' : '#ef4444',
            border: `1px solid ${myRole === 'good' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {roleLabels[myRole || ''] || '???'}
        </span>
      </div>

      {/* 提示消息：显示在指示器下方，独立成行不再覆盖其他元素 */}
      <div className="absolute top-full left-0 right-0 flex justify-center mt-1.5 pointer-events-none">
        <AnimatePresence mode="wait">
          {message && (
            <motion.span
              key={message}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-full whitespace-nowrap"
            >
              {message}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
