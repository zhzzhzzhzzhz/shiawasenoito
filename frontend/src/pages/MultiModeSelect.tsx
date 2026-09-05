import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { connectSocket, getSocket } from '../socket/gameSocket';
import FullscreenButton from '../components/FullscreenButton';
import ModeSelectBackground from '../components/ModeSelectBackground';

type MultiTab = 'match' | 'invite' | 'join';

export default function MultiModeSelect() {
  const navigate = useNavigate();
  const store = useGameStore();
  const { token, roomId, mode, inviteCode } = store;

  const [tab, setTab] = useState<MultiTab>('match');
  const [matching, setMatching] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);
  const navigateRef = useRef(navigate);
  const roomRef = useRef<{ roomId: string | null; mode: string | null }>({ roomId, mode });
  roomRef.current = { roomId, mode };

  // 连接 socket
  useEffect(() => {
    const t = token || localStorage.getItem('token') || '';
    connectSocket(t);
  }, [token]);

  // 匹配成功 / 好友加入成功 → 进入等待·对局页（房主有邀请码，靠「进入房间」按钮手动进房）
  useEffect(() => {
    const m = roomRef.current.mode;
    const r = roomRef.current.roomId;
    if (r && (m === 'match' || (m === 'invite' && !inviteCode))) {
      navigateRef.current('/multi/game');
    }
  }, [roomId, mode, inviteCode]);

  const startMatch = () => {
    setMatching(true);
    const sock = getSocket();
    if (sock?.connected) {
      sock.emit('game:match_start', {});
    } else {
      const t = token || localStorage.getItem('token') || '';
      const s = connectSocket(t);
      s.once('connect', () => s.emit('game:match_start', {}));
    }
  };

  const cancelMatch = () => {
    setMatching(false);
    getSocket()?.emit('game:match_cancel', {});
  };

  const createInvite = (role: 'good' | 'evil' | 'random') => {
    const t = token || localStorage.getItem('token') || '';
    const sock = getSocket()?.connected ? getSocket()! : connectSocket(t);
    if (sock.connected) sock.emit('game:create_invite', { role });
    else sock.once('connect', () => sock.emit('game:create_invite', { role }));
  };

  const copyInviteCode = () => {
    if (!inviteCode) return;
    // 优先使用 Clipboard API；非 HTTPS 环境下不可用则回退到 execCommand
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(inviteCode);
    } else {
      const ta = document.createElement('textarea');
      ta.value = inviteCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enterRoom = () => {
    if (roomId && mode === 'invite') {
      // 进入房间：邀请码立即销毁（后端拒绝再加入），前端同步清码
      getSocket()?.emit('game:invite_enter', { roomId });
      useGameStore.getState().setInviteCode(null);
      navigate('/multi/game');
    }
  };

  const joinByCode = () => {
    const code = inviteInput.trim();
    if (!code) { setJoinError('请输入邀请码'); return; }
    const t = token || localStorage.getItem('token') || '';
    const sock = getSocket()?.connected ? getSocket()! : connectSocket(t);
    const doJoin = () => sock.emit('game:join_by_invite', { inviteCode: code });
    if (sock.connected) doJoin();
    else sock.once('connect', doJoin);
    setJoinError('');
  };

  const tabBtn = (key: MultiTab, label: string) => (
    <button
      onClick={() => { setTab(key); setJoinError(''); }}
      className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
        tab === key ? 'bg-[#7c3aed]/30 border border-[#7c3aed]/60 text-white'
          : 'border border-white/10 text-[var(--color-text-dim)] hover:border-white/20'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a1a] overflow-hidden">
      <FullscreenButton />
      <ModeSelectBackground />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#7c3aed] rounded-full blur-[150px] opacity-10 pointer-events-none" />

      <motion.div
        className="relative w-full max-w-md mx-auto px-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="glass p-8">
          <button
            onClick={() => { getSocket()?.emit('game:match_cancel', {}); navigate('/main'); }}
            className="text-[var(--color-text-dim)] hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors"
          >
            <span>&larr;</span> 返回
          </button>

          <motion.h2
            className="text-2xl font-bold text-white text-center mb-2"
            style={{ fontFamily: 'var(--font-game)' }}
          >
            联机模式
          </motion.h2>
          <p className="text-[var(--color-text-dim)] text-sm text-center mb-6">
            与好友一决高下，推理谁是反派
          </p>

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-6">
            {tabBtn('match', '快速匹配')}
            {tabBtn('invite', '邀请好友')}
            {tabBtn('join', '加入对局')}
          </div>

          <AnimatePresence mode="wait">
            {/* ===== 快速匹配 ===== */}
            {tab === 'match' && (
              <motion.div key="match" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {matching ? (
                  <div className="text-center py-8">
                    <motion.div
                      className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-[#7c3aed]/30 border-t-[#7c3aed]"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    />
                    <p className="text-white font-bold mb-1">正在寻找对手...</p>
                    <p className="text-[var(--color-text-dim)] text-sm mb-6">系统将自动为你撮合一名玩家</p>
                    <button
                      onClick={cancelMatch}
                      className="px-6 py-2.5 rounded-lg border border-white/15 text-sm text-gray-300 hover:bg-white/5 transition-all"
                    >
                      取消匹配
                    </button>
                  </div>
                ) : (
                  <motion.button
                    className="w-full py-5 px-4 rounded-xl border-2 border-[#7c3aed]/40 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-center transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={startMatch}
                  >
                    <div className="text-lg font-bold text-white">开始匹配</div>
                    <div className="text-xs text-white/50 mt-1">自动寻找在线对手</div>
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* ===== 邀请好友 ===== */}
            {tab === 'invite' && (
              <motion.div key="invite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                {inviteCode && mode === 'invite' ? (
                  // 建房成功 → 展示邀请码 + 进入房间
                  <div>
                    <p className="text-[var(--color-text-dim)] text-sm mb-4">
                      邀请码已生成，分享给好友加入对局
                    </p>
                    <button
                      onClick={copyInviteCode}
                      className="w-full py-5 px-4 rounded-xl border-2 border-[#7c3aed]/50 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 transition-all"
                    >
                      <span className="block text-xs text-[var(--color-text-dim)] mb-2">你的邀请码（点击复制）</span>
                      <span className="block text-4xl font-bold tracking-[0.3em] text-purple-300">
                        {inviteCode}
                      </span>
                      <span className="block text-xs mt-2 text-[var(--color-text-dim)]">
                        {copied ? '已复制，分享给好友吧' : '点击复制邀请码'}
                      </span>
                    </button>
                    <button
                      onClick={enterRoom}
                      className="mt-4 w-full py-4 rounded-xl bg-[#7c3aed] hover:bg-[#8b5cf6] text-white font-bold transition-all"
                    >
                      进入房间
                    </button>
                  </div>
                ) : (
                  // 未建房 → 选择阵营
                  <div>
                    <p className="text-[var(--color-text-dim)] text-sm mb-4">
                      创建房间后，将邀请码分享给好友加入
                    </p>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => createInvite('random')}
                        className="w-full py-4 rounded-xl border-2 border-[#7c3aed]/40 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-white font-bold transition-all"
                      >
                        随机分配阵营
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => createInvite('good')}
                          className="py-3 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold transition-all"
                        >
                          我当正派
                        </button>
                        <button
                          onClick={() => createInvite('evil')}
                          className="py-3 rounded-xl border-2 border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-bold transition-all"
                        >
                          我当反派
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ===== 加入对局 ===== */}
            {tab === 'join' && (
              <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <p className="text-[var(--color-text-dim)] text-sm mb-4">
                  输入好友分享的 6 位邀请码加入对局
                </p>
                <input
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="输入邀请码"
                  maxLength={6}
                  className="w-full py-3.5 px-4 mb-3 rounded-xl bg-white/5 border border-white/15 text-center text-2xl font-bold tracking-[0.3em] text-white placeholder:text-base placeholder:tracking-normal placeholder:text-white/30 focus:outline-none focus:border-[#7c3aed]/60 transition-all"
                />
                {joinError && <p className="text-red-400 text-xs mb-3">{joinError}</p>}
                <button
                  onClick={joinByCode}
                  disabled={!inviteInput.trim()}
                  className="w-full py-4 rounded-xl border-2 border-[#7c3aed]/40 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  加入对局
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
