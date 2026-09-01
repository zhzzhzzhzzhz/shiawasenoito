import { motion } from 'framer-motion';
import { useState } from 'react';
import type { ActionCardDef } from '../types';
import { actionCardIllustration } from '../config/illustrations';

interface ActionCardCompProps {
  card: ActionCardDef;
  isSelected: boolean;
  onClick: () => void;
  /** 只读展示模式（公示用）：正常卡面、不灰显、无 ✕、不可交互 */
  readOnly?: boolean;
}

const shapeEmoji: Record<string, string> = {
  '九宫格': '▣',
  '十字': '✚',
};

export default function ActionCardComp({ card, isSelected, onClick, readOnly = false }: ActionCardCompProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const disabled = card.used || readOnly;

  let className = 'action-card glass-light';
  if (card.used && !readOnly) className += ' used';
  if (isSelected) className += ' selected';

  return (
    <motion.button
      className={className}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { y: -8, boxShadow: '0 12px 32px rgba(245, 158, 11, 0.4)' }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      animate={isSelected ? { y: -12 } : { y: 0 }}
    >
      {/* 插画铺满整卡（与人物卡相同）：object-cover 裁切填充 */}
      <div className="absolute inset-0 z-0 overflow-hidden rounded-[10px] flex items-center justify-center">
        {imgFailed ? (
          <div className="flex flex-col items-center gap-1">
            {card.actions.map((action, i) => (
              <span key={i} className="text-2xl leading-none text-amber-300">
                {shapeEmoji[action.shape] || action.shape}
              </span>
            ))}
          </div>
        ) : (
          <img
            src={actionCardIllustration(card.index)}
            alt={`行动卡${card.index + 1}`}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        )}
      </div>

      {/* 卡号角标（左上） */}
      <span className="absolute top-1 left-1 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/55 text-white">
        卡{card.index + 1}
      </span>

      {/* 行动数角标（右下） */}
      <span className="absolute bottom-1 right-1 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/55 text-white">
        {card.actions.length}动
      </span>

      {/* 已用遮罩（只读展示时不显示） */}
      {card.used && !readOnly && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <span className="text-red-500 text-3xl">✕</span>
        </div>
      )}
    </motion.button>
  );
}
