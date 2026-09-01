import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

// Web Audio 合成短哔声（无需资源文件）
let audioCtx: AudioContext | null = null;
function beep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch {
    /* 忽略音频不可用 */
  }
}

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 双人模式回合倒计时显示 */
export default function TurnTimer() {
  const turnEndAt = useGameStore((s) => s.turnEndAt);
  const clockOffset = useGameStore((s) => s.clockOffset);
  const paused = useGameStore((s) => s.paused);
  const turnPlayer = useGameStore((s) => s.turnPlayer);
  const myRole = useGameStore((s) => s.myRole);
  const gameStatus = useGameStore((s) => s.gameStatus);

  const [now, setNow] = useState(Date.now());
  const lastBeep = useRef(-1);

  // 每秒 tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // 回合切换时重置哔声记录
  useEffect(() => {
    lastBeep.current = -1;
  }, [turnEndAt]);

  const active = !!turnEndAt && gameStatus === 'playing';
  const remainingSec = turnEndAt
    ? Math.max(0, Math.ceil((turnEndAt - (now + clockOffset)) / 1000))
    : 0;
  const isUrgent = remainingSec <= 30;

  // 剩余 <30s 且是我方回合时，每 5 秒提示一声
  useEffect(() => {
    if (
      active && remainingSec > 0 &&
      turnPlayer === myRole && remainingSec % 5 === 0 &&
      lastBeep.current !== remainingSec
    ) {
      lastBeep.current = remainingSec;
      beep();
    }
  }, [active, remainingSec, turnPlayer, myRole]);

  if (!active) return null;

  const text = paused ? '已暂停' : format(remainingSec);

  return (
    <div
      className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors ${
        paused
          ? 'bg-gray-600/30 border-gray-500/40 text-gray-300'
          : isUrgent
            ? 'bg-red-500/20 border-red-500/50 text-red-300 animate-pulse'
            : 'bg-white/5 border-white/10 text-white'
      }`}
      title="回合剩余时间"
    >
      <span className="text-sm">⏱</span>
      <span className="font-mono font-bold tabular-nums text-sm">{text}</span>
    </div>
  );
}
