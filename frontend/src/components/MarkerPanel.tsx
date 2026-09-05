import { useState } from 'react';
import type { ActionCardDef } from '../types';
import ActionCardComp from './ActionCardComp';
import { markerIllustration, surveillanceIllustration } from '../config/illustrations';
import type { DragPayload } from '../utils/drag';

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
  /** 标记左键按下开始拖拽（携带 payload） */
  onMarkerPointerDown?: (payload: DragPayload, e: React.MouseEvent) => void;
  /** 待确认标记拖回本面板时触发（取消放置） */
  onMarkerReturn?: () => void;
  /** 已放置的本地标记拖回本面板时触发（移除该行动，传入 targetId） */
  onRemoveLocalMarker?: (targetId: number) => void;
  // ---- 正派 ----
  maxSurveillance?: number;
  surveillancePlaced?: number;
  canPlaceSurveillance?: boolean;
}

/** 单个可拖拽标记（左键按住拖动、松开放置） */
function DraggableMarker({
  imgSrc, label, badge, disabled, accent,
  onPointerDown,
}: {
  imgSrc: string;
  label: string;
  badge?: string;
  disabled?: boolean;
  accent?: string;
  onPointerDown: (e: React.MouseEvent) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      onMouseDown={(e) => {
        if (disabled) return;
        if (e.button !== 0) return; // 仅左键
        e.preventDefault(); // 防止选中文本/原生拖拽
        onPointerDown(e);
      }}
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
  onMarkerPointerDown,
  maxSurveillance = 3, surveillancePlaced = 0, canPlaceSurveillance = false,
}: MarkerPanelProps) {
  return (
    <div
      data-marker-panel="true"
      className="w-32 flex-shrink-0 flex flex-col items-center gap-4 h-full py-1 overflow-y-auto"
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
                      onPointerDown={(e) => onMarkerPointerDown?.({ kind: 'death', shape }, e)}
                    />
                  );
                })}
              </div>
              <span className="text-[9px] text-gray-500">按住标记拖动到角色卡</span>
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
                    onPointerDown={(e) => onMarkerPointerDown?.({ kind: 'surveillance' }, e)}
                  />
                );
              })}
            </div>
            <span className="text-[9px] text-gray-500">
              已放置 {surveillancePlaced}/{maxSurveillance}
            </span>
            <span className="text-[9px] text-gray-500">按住标记拖动到角色卡</span>
          </div>
        </>
      )}
    </div>
  );
}
