import { motion, AnimatePresence } from 'framer-motion';
import type { RoundRecord, ActionCardDef } from '../types';
import ActionCardComp from './ActionCardComp';

interface Props {
  records: RoundRecord[];
}

/** 根据回合记录构造展示用的行动卡（正常卡面，只读） */
function buildRevealCard(rec: RoundRecord): ActionCardDef {
  const death = rec.death!;
  return {
    index: death.cardIndex,
    actions: death.deathMarkers.map((m) => ({
      shape: (m.shape === '九宫格' ? '九宫格' : '十字') as '九宫格' | '十字',
    })),
    description: death.cardDescription,
    used: false,
  };
}

/**
 * 正派视角的行动卡公示栏：复用反派视角的同一套行动卡插画（ActionCardComp），
 * 每回合反派打出的卡按回合顺序从上到下展示，卡的左侧标注回合数。
 */
export default function ActionCardReveal({ records }: Props) {
  const playedRounds = records.filter((r) => r.death || r.skip);

  return (
    <div className="w-36 flex-shrink-0 flex flex-col rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden h-full">
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
              className="flex items-center gap-1.5"
            >
              {/* 回合标签（卡左侧） */}
              <span className="shrink-0 text-[10px] font-bold text-yellow-300 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">
                第{rec.round}回合
              </span>

              {rec.death ? (
                <ActionCardComp
                  card={buildRevealCard(rec)}
                  isSelected={false}
                  onClick={() => {}}
                  readOnly
                />
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
