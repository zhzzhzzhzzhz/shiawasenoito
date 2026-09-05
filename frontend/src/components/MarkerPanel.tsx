import { useState } from 'react';
import type { ActionCardDef } from '../types';
import ActionCardComp from './ActionCardComp';
import { markerIllustration, surveillanceIllustration } from '../config/illustrations';
import { setMarkerDragData } from '../utils/drag';

const shapeLabel: Record<string, string> = {
  '九宫格': '九宫格',
  '十字': '十字',
};

interface MarkerPanelProps {
  role: 'good' | 'evil';
  round: number;
  // ---- 反派 ----
  handCards?: ActionCardDef[];
  selectedCard?: number | null;
  onCardSelect?: (index: number) => void;
  canPlayAction?: boolean;
  remainingShapes?: Set<'九宫格' | '十字'>;
  getRemainingCount?: (shape: '九宫格' | '十字') => number;
  onDeathMarkerDragStart?: (shape: '九宫格' | '十字') => void;
  onMarkerDragEnd?: () => void;
  /** 待确认标记拖回本面板时触发（取消放置） */
  onMarkerReturn?: () => void;
  // ---- 正派 ----
  maxSurveillance?: number;
  surveillancePlaced?: number;
  canPlaceSurveillance?: boolean;
}

/** 单个可拖拽标记 */
function DraggableMarker({
  imgSrc, label, badge, disabled, accent,
  onDragStart, onDragEnd,
}: {
  imgSrc: string;
  label: string;
  badge?: string;
  disabled?: boolean;
  accent?: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) { e.preventDefault(); return; }
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition-all select-none ${
        disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:scale-105 hover:-translate-y-1'
      }`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderColor: accent || 'rgba(255,255,255,0.15)',
      }}
      title={label}
    >
      {imgFailed ? (
        <span className="text-2xl" style={{ color: accent }}>{badge || '✚'}</span>
      ) : (
        <img
          src={imgSrc}
          alt={label}
          onError={() => setImgFailed(true)}
          className="w-9 h-9 object-contain"
          draggable={false}
        />
      )}
      <span className="text-[9px] text-gray-300 leading-none mt-1">{label}</span>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ background: accent || '#64748b' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

export default function MarkerPanel({
  role, round,
  handCards = [], selectedCard = null, onCardSelect,
  canPlayAction = false, remainingShapes = new Set(),
  getRemainingCount = () => 0,
  onDeathMarkerDragStart, onMarkerDragEnd, onMarkerReturn,
  maxSurveillance = 3, surveillancePlaced = 0, canPlaceSurveillance = false,
}: MarkerPanelProps) {
  return (
    <div
      className="w-32 flex-shrink-0 flex flex-col items-center gap-4 h-full py-1 overflow-y-auto"
      onDragOver={(e) => { if (onMarkerReturn) e.preventDefault(); }}
      onDrop={(e) => { if (onMarkerReturn) { e.preventDefault(); onMarkerReturn(); } }}
    >
      {role === 'evil' ? (
        <>
          {/* 行动卡 */}
          <div className={`flex flex-col items-center gap-2 ${canPlayAction ? '' : 'opacity-40'}`}>
            <span className="text-[10px] text-gray-400 tracking-wider">行动卡</span>
            <div className="flex flex-col gap-2">
              {handCards.map((card) => (
                <ActionCardComp
                  key={card.index}
                  card={card}
                  isSelected={selectedCard === card.index}
                  onClick={() => onCardSelect?.(card.index)}
                />
              ))}
            </div>
          </div>

          {/* 本回合死亡标记（选中卡后可用） */}
          {selectedCard !== null && canPlayAction && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] text-gray-400 tracking-wider">本回合标记 · R{round}</span>
              <div className="flex gap-2">
                {(['九宫格', '十字'] as const).filter((s) => remainingShapes.has(s)).map((shape) => {
                  const count = getRemainingCount(shape);
                  return (
                    <DraggableMarker
                      key={shape}
                      imgSrc={markerIllustration(shape, round)}
                      label={shapeLabel[shape]}
                      badge={`×${count}`}
                      accent={shape === '九宫格' ? '#f59e0b' : '#ec4899'}
                      disabled={count <= 0}
                      onDragStart={(e) => {
                        setMarkerDragData(e, { kind: 'death', shape });
                        onDeathMarkerDragStart?.(shape);
                      }}
                      onDragEnd={() => onMarkerDragEnd?.()}
                    />
                  );
                })}
              </div>
              <span className="text-[9px] text-gray-500">拖动标记到角色卡</span>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 监视标记 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] text-gray-400 tracking-wider">监视标记</span>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: maxSurveillance }).map((_, i) => {
                const used = i < surveillancePlaced;
                return (
                  <DraggableMarker
                    key={i}
                    imgSrc={surveillanceIllustration(round)}
                    label={`监视${i + 1}`}
                    accent="#3b82f6"
                    disabled={!canPlaceSurveillance || used}
                    onDragStart={(e) => setMarkerDragData(e, { kind: 'surveillance' })}
                    onDragEnd={() => onMarkerDragEnd?.()}
                  />
                );
              })}
            </div>
            <span className="text-[9px] text-gray-500">
              已放置 {surveillancePlaced}/{maxSurveillance}
            </span>
            <span className="text-[9px] text-gray-500">拖动标记到角色卡</span>
          </div>
        </>
      )}
    </div>
  );
}
