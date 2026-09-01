import { useEffect, useRef } from 'react';
import type { RoundRecord } from '../types';

interface Props {
  records: RoundRecord[];
}

/**
 * 左侧回合记录框：每回合结算后记录公示结果，可鼠标上下滚动
 */
export default function RoundRecordsPanel({ records }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新记录追加后自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [records.length]);

  return (
    <div className="w-44 flex-shrink-0 flex flex-col rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden h-full">
      {/* 标题 */}
      <div className="flex-shrink-0 px-3 py-2 bg-[#7c3aed]/15 border-b border-white/10 flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-purple-300">📜 回合记录</span>
        <span className="ml-auto text-[10px] text-gray-500">{records.length} 回合</span>
      </div>

      {/* 滚动区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-2 record-scroll"
      >
        {records.length === 0 && (
          <p className="text-[10px] text-gray-600 text-center py-4">暂无记录</p>
        )}

        {records.map((rec) => (
          <div key={rec.round} className="rounded-lg bg-white/[0.04] border border-white/5 p-2">
            {/* 回合标题 */}
            <div className="text-[11px] font-bold text-purple-300 mb-1">
              第 {rec.round} 回合
            </div>

            {/* 正派监视 */}
            {rec.surveillance && (
              <div className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-emerald-400 font-medium">正派</span> 监视:{' '}
                {rec.surveillance.join(' ')}
              </div>
            )}

            {/* 反派出牌 */}
            {rec.death && !rec.skip && (
              <div className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-red-400 font-medium">反派</span> 行动:{' '}
                {rec.death.cardDescription}
                <br />
                {rec.death.deathMarkers.map((m, i) => (
                  <span key={i} className="text-red-300">
                    #{m.targetId}({m.shape}){' '}
                  </span>
                ))}
              </div>
            )}

            {/* 反派跳过 */}
            {rec.skip && !rec.death && (
              <div className="text-[10px] text-gray-500 leading-relaxed">
                <span className="text-red-400 font-medium">反派</span> 跳过行动
              </div>
            )}

            {/* 结算结果 */}
            {rec.result && (
              <div className="text-[10px] leading-relaxed mt-1 pt-1 border-t border-white/5">
                {rec.result.marked.length > 0 ? (
                  <span className="text-gray-400">
                    标记:{' '}
                    {rec.result.marked.map((m, i) => (
                      <span key={i} className="text-yellow-300">
                        #{m.charId}({m.shapes.join('/')}){' '}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-gray-500">本回合无标记</span>
                )}
                {rec.result.winner && (
                  <span className={`ml-1 font-bold ${rec.result.winner === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
                    · {rec.result.winner === 'good' ? '正派获胜' : '反派获胜'}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
