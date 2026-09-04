import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import { clearActiveGame } from '../store/gameStore';
import { SOCKET_URL } from '../config/env';

// 调试日志仅在开发模式输出（生产环境避免控制台泄露内部消息结构）
const log = (...args: unknown[]) => {
  if (import.meta.env.DEV) log(...args);
};

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL || '/', {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    log('[Socket] Connected:', socket?.id);
    useGameStore.getState().setConnected(true);
    useGameStore.getState().setSocket(socket);
  });

  socket.on('disconnect', () => {
    log('[Socket] Disconnected');
    useGameStore.getState().setConnected(false);
  });

  // 连接失败兜底：不抛未捕获异常，通知用户并允许重试
  socket.on('connect_error', (err) => {
    if (import.meta.env.DEV) console.warn('[Socket] connect_error:', err?.message);
    useGameStore.getState().setConnected(false);
    useGameStore.getState().setNotification({
      type: 'error',
      message: '服务器连接失败，请检查网络后重试',
    });
  });

  socket.on('game:state', (data) => {
    const store = useGameStore.getState();
    store.setGameState({
      phase: data.phase,
      round: data.round,
      board: data.board || [],
      handCards: data.handCards || [],
      usedCards: data.usedCards || [],
      villains: data.villains,
      winner: data.winner || null,
      gameStatus: data.status === 'finished' ? 'finished'
        : data.status === 'waiting' ? 'waiting' : 'playing',
      reveal: data.reveal || null,
      countdown: data.countdown || 0,
      roundRecords: data.roundRecords || [],
      turnEndAt: data.turnEndAt ?? null,
      turnPlayer: data.turnPlayer ?? null,
      paused: !!data.paused,
      clockOffset: data.serverNow ? data.serverNow - Date.now() : 0,
      opponentDisconnected: data.disconnectPlayerId != null,
      disconnectDeadline: data.disconnectDeadline ?? null,
    });

    // 回合超时提示
    if (data.turnTimeout) {
      const isMe = data.turnTimeout.role === store.myRole;
      store.setNotification({
        type: 'info',
        message: isMe ? '你超时了，已跳过本回合' : '对手超时，已跳过其回合',
      });
    }

    // AI displayed actions
    if (data.aiAction && !data.aiAction.skipped) {
      const ai = data.aiAction;
      let msg = '';
      if (ai.aiTargets) {
        msg = `AI 正派放置监视标记: ${ai.aiTargets.join(', ')}`;
      } else if (typeof ai.cardIndex === 'number') {
        msg = `AI 反派使用行动卡 ${ai.cardIndex + 1}`;
      }
      if (msg) store.setNotification({ type: 'info', message: msg });
    }

    // Resolution
    if (data.resolution) {
      const marked = data.resolution.marked || [];
      // 结算结果属于上一回合（nextRound 已是新回合）
      const settledRound = (data.resolution.nextRound ?? data.round ?? 1) - 1;
      if (marked.length > 0) {
        const shapes = marked.map((m: any) => m.shapes?.[0] || '').join(', ');
        store.setNotification({
          type: 'info',
          message: `第 ${settledRound} 回合结算: ${marked.length} 个角色被标记 (${shapes})`,
        });
      } else {
        store.setNotification({
          type: 'info',
          message: `第 ${settledRound} 回合结算: 无角色被标记`,
        });
      }
    }
  });

  socket.on('game:result', (data) => {
    const store = useGameStore.getState();
    clearActiveGame(); // 对局结束，清除刷新恢复记录
    store.setGameState({
      winner: data.winner,
      gameStatus: 'finished',
      phase: 'gameover',
      resultDetail: data.detail ?? null,
    });
  });

  socket.on('game:error', (data) => {
    useGameStore.getState().setNotification({
      type: 'error',
      message: data.message || '操作错误',
    });
  });

  socket.on('game:started', (data) => {
    log('[Socket] Game started');
    const store = useGameStore.getState();
    store.setGameState({
      phase: data?.phase || 'action',
      round: data?.round || 1,
      board: data?.board || [],
      gameStatus: 'playing',
    });
  });

  socket.on('game:match_found', (data) => {
    log('[Socket] Match found:', data);
    const store = useGameStore.getState();
    store.setRoom(data.roomId, 'match', data.role);
    store.setNotification({ type: 'success', message: '匹配成功！游戏开始' });
  });

  socket.on('game:invite_created', (data) => {
    log('[Socket] Invite created:', data);
    const store = useGameStore.getState();
    store.setRoom(data.roomId, 'invite', data.myRole);
    // 将邀请码存到 store 供页面展示
    store.setInviteCode(data.inviteCode);
  });

  socket.on('game:joined', (data) => {
    log('[Socket] Joined:', data);
    const store = useGameStore.getState();
    store.setRoom(data.roomId, 'invite', data.myRole);
  });

  socket.on('game:room_update', (data) => {
    log('[Socket] Room update:', data);
    useGameStore.getState().setRoomInfo(data);
  });

  socket.on('game:opponent_left', (data) => {
    const store = useGameStore.getState();
    store.setNotification({
      type: 'info',
      message: data.message || '对手已断开连接',
    });
    // 对手断线 → 记录重连截止时间（供倒计时展示）；弃赛 → 清除断线态
    if (data.abandoned) {
      store.setGameState({ opponentDisconnected: false, disconnectDeadline: null });
    } else if (data.disconnectDeadline != null) {
      store.setGameState({ opponentDisconnected: true, disconnectDeadline: data.disconnectDeadline });
    }
  });

  socket.on('game:abandoned', (data) => {
    const store = useGameStore.getState();
    clearActiveGame(); // 被判弃赛，清除刷新恢复记录
    store.setGameState({ abandoned: true, opponentDisconnected: false, disconnectDeadline: null });
    store.setNotification({
      type: 'error',
      message: data.message || '你已因断线超时被判弃赛',
    });
  });

  socket.on('game:phase_change', (data) => {
    useGameStore.getState().setNotification({
      type: 'info',
      message: data.message || `阶段变更: ${data.phase}`,
    });
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
