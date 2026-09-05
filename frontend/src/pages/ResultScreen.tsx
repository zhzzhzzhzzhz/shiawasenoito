import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { charIllustration, markerIllustration, surveillanceIllustration } from '../config/illustrations';
import type { RoundRecord } from '../types';

type Slide =
  | { type: 'round'; round: number; record: RoundRecord; deadIds: Set<number> }
  | { type: 'result' };

/** 复盘角色卡：插画 + 编号 + 状态叠加（反派红框 / 死亡置灰 / 监视蓝标）
 *  id 可能缺失（正派视角死亡标记的 villainId 被后端脱敏）——此时渲染隐藏牌背占位，不请求图片 */
function ReplayCharCard({ id, illustVersion, evil, dead, watched, watchRound }: {
  id: number | undefined;
  illustVersion: 'v1' | 'v2';
  evil?: boolean;
  dead?: boolean;
  watched?: boolean;
  watchRound?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const isUnknown = id == null;
  const border = evil
    ? 'border-red-500'
    : watched
      ? 'border-blue-400'
      : dead
        ? 'border-gray-600'
        : 'border-white/20';

  return (
    <div className={`relative w-16 h-20 rounded-lg overflow-hidden border-2 shrink-0 ${border} ${dead ? 'opacity-70' : ''}`}>
      {isUnknown ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#12122e] text-white/50">
          <span className="text-xl font-bold leading-none">?</span>
          <span className="text-[9px] mt-1 tracking-widest">未知</span>
        </div>
      ) : imgFailed ? (
        <div className="w-full h-full flex items-center justify-center bg-[#1a1a3e] text-sm text-white/60 font-bold">
          #{id}
        </div>
      ) : (
        <img
          src={charIllustration(id, illustVersion)}
          alt={`角色${id}`}
          onError={() => setImgFailed(true)}
          className={`w-full h-full object-cover ${dead ? 'grayscale' : ''}`}
          draggable={false}
        />
      )}
      {!isUnknown && (
        <span className="absolute top-0.5 left-0.5 text-[10px] font-bold text-white bg-black/40 px-1 rounded leading-tight">
          #{id}
        </span>
      )}
      {evil && (
        <span className="absolute top-0.5 right-0.5 text-[10px] font-bold text-red-300 bg-black/40 px-1 rounded leading-tight">反</span>
      )}
      {dead && <span className="absolute bottom-0.5 right-0.5 text-sm leading-none">💀</span>}
      {watched && (
        <img
          src={surveillanceIllustration(watchRound)}
          alt="监视"
          className="absolute bottom-0.5 left-0.5 w-5 h-5 object-contain drop-shadow"
          draggable={false}
        />
      )}
    </div>
  );
}

/** 标记关系：反派卡 → 箭头（上方带标记插画）→ 目标卡
 *  villainId 可能缺失（正派视角脱敏）——渲染「未知行动者」隐藏牌背 */
function MarkerRelation({ villainId, targetId, shape, round, illustVersion }: {
  villainId: number | undefined;
  targetId: number;
  shape: string;
  round: number;
  illustVersion: 'v1' | 'v2';
}) {
  return (
    <div className="flex items-center gap-1">
      <ReplayCharCard id={villainId} evil illustVersion={illustVersion} />
      <div className="flex flex-col items-center px-1">
        <img src={markerIllustration(shape, round)} alt={shape} className="w-7 h-7 object-contain" draggable={false} />
        <svg width="44" height="14" viewBox="0 0 44 14" className="shrink-0">
          <line x1="0" y1="7" x2="38" y2="7" stroke="#ef4444" strokeWidth="2" />
          <polygon points="36,3 44,7 36,11" fill="#ef4444" />
        </svg>
      </div>
      <ReplayCharCard id={targetId} illustVersion={illustVersion} />
    </div>
  );
}

/** 单回合可视化：行动卡 + 反派标记关系 + 正派监视 + 累计死亡 */
function RoundSlide({ round, record, deadIds, illustVersion }: {
  round: number;
  record: RoundRecord;
  deadIds: Set<number>;
  illustVersion: 'v1' | 'v2';
}) {
  const hasSurveillance = !!record.surveillance && record.surveillance.length > 0;
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-title)' }}>
          第 {round} 回合
        </h2>
        {record.death?.cardDescription && (
          <div className="text-sm text-[var(--color-text-dim)] mt-1">行动卡：{record.death.cardDescription}</div>
        )}
      </div>

      {record.death && record.death.deathMarkers.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-[var(--color-text-dim)] mb-2 tracking-widest text-center">反派行动</div>
          <div className="flex flex-col items-center gap-3">
            {record.death.deathMarkers.map((m, i) => (
              <MarkerRelation
                key={i}
                villainId={m.villainId}
                targetId={m.targetId}
                shape={m.shape}
                round={round}
                illustVersion={illustVersion}
              />
            ))}
          </div>
        </div>
      )}

      {hasSurveillance && (
        <div className="mb-5">
          <div className="text-xs text-[var(--color-text-dim)] mb-2 tracking-widest text-center">正派监视</div>
          <div className="flex justify-center gap-2">
            {record.surveillance!.map(id => (
              <ReplayCharCard key={id} id={id} watched watchRound={round} illustVersion={illustVersion} />
            ))}
          </div>
        </div>
      )}

      {deadIds.size > 0 && (
        <div>
          <div className="text-xs text-[var(--color-text-dim)] mb-2 tracking-widest text-center">已死亡</div>
          <div className="flex flex-wrap justify-center gap-2">
            {[...deadIds].map(id => (
              <ReplayCharCard key={id} id={id} dead illustVersion={illustVersion} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultScreen() {
  const navigate = useNavigate();
  const storeRoundRecords = useGameStore((s) => s.roundRecords);
  const resultDetail = useGameStore((s) => s.resultDetail);
  const storeVillains = useGameStore((s) => s.villains);
  const winner = useGameStore((s) => s.winner);
  const myRole = useGameStore((s) => s.myRole);
  const mode = useGameStore((s) => s.mode);
  const illustVersion = useGameStore((s) => s.user?.illustVersion ?? 'v1');

  const [pageIndex, setPageIndex] = useState(0);

  // 复盘数据源：优先用 game:result 下发的 detail.history（不脱敏，含真实 villainId，
  // 复盘时反派身份已公开）；缺失时回退 store 的回合记录（可能已脱敏）
  const roundRecords =
    resultDetail?.history && resultDetail.history.length > 0
      ? resultDetail.history
      : storeRoundRecords;

  // 复盘张：每个有内容的回合成一张，死亡角色按回合累计；最后 +1 张结果
  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];
    const accumulated = new Set<number>();
    for (const r of roundRecords) {
      const hasSurveillance = !!r.surveillance && r.surveillance.length > 0;
      if (hasSurveillance || r.death) {
        if (r.death) {
          for (const m of r.death.deathMarkers) accumulated.add(m.targetId);
        }
        list.push({ type: 'round', round: r.round, record: r, deadIds: new Set(accumulated) });
      }
    }
    list.push({ type: 'result' });
    return list;
  }, [roundRecords]);

  const villains = resultDetail?.villains ?? storeVillains ?? [];
  const iWin = !!myRole && winner === myRole;
  const againPath = mode === 'single' ? '/single' : '/multi';

  const current = slides[pageIndex];
  const total = slides.length;
  const isLast = pageIndex === total - 1;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a1a] overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[150px] opacity-10 pointer-events-none"
        style={{ background: '#7c3aed' }} />

      <div className="relative w-full max-w-2xl mx-auto px-4">
        <div className="glass p-8">
          {/* 进度点 */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setPageIndex(i)}
                aria-label={`第 ${i + 1} 张`}
                className={`h-2.5 rounded-full transition-all ${
                  i === pageIndex ? 'w-6 bg-[#7c3aed]' : 'w-2.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          {/* 当前张内容 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={pageIndex}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              {current.type === 'round' ? (
                <RoundSlide
                  round={current.round}
                  record={current.record}
                  deadIds={current.deadIds}
                  illustVersion={illustVersion}
                />
              ) : (
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-white mb-6" style={{ fontFamily: 'var(--font-title)' }}>
                    三位反派
                  </h2>

                  {villains.length === 3 ? (
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      {villains.map(id => (
                        <div key={id} className="rounded-xl border-2 border-red-500/40 bg-red-500/10 overflow-hidden">
                          <div className="aspect-[3/4] relative">
                            <img
                              src={charIllustration(id, illustVersion)}
                              alt={`角色${id}`}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                            <span className="absolute top-1 left-1 text-xs font-bold text-red-200 bg-black/40 px-1.5 py-0.5 rounded">
                              #{id}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--color-text-dim)] mb-8">反派信息不可用</div>
                  )}

                  <h3 className={`text-3xl font-bold mb-2 ${winner === 'good' ? 'text-green-400' : 'text-red-400'}`}
                    style={{ fontFamily: 'var(--font-title)' }}>
                    {winner === 'good' ? '正派胜利' : '反派胜利'}
                  </h3>
                  <p className="text-[var(--color-text-dim)] text-sm mb-8">
                    {iWin ? '恭喜你获得了胜利' : '很遗憾，这次未能取胜'}
                  </p>

                  <div className="flex flex-col gap-3">
                    <button className="btn-premium w-full" onClick={() => navigate(againPath)}>
                      再来一局
                    </button>
                    <button className="btn-secondary w-full" onClick={() => navigate('/main')}>
                      返回主菜单
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* 翻页按钮 + 跳过 */}
          <div className="flex items-center justify-between mt-8">
            <button
              className="btn-secondary"
              onClick={() => setPageIndex(i => Math.max(0, i - 1))}
              disabled={pageIndex === 0}
            >
              ← 上一张
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--color-text-dim)]">{pageIndex + 1} / {total}</span>
              {!isLast && (
                <button
                  onClick={() => setPageIndex(total - 1)}
                  className="text-sm font-bold text-[var(--color-accent)] hover:text-amber-300 transition-colors"
                >
                  跳过 ⏭
                </button>
              )}
            </div>
            <button
              className="btn-secondary"
              onClick={() => setPageIndex(i => Math.min(total - 1, i + 1))}
              disabled={isLast}
            >
              下一张 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
