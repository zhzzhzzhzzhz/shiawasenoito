// ==================== 角色状态 ====================
export interface CharacterState {
  id: number;
  row: number;
  col: number;
  role: 'good' | 'evil' | 'unknown';
  status: 'alive' | 'dead' | 'default_dead';
  hasSurveillance: boolean;
  surveillanceActive: boolean;
  surveillanceRounds?: number[]; // 该角色被监视的所有回合（历史失效 + 当前），用于堆叠显示
  hasDeathMarker: boolean;
  deathMarkerShape?: '九宫格' | '十字';
  deathMarkerRound?: number; // 死亡标记所属回合（用于标记插画显示回合号）
}

// ==================== 行动卡 ====================
export interface ActionCardDef {
  index: number;
  actions: Array<{ shape: '九宫格' | '十字' }>;
  description: string;
  used: boolean;
}

// ==================== 死亡标记 ====================
export interface DeathMarker {
  villainId: number;
  targetId: number;
  shape: '九宫格' | '十字';
  round: number;
}

// ==================== 游戏状态 ====================
// 每回合3阶段：placement(正派行动,第1回合跳过) → action(反派行动) → reveal(公示+结算)
export type GamePhase = 'placement' | 'action' | 'reveal' | 'gameover';
export type GameRole = 'good' | 'evil';
export type GameMode = 'single' | 'match' | 'invite';
export type AiDifficulty = 'easy' | 'normal' | 'hard';

// ==================== 公示数据（反派行动后公示） ====================
export interface RevealDeathMarker {
  villainId: number;
  targetId: number;
  shape: '九宫格' | '十字';
  affectedIds: number[];
}

export interface RevealData {
  cardIndex: number;
  cardDescription: string;
  deathMarkers: RevealDeathMarker[];
}

export interface GameBoardState {
  roomId: string;
  mode: GameMode;
  status: 'playing' | 'finished';
  round: number;
  phase: GamePhase;
  winner: 'good' | 'evil' | null;
  board: CharacterState[];
  handCards: ActionCardDef[];
  usedCards: number[];
  villains: number[] | null; // 仅反派视角
  goodPlayerId: number | null;
  evilPlayerId: number | null;
  aiDifficulty: AiDifficulty;
  reveal: RevealData | null;
  yourRole?: GameRole;
}

// ==================== 用户 ====================
export interface User {
  id: number;
  account: string;
  nickname: string;
  avatarType?: 'char' | 'upload' | null;
  avatarValue?: string | null;
  playIntro?: boolean;
  illustVersion?: 'v1' | 'v2';
  backgroundPref?: string;
}

// ==================== 房间 presence（等待界面） ====================
export interface RoomPlayerInfo {
  role: 'good' | 'evil';
  account: string | null;
  joined: boolean;
  ready: boolean;
}

export interface RoomInfo {
  roomId: string;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayerInfo[];
}

// ==================== API 响应 ====================
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// ==================== 死亡操作 ====================
export interface DeathAction {
  villainId: number;
  targetId: number;
  shape: '九宫格' | '十字';
}

// ==================== AI 行动结果 ====================
export interface AiActionResult {
  cardIndex?: number;
  actions?: DeathAction[];
  aiTargets?: number[];
  skipped?: boolean;
}

// ==================== 结算结果 ====================
export interface ResolutionResult {
  marked: Array<{ charId: number; role: string; shapes: string[] }>;
  winner: 'good' | 'evil' | null;
  nextRound: number;
  nextPhase: GamePhase;
  status: 'playing' | 'finished';
}

// ==================== 回合记录（左侧滚动记录框） ====================
export interface RoundRecord {
  round: number;
  surveillance: number[] | null;  // 正派监视目标
  death: {
    cardIndex: number;
    cardDescription: string;
    deathMarkers: Array<{ villainId: number | undefined; targetId: number; shape: string }>;
  } | null;                        // 反派出牌+标记
  result: {
    marked: Array<{ charId: number; role: string; shapes: string[] }>;
    winner: 'good' | 'evil' | null;
  } | null;                        // 结算结果
  skip: boolean;                   // 反派跳过行动
}

// ==================== 结算复盘详情（game:result.detail，对双方可见） ====================
export interface ResultDetail {
  villains: number[];              // 三位反派 ID（对双方可见）
  history: RoundRecord[];          // 不脱敏的聚合回合记录（复盘公开身份，含 villainId）
  finalBoard: Array<{ id: number; role: string; status: string }>;
  winner: 'good' | 'evil' | null;
  totalRounds: number;
}
