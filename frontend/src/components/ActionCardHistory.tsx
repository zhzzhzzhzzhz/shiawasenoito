import { motion, AnimatePresence } from 'framer-motion';
import type { RoundRecord } from '../types';

interface Props {
  records: RoundRecord[];
}

const shapeEmoji: Record<string, string> = {
  '九宫格': '▣',
  '十字': '✚',
};

/**
 * 右侧行动卡公示区：每回合反派打出的行动卡按回合顺序从上到下展示，并标注回合数
 */
export default function ActionCardHistory({ records }: Props) {
  // 提取每回合反派打出的行动卡（跳过行动的回合不显示卡，但显示"跳过"）
  const playedRounds = records.filter(r => r.death || r.skip);

  return (
    <div className="w-28 flex-shrink-0 flex flex-col rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden h-full">
      {/* 标题 */}
      <div className="flex-shrink-0 px-3 py-2 bg-red-500/10 border-b border-white/10">
        <span className="text-[11px] font-bold text-red-300">🃏 反派出牌</span>
      </div>

      {/* 滚动区域：按回合顺序从上到下 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2 record-scroll">
        {playedRounds.length === 0 && (
          <p className="text-[10px] text-gray-600 text-center py-3">暂无出牌</p>
        )}

        <AnimatePresence initial={false}>
          {playedRounds.map((rec) => (
            <motion.div
              key={rec.round}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-lg bg-white/[0.05] border border-white/5 p-1.5 flex flex-col items-center gap-0.5"
            >
              {/* 回合标签 */}
              <span className="text-[9px] font-bold text-yellow-300 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">
                第 {rec.round} 回合
              </span>

              {rec.death ? (
                <>
                  {/* 行动卡形状 */}
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {rec.death.deathMarkers.map((m, i) => (
                      <span key={i} className="text-base leading-none" title={`#${m.targetId}(${m.shape})`}>
                        {shapeEmoji[m.shape] || m.shape}
                      </span>
                    ))}
                  </div>
                  {/* 卡描述 */}
                  <span className="text-[9px] text-gray-400 text-center leading-tight">
                    {rec.death.cardDescription}
                  </span>
                  {/* 标记目标 */}
                  <div className="flex flex-wrap justify-center gap-x-1 mt-0.5">
                    {rec.death.deathMarkers.map((m, i) => (
                      <span key={i} className="text-[9px] text-red-300">
                        #{m.targetId}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-[9px] text-gray-500 py-1">跳过行动</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
