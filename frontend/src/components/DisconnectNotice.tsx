import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';

/**
 * 断线重连提示：
 * - 在线方：显示「对手断线，等待重连 Xs」倒计时（基于服务端截止时间本地递减）
 * - 弃赛方：显示全屏遮罩「你已因断线超时被判弃赛」+ 返回大厅
 */
export default function DisconnectNotice() {
  const navigate = useNavigate();
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);
  const disconnectDeadline = useGameStore((s) => s.disconnectDeadline);
  const clockOffset = useGameStore((s) => s.clockOffset);
  const abandoned = useGameStore((s) => s.abandoned);

  const [now, setNow] = useState(Date.now());

  // 每秒 tick 驱动倒计时刷新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // 自己弃赛 → 全屏遮罩 + 返回大厅
  if (abandoned) {
    return (
      <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="glass p-8 text-center max-w-sm w-full">
          <h2 className="text-2xl font-bold text-red-300 mb-2" style={{ fontFamily: 'var(--font-game)' }}>
            对局已结束
          </h2>
          <p className="text-[var(--color-text-dim)] text-sm mb-6">
            你因断线超时被判弃赛
          </p>
          <button className="btn-premium" onClick={() => navigate('/main')}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  if (!opponentDisconnected || !disconnectDeadline) return null;

  const remainingSec = Math.max(0, Math.ceil((disconnectDeadline - (now + clockOffset)) / 1000));

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-sm">
      <span className="text-sm font-bold text-yellow-200">
        ⚠️ 对手已断开连接，等待重连 {remainingSec}s（超时判定对手弃赛）
      </span>
    </div>
  );
}
