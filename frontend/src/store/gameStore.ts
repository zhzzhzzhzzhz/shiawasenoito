import { create } from 'zustand';
import type {
  CharacterState,
  ActionCardDef,
  GamePhase,
  GameRole,
  GameMode,
  AiDifficulty,
  User,
  DeathAction,
  RevealData,
  RoundRecord,
  RoomInfo,
  ResultDetail,
} from '../types';

interface GameStore {
  // 连接状态
  isConnected: boolean;
  socket: any;

  // 用户
  user: User | null;
  token: string | null;

  // 房间/游戏
  roomId: string | null;
  mode: GameMode;
  myRole: GameRole | null;
  aiDifficulty: AiDifficulty;
  inviteCode: string | null;

  // 游戏状态
  phase: GamePhase;
  round: number;
  board: CharacterState[];
  handCards: ActionCardDef[];
  usedCards: number[];
  villains: number[] | null;
  winner: 'good' | 'evil' | null;
  gameStatus: 'idle' | 'waiting' | 'playing' | 'finished';
  reveal: RevealData | null;
  countdown: number; // 阶段结束后的展示缓冲倒计时（秒），0 表示无倒计时
  roundRecords: RoundRecord[]; // 每回合结算记录（左侧滚动框）
  resultDetail: ResultDetail | null; // 结算复盘详情（game:result 下发，含三位反派与最终身份）

  // 回合倒计时（双人模式）
  turnEndAt: number | null; // 回合截止时间戳（服务端 epoch ms）
  turnPlayer: 'good' | 'evil' | null;
  paused: boolean;
  clockOffset: number; // 服务端时间 - 客户端时间（ms），用于修正时钟偏差

  // 断线重连（双人模式弃赛判定）
  opponentDisconnected: boolean; // 对手是否断线中
  disconnectDeadline: number | null; // 对手重连截止时间（服务端 epoch ms）
  abandoned: boolean; // 自己是否被判弃赛

  // 房间 presence（联机等待界面）
  roomInfo: RoomInfo | null;

  // 选择状态
  selectedCharacters: number[];
  selectedCard: number | null;
  pendingDeathActions: DeathAction[];

  // 对手
  opponent: { id: number; nickname: string } | null;

  // 界面
  notification: { type: 'info' | 'error' | 'success'; message: string } | null;

  // Actions
  setSocket: (socket: any) => void;
  setConnected: (connected: boolean) => void;
  setUser: (user: User | null, token: string | null) => void;
  setRoom: (roomId: string, mode: GameMode, role: GameRole | null) => void;
  setInviteCode: (code: string | null) => void;
  setRoomInfo: (info: RoomInfo) => void;
  setGameState: (state: Partial<{
    phase: GamePhase; round: number; board: CharacterState[];
    handCards: ActionCardDef[]; usedCards: number[]; villains: number[];
    winner: 'good' | 'evil' | null; gameStatus: 'idle' | 'waiting' | 'playing' | 'finished';
    reveal: RevealData | null; countdown: number; roundRecords: RoundRecord[]; resultDetail: ResultDetail | null;
    turnEndAt: number | null; turnPlayer: 'good' | 'evil' | null; paused: boolean; clockOffset: number;
    opponentDisconnected: boolean; disconnectDeadline: number | null; abandoned: boolean;
  }>) => void;
  setAiDifficulty: (d: AiDifficulty) => void;
  toggleCharacter: (charId: number) => void;
  clearSelection: () => void;
  setSelectedCard: (index: number | null) => void;
  addDeathAction: (action: DeathAction) => void;
  removeDeathAction: (index: number) => void;
  clearDeathActions: () => void;
  setNotification: (n: GameStore['notification']) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  socket: null,
  user: null,
  token: null,
  roomId: null,
  mode: 'single' as GameMode,
  myRole: null as GameRole | null,
  aiDifficulty: 'normal' as AiDifficulty,
  inviteCode: null,
  phase: 'action' as GamePhase,
  round: 1,
  board: [],
  handCards: [],
  usedCards: [],
  villains: null,
  winner: null,
  gameStatus: 'idle' as 'idle' | 'waiting' | 'playing' | 'finished',
  reveal: null as RevealData | null,
  countdown: 0,
  roundRecords: [] as RoundRecord[],
  resultDetail: null as ResultDetail | null,
  turnEndAt: null as number | null,
  turnPlayer: null as 'good' | 'evil' | null,
  paused: false,
  clockOffset: 0,
  opponentDisconnected: false,
  disconnectDeadline: null as number | null,
  abandoned: false,
  roomInfo: null as RoomInfo | null,
  selectedCharacters: [] as number[],
  selectedCard: null as number | null,
  pendingDeathActions: [] as DeathAction[],
  opponent: null,
  notification: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),
  setConnected: (isConnected) => set({ isConnected }),
  setUser: (user, token) => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    set({ user, token });
  },
  setRoom: (roomId, mode, myRole) => {
    // 持久化进行中的对局（刷新页面后恢复用），localStorage 不可用时静默降级
    try {
      localStorage.setItem('active_game', JSON.stringify({ roomId, mode, myRole }));
    } catch { /* ignore */ }
    set({
      roomId, mode, myRole,
      // 邀请房先进入等待态，双方准备后由 game:started 置为 playing
      gameStatus: mode === 'invite' ? 'waiting' : 'playing',
    });
  },
  setInviteCode: (inviteCode) => set({ inviteCode }),
  setRoomInfo: (roomInfo) => set({ roomInfo }),
  setGameState: (partial) => set(partial),
  setAiDifficulty: (d) => set({ aiDifficulty: d }),

  toggleCharacter: (charId) => {
    const { selectedCharacters } = get();
    const exists = selectedCharacters.includes(charId);
    if (exists) {
      set({ selectedCharacters: selectedCharacters.filter(id => id !== charId) });
    } else if (selectedCharacters.length < 3) {
      set({ selectedCharacters: [...selectedCharacters, charId] });
    }
  },
  clearSelection: () => set({ selectedCharacters: [], selectedCard: null, pendingDeathActions: [] }),
  setSelectedCard: (index) => set({ selectedCard: index }),
  addDeathAction: (action) => set(s => ({
    pendingDeathActions: [...s.pendingDeathActions, action],
  })),
  removeDeathAction: (index) => set(s => ({
    pendingDeathActions: s.pendingDeathActions.filter((_, i) => i !== index),
  })),
  clearDeathActions: () => set({ pendingDeathActions: [] }),
  setNotification: (n) => set({ notification: n }),
  reset: () => {
    clearActiveGame();
    set({ ...initialState, socket: get().socket, isConnected: get().isConnected });
  },
}));

// ==================== 对局持久化（刷新恢复）====================

const ACTIVE_GAME_KEY = 'active_game';

/** 清除进行中对局的持久化记录（结算/弃赛/退出时调用） */
export function clearActiveGame(): void {
  try {
    localStorage.removeItem(ACTIVE_GAME_KEY);
  } catch { /* ignore */ }
}

/** 恢复进行中对局的持久化记录（刷新后调用），无记录返回 null */
export function restoreActiveGame(): { roomId: string; mode: GameMode; myRole: GameRole | null } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.roomId !== 'string' || !data.roomId) return null;
    return data;
  } catch {
    return null;
  }
}
