import { motion } from 'framer-motion';
import { useState } from 'react';
import type { CharacterState } from '../types';
import { useGameStore } from '../store/gameStore';
import { charIllustration, markerIllustration, surveillanceIllustration } from '../config/illustrations';

/** 单个监视标记徽章：active 高亮，失效褪色；图片加载失败回退蓝点 */
function SurveillanceBadge({ round, active }: { round: number; active: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className={`flex items-center gap-0.5 ${active ? '' : 'opacity-40 grayscale'}`}>
      {imgFailed ? (
        <span className="w-6 h-6 flex items-center justify-center">
          <span className={`w-4 h-4 rounded-full ${active ? 'bg-blue-400' : 'bg-blue-400/50'}`} />
        </span>
      ) : (
        <img
          src={surveillanceIllustration(round)}
          alt="监视"
          onError={() => setImgFailed(true)}
          className="w-6 h-6 object-contain"
          draggable={false}
        />
      )}
      <span className={`text-[8px] ${active ? 'text-blue-400' : 'text-blue-400/60'}`}>
        {active ? '监视中' : `R${round}`}
      </span>
    </div>
  );
}

interface LocalMarker {
  kind: 'death' | 'surveillance';
  shape?: '九宫格' | '十字';
}

interface CharacterCardProps {
  char: CharacterState;
  viewerRole: string | null;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
  dimmed?: boolean;
  villainHighlight?: boolean;
  /** 拖拽中的范围色（所属反派的分色） */
  rangeColor?: string | null;
  /** 范围重叠卡（多反派覆盖，松手后需手动选行动者） */
  rangeOverlap?: boolean;
  /** 是否为可拖拽放置目标 / 拖拽中悬停 */
  dropTarget?: boolean;
  /** 左键拖拽中悬停本卡（高亮） */
  hovered?: boolean;
  /** 本地已放置的标记（确认后、回合提交前可点击移除或按住拖拽） */
  localMarker?: LocalMarker | null;
  /** 本地标记插画使用的回合 */
  localMarkerRound?: number;
  /** 点击移除本地标记 */
  onRemoveLocalMarker?: () => void;
  /** 本地标记左键按住开始拖拽（换目标/回面板） */
  onLocalMarkerPointerDown?: (e: React.MouseEvent) => void;
}

export default function CharacterCard({
  char, viewerRole, isSelected, onClick, disabled,
  dimmed = false, villainHighlight = false,
  rangeColor = null, rangeOverlap = false,
  dropTarget = false, hovered = false,
  localMarker = null, localMarkerRound = 1,
  onRemoveLocalMarker, onLocalMarkerPointerDown,
}: CharacterCardProps) {
  const isDead = char.status === 'dead' || char.status === 'default_dead';
  const hasActiveSurveillance = char.hasSurveillance && char.surveillanceActive;
  const hasInactiveSurveillance = char.hasSurveillance && !char.surveillanceActive;
  const isEvil = char.role === 'evil';
  const isGood = char.role === 'good';

  let bgColor = '#1a1a3e';
  let borderColor = '#4b5563';
  let roleColor = '#9ca3af';

  const isMarked = char.hasDeathMarker && !isDead;
  const illustVersion = useGameStore((s) => s.user?.illustVersion ?? 'v1');
  // 该角色被监视的所有回合（历史失效 + 当前）；插画固定显示各标记「放置时的回合」，不随后续回合变化
  const surveillanceRounds = char.surveillanceRounds ?? [];

  // 插画加载状态：图片缺失时回退到符号占位
  const [imgFailed, setImgFailed] = useState(false);
  // 死亡标记插画加载失败时回退为符号图标（保证始终有图标）
  const [deathMarkerImgFailed, setDeathMarkerImgFailed] = useState(false);
  const fallbackEmoji = (isDead || isMarked) ? '💀'
    : isEvil && viewerRole === 'evil' ? '👹'
    : isGood ? '🛡️' : '👤';
  // 被死亡标记的角色与默认死亡统一：使用原插画 + 灰度（403 样式）
  const imgSrc = charIllustration(char.id, illustVersion);
  // 标记颜色（九宫格金 / 十字粉）：标记图标保持彩色，不被死亡灰度影响
  const markerColor = char.deathMarkerShape === '九宫格' ? '#f59e0b' : '#ec4899';

  if (isDead) {
    bgColor = '#1a1a2e';
    borderColor = '#374151';
    roleColor = '#6b7280';
  } else if (isMarked) {
    // 被死亡标记：统一为 403 默认死亡样式（灰色），右下角保留标记图标作推理线索
    bgColor = '#1a1a2e';
    borderColor = '#374151';
    roleColor = '#6b7280';
  } else if (viewerRole === 'evil') {
    if (isEvil) {
      bgColor = '#3b0a0a';
      borderColor = '#ef4444';
      roleColor = '#fca5a5';
    } else {
      bgColor = '#0a1a3b';
      borderColor = '#10b981';
      roleColor = '#6ee7b7';
    }
  }

  let className = 'char-card relative flex flex-col items-center justify-center';
  if (isSelected) className += ' selected';
  if (isDead || isMarked) className += ' dead';
  if (hasActiveSurveillance) className += ' surveillance';
  if (hasInactiveSurveillance) className += ' surveillance-inactive';
  if (hovered && dropTarget) className += ' drop-target';

  // Additional visual states for villain action
  let extraStyle: React.CSSProperties = {};
  if (dimmed && !villainHighlight) {
    extraStyle = { opacity: 0.25, filter: 'grayscale(60%)' };
  }
  if (villainHighlight) {
    extraStyle = { boxShadow: '0 0 20px rgba(245, 158, 11, 0.7), 0 0 40px rgba(245, 158, 11, 0.3)' };
    borderColor = '#f59e0b';
  }
  if (rangeColor && !isDead) {
    extraStyle = {
      ...extraStyle,
      borderColor: rangeColor,
      boxShadow: rangeOverlap
        ? `0 0 14px ${rangeColor}, inset 0 0 10px ${rangeColor}55, 0 0 0 2px #ffffff88`
        : `0 0 14px ${rangeColor}, inset 0 0 10px ${rangeColor}55`,
    };
  }
  if (hovered && dropTarget) {
    extraStyle = { ...extraStyle, borderColor: '#22d3ee', boxShadow: '0 0 20px rgba(34, 211, 238, 0.6), inset 0 0 14px rgba(34, 211, 238, 0.2)' };
  }

  return (
    <motion.button
      data-char-id={char.id}
      className={className}
      style={{ background: bgColor, borderColor, ...extraStyle }}
      onClick={() => {
        if (localMarker) {
          onRemoveLocalMarker?.();
        } else {
          onClick();
        }
      }}
      disabled={localMarker ? false : (disabled || (dimmed && !villainHighlight))}
      whileHover={(disabled || dimmed) ? {} : { scale: 1.05, y: -4 }}
      whileTap={(disabled || dimmed) ? {} : { scale: 0.95 }}
      animate={isSelected || villainHighlight ? { scale: 1.05 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="text-xs opacity-60 absolute top-1 left-1 z-10" style={{ color: roleColor }}>
        {char.id}
      </span>

      {/* 插画铺满整卡：绝对定位填充，人物插画 object-cover 覆盖；加载失败回退符号 */}
      <div className="absolute inset-0 z-0 flex items-center justify-center text-3xl overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${bgColor}, ${borderColor}40)` }}>
        {imgFailed ? (
          fallbackEmoji
        ) : (
          <img
            src={imgSrc}
            alt={`角色${char.id}`}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            style={isDead || isMarked ? { filter: 'grayscale(100%)', opacity: 0.55 } : undefined}
            draggable={false}
          />
        )}
      </div>

      {isMarked && (
        <div className="absolute bottom-1 right-1 z-10 flex flex-col items-end gap-0.5">
          {/* 标记图标：优先插画，加载失败回退形状符号（始终有图标） */}
          {deathMarkerImgFailed ? (
            <span className="w-8 h-8 flex items-center justify-center text-xl leading-none drop-shadow"
              style={{ color: markerColor }}>
              {char.deathMarkerShape === '九宫格' ? '▦' : '✚'}
            </span>
          ) : (
            <img
              src={markerIllustration(char.deathMarkerShape || '', char.deathMarkerRound)}
              alt={char.deathMarkerShape === '九宫格' ? '九宫格' : '十字'}
              onError={() => setDeathMarkerImgFailed(true)}
              className="w-8 h-8 object-contain drop-shadow"
              draggable={false}
            />
          )}
          <span className="text-[8px] font-bold px-1 py-0.5 rounded"
            style={{ background: `${markerColor}30`, color: markerColor, border: `1px solid ${markerColor}60` }}>
            {char.deathMarkerShape === '九宫格' ? '九宫格' : '十字'}
            {char.deathMarkerRound != null ? `·R${char.deathMarkerRound}` : ''}
          </span>
        </div>
      )}

      {/* 监视标记堆叠（右侧，从上往下：active 在最上，失效褪色在下） */}
      {surveillanceRounds.length > 0 && (
        <div className="absolute top-6 right-1 z-10 flex flex-col items-end gap-0.5">
          {[...surveillanceRounds].reverse().map((sr, idx) => {
            const isActive = idx === 0 && char.surveillanceActive;
            return <SurveillanceBadge key={sr} round={sr} active={isActive} />;
          })}
        </div>
      )}
      {isSelected && (
        <motion.div className="absolute inset-0 z-20 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'rgba(124, 58, 237, 0.6)' }}>✓</div>
        </motion.div>
      )}

      {/* 本地已放置标记（回合提交前可点击移除 / 左键按住拖拽换目标或回面板） */}
      {localMarker && (
        <div
          className="absolute inset-0 z-[25] flex flex-col items-center justify-center pointer-events-none"
        >
          {localMarker.kind === 'surveillance' ? (
            <img
              src={surveillanceIllustration(localMarkerRound)}
              alt="监视"
              className="w-10 h-10 object-contain drop-shadow-lg pointer-events-auto cursor-grab active:cursor-grabbing"
              draggable={false}
              title="监视 · 按住拖动切换目标，拖到空白处取消"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                onLocalMarkerPointerDown?.(e);
              }}
            />
          ) : (
            <img
              src={markerIllustration(localMarker.shape || '', localMarkerRound)}
              alt={localMarker.shape || '标记'}
              className="w-10 h-10 object-contain drop-shadow-lg pointer-events-auto cursor-grab active:cursor-grabbing"
              draggable={false}
              title={`${localMarker.shape} · 按住拖动切换目标，拖到空白处取消`}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                onLocalMarkerPointerDown?.(e);
              }}
            />
          )}
          <span className="text-[8px] mt-0.5 px-1 rounded bg-black/60 text-white/80">
            按住拖动换目标 · 点击卡移除
          </span>
        </div>
      )}
    </motion.button>
  );
}
