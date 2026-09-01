# 《幸福的丝线》— 软件工程书

> **版本**: v1.0  
> **日期**: 2026-08-06  
> **游戏名称**: 《幸福的丝线》（暂定，后续版本更改）  
> **文档用途**: AI 开发全程参考，确保前后端分离架构、云端部署、可迭代

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [技术选型](#3-技术选型)
4. [数据库设计](#4-数据库设计)
5. [后端 API 设计](#5-后端-api-设计)
6. [前端架构设计](#6-前端架构设计)
7. [游戏核心逻辑设计](#7-游戏核心逻辑设计)
8. [AI 系统设计](#8-ai-系统设计)
9. [联机系统设计](#9-联机系统设计)
10. [多媒体资源管理](#10-多媒体资源管理)
11. [部署方案](#11-部署方案)
12. [开发迭代计划](#12-开发迭代计划)
13. [附录](#13-附录)

---

## 1. 项目概述

### 1.1 游戏简介

《幸福的丝线》是一款回合制非对称推理对战网页游戏。玩家分为正派与反派两个阵营，在 5×5 棋盘（共 25 个角色）上进行 6 回合的策略对抗。正派通过放置监视标记推理并遏制反派行动；反派通过行动卡放置死亡标记击杀角色。游戏支持单机（人机对战）与联机（人人对战）两种模式。

### 1.2 核心特性

| 特性 | 说明 |
|---|---|
| 棋盘规模 | 5×5 = 25 个角色，编号 201~205（底行）、301~305、401~405、501~505、601~605 |
| 回合流程 | 6 回合，每回合 3 阶段（正派放置监视→反派行动击杀→结算） |
| 标记系统 | 监视标记（限制反派行动）、死亡标记（九宫格/十字范围击杀） |
| 行动卡系统 | 5 张行动卡，决定反派每回合行动次数与方式 |
| AI 难度 | 三级（简单/普通/困难），分别采用随机/启发式评分/推理搜索 |
| 游戏模式 | 单机（人机）、联机（匹配/邀请） |
| 信息不对称 | 正反派操作互不可见，仅展示标记结果；行动卡双方可见 |

### 1.3 用户系统

- **账号**: 最高 8 位数字（00000000 ~ 99999999）
- **密码**: 最大 12 位字符
- **注册/登录**: 账号密码登录

### 1.4 资源占位策略

- **插画**: 25 张角色卡各需要一个插画占位，后续版本补充
- **音乐/音效**: 各界面预留音乐接口，后续版本补充
- **动画**: 开始界面背景动画、转场动画，后续版本补充

---

## 2. 系统架构

### 2.1 总体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      客户端（浏览器）                      │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │ 登录/注册  │  │  游戏大厅  │  │    游戏主界面        │ │
│  │   模块     │  │   模块    │  │  (棋盘/标记/卡牌)     │ │
│  └───────────┘  └───────────┘  └──────────────────────┘ │
│                         │                                 │
│              WebSocket (游戏实时通信)                      │
│              HTTP REST (用户/房间管理)                     │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                    后端服务（Node.js）                     │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  用户服务  │  │  游戏服务  │  │    AI 服务           │ │
│  │ (注册/登录)│  │ (房间/对局)│  │ (正派AI/反派AI)      │ │
│  └───────────┘  └───────────┘  └──────────────────────┘ │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  匹配服务  │  │  状态管理  │  │    资源服务           │ │
│  │ (联机匹配) │  │ (回合/阶段)│  │  (插画/音乐占位)      │ │
│  └───────────┘  └───────────┘  └──────────────────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                    数据存储层                              │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  MySQL    │  │   Redis   │  │   文件存储/CDN        │ │
│  │(用户/对局) │  │(会话/缓存)│  │  (插画/音乐/音效)     │ │
│  └───────────┘  └───────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 前后端分离方案

| 层 | 技术 | 通信方式 |
|---|---|---|
| 前端 | React 单页应用（SPA） | — |
| 后端 API | Node.js + Express | HTTP REST |
| 实时通信 | Socket.IO | WebSocket |
| 静态资源 | Nginx / CDN | HTTP |

---

## 3. 技术选型

### 3.1 前端技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| React Router | 6.x | 前端路由 |
| Socket.IO Client | 4.x | WebSocket 通信 |
| Zustand | 4.x | 状态管理（轻量） |
| Tailwind CSS | 3.x | 样式框架 |
| Framer Motion | 10.x | 动画库（转场/入场动画） |
| Howler.js | 2.x | 音频管理（占位） |

### 3.2 后端技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Node.js | 20.x LTS | 运行时 |
| Express | 4.x | HTTP 框架 |
| Socket.IO | 4.x | WebSocket 服务 |
| MySQL | 8.x | 关系型数据库 |
| Redis | 7.x | 缓存/会话/匹配队列 |
| JWT | — | 用户身份认证 |
| bcryptjs | — | 密码加密 |

### 3.3 部署方案

| 服务 | 方案 |
|---|---|
| 静态资源 | Nginx + CDN（腾讯云 COS） |
| 后端服务 | PM2 + Node.js（腾讯云轻量服务器） |
| 数据库 | 腾讯云 MySQL / Redis |
| 域名 | 待注册，绑定 HTTPS |

---

## 4. 数据库设计

### 4.1 MySQL 表结构

#### 4.1.1 用户表 `users`

```sql
CREATE TABLE users (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account     VARCHAR(8)   NOT NULL UNIQUE COMMENT '账号，8位数字',
    password    VARCHAR(255) NOT NULL        COMMENT '密码哈希(bcrypt)',
    nickname    VARCHAR(20)  DEFAULT ''      COMMENT '昵称',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 4.1.2 对局记录表 `game_records`

```sql
CREATE TABLE game_records (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id         VARCHAR(36)  NOT NULL        COMMENT '房间UUID',
    mode            ENUM('single','match','invite') NOT NULL COMMENT '模式',
    good_player_id  BIGINT UNSIGNED              COMMENT '正派玩家ID',
    evil_player_id  BIGINT UNSIGNED              COMMENT '反派玩家ID',
    ai_difficulty   ENUM('easy','normal','hard') COMMENT 'AI难度(单机模式)',
    winner          ENUM('good','evil')          COMMENT '胜方',
    total_rounds    TINYINT UNSIGNED             COMMENT '实际回合数',
    detail_json     JSON                         COMMENT '对局详细数据(复盘用)',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_good_player (good_player_id),
    INDEX idx_evil_player (evil_player_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.2 Redis 数据结构

| Key 前缀 | 类型 | 用途 | TTL |
|---|---|---|---|
| `session:{token}` | String | 用户会话（JWT） | 7天 |
| `room:{roomId}` | Hash | 房间状态（玩家/模式/棋盘快照） | 对局结束 |
| `match:queue` | List | 联机匹配队列 | — |
| `game:state:{roomId}` | Hash | 当前回合/阶段/棋盘状态 | 对局结束 |
| `game:moves:{roomId}` | List | 操作记录（步骤回放） | 对局结束 |

---

## 5. 后端 API 设计

### 5.1 REST API

所有 API 返回统一格式：

```json
{
    "code": 0,        // 0=成功, 非0=错误码
    "message": "ok",
    "data": {}        // 具体数据
}
```

#### 5.1.1 用户模块

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/user/register` | 注册（account, password, nickname） |
| POST | `/api/user/login` | 登录（account, password）→ 返回 JWT |
| GET | `/api/user/profile` | 获取用户信息（需 JWT） |

**注册验证规则：**
- `account`: 1~8 位纯数字，首位非 0（或允许 00000001 这类）
- `password`: 1~12 位字符，允许数字+字母+特殊字符
- 账号已存在返回 `code: 1001`

**登录验证规则：**
- 账号不存在返回 `code: 1002`
- 密码错误返回 `code: 1003`
- 连续错误 5 次锁定 15 分钟（Redis 计数）

#### 5.1.2 房间模块

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/room/create` | 创建房间（mode, aiDifficulty?）→ 返回 roomId |
| POST | `/api/room/join` | 加入房间（roomId） |
| POST | `/api/room/leave` | 离开房间（roomId） |
| GET | `/api/room/{roomId}` | 获取房间信息 |

#### 5.1.3 匹配模块

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/match/start` | 开始匹配 |
| POST | `/api/match/cancel` | 取消匹配 |

### 5.2 WebSocket 事件

连接时将 JWT 作为 `auth.token` 传入握手参数。

#### 客户端 → 服务端

| 事件 | 参数 | 描述 |
|---|---|---|
| `game:ready` | `{ roomId }` | 玩家准备就绪 |
| `game:place_surveillance` | `{ roomId, targets: [charId×3] }` | 正派放置监视标记 |
| `game:play_action_card` | `{ roomId, cardIndex }` | 反派打出行动卡 |
| `game:place_death_marker` | `{ roomId, actions: [{villainId, targetId, shape}] }` | 反派放置死亡标记 |
| `game:rematch` | `{ roomId }` | 请求重赛 |

#### 服务端 → 客户端

| 事件 | 参数 | 描述 |
|---|---|---|
| `game:state` | `{ phase, round, board, yourRole }` | 游戏状态同步 |
| `game:phase_change` | `{ phase, round, timeout }` | 阶段变更 |
| `game:result` | `{ winner, detail }` | 对局结果 |
| `game:opponent_action` | `{ type }` | 对手正在操作（提示用） |
| `game:error` | `{ code, message }` | 操作错误 |
| `match:found` | `{ roomId, opponent }` | 匹配成功 |

### 5.3 错误码

| 错误码 | 含义 |
|---|---|
| 0 | 成功 |
| 1001 | 账号已存在 |
| 1002 | 账号不存在 |
| 1003 | 密码错误 |
| 1004 | 账号被锁定 |
| 1005 | 未登录/Token 过期 |
| 2001 | 房间不存在 |
| 2002 | 房间已满 |
| 2003 | 非你的回合 |
| 2004 | 非法操作 |
| 2005 | 游戏已结束 |
| 3001 | 匹配超时 |

---

## 6. 前端架构设计

### 6.1 路由结构

```
/                   → 开始界面（Logo + 背景动画 → 点击进入）
/main               → 主界面（单机 / 联机 两个按钮）
/single             → 单机模式选择（正派 / 反派 / 难度选择）
/single/game        → 单机游戏界面
/multi              → 联机模式选择（匹配 / 邀请）
/multi/game         → 联机游戏界面（含房间号显示）
/result             → 结算界面
/login              → 登录页面
/register           → 注册页面
```

### 6.2 组件树

```
App
├── StartScreen              # 开始界面
│   ├── BackgroundAnimation  # 背景动画（占位）
│   └── ClickToEnter         # 点击进入
├── LoginPage                # 登录页面
│   ├── LoginForm
│   └── RegisterForm
├── MainMenu                 # 主界面
│   ├── Button("单机模式")
│   └── Button("联机模式")
├── SingleModeSelect         # 单机选择
│   ├── Button("正派")
│   ├── Button("反派")
│   └── DifficultySelect      # 难度选择(简单/普通/困难)
├── MultiModeSelect          # 联机选择
│   ├── Button("匹配")
│   └── Button("邀请")
├── GameBoard                # 游戏主界面
│   ├── Board                 # 5x5 角色棋盘
│   │   └── CharacterCard[25] # 角色卡组件
│   │       ├── CharacterIllust # 插画（占位图）
│   │       ├── SurveillanceMarker # 监视标记
│   │       └── DeathMarker    # 死亡标记
│   ├── HandCards             # 手牌区（反派可见）
│   │   └── ActionCard[5]     # 行动卡
│   ├── PhaseIndicator        # 阶段指示器
│   ├── RoundInfo             # 回合信息
│   ├── ActionLog             # 行动日志（仅展示已公开结果）
│   └── PlayerInfo            # 双方信息
└── ResultScreen             # 结算界面
    ├── WinnerDisplay
    ├── GameStats
    └── Button("再来一局")
```

### 6.3 状态管理（Zustand）

```typescript
// 游戏核心状态
interface GameState {
    // 连接状态
    isConnected: boolean;
    socket: Socket | null;

    // 用户状态
    user: { id: number; account: string; nickname: string } | null;
    token: string | null;

    // 房间状态
    roomId: string | null;
    mode: 'single' | 'match' | 'invite';
    myRole: 'good' | 'evil' | null;
    aiDifficulty: 'easy' | 'normal' | 'hard';

    // 游戏状态
    phase: 'placement' | 'action' | 'resolution' | 'gameover';
    round: number; // 1-6
    board: CharacterState[]; // 25个角色状态
    handCards: ActionCard[]; // 5张行动卡
    usedCards: number[];     // 已使用的卡牌索引
    activeSurveillance: Map<number, { round: number; active: boolean }>;
    deathMarkers: DeathMarker[];

    // 对手状态（联机时）
    opponent: { id: number; nickname: string } | null;
    isOpponentReady: boolean;

    // UI 状态
    selectedCharacter: number | null;
    selectedCard: number | null;
    phaseTimeLeft: number; // 阶段倒计时
}

interface CharacterState {
    id: number;           // 201-605
    row: number;          // 0-4
    col: number;          // 0-4
    role: 'good' | 'evil' | 'unknown'; // unknown用于联机时正派视角
    status: 'alive' | 'dead' | 'default_dead'; // default_dead=403
    hasSurveillance: boolean;
    surveillanceRound: number | null;
    surveillanceActive: boolean;
    hasDeathMarker: boolean;
    deathMarkerShape: '九宫格' | '十字' | null;
    deathMarkerRound: number | null;
    illustration: string; // 插画URL（占位）
}

interface ActionCard {
    index: number;
    actions: Array<{ shape: '九宫格' | '十字' }>;
    // 例如: [{shape:'九宫格'},{shape:'九宫格'}] = 两个九宫格标记
    used: boolean;
}

interface DeathMarker {
    villainId: number;
    targetId: number;
    shape: '九宫格' | '十字';
    round: number;
}
```

### 6.4 前端目录结构

```
frontend/
├── public/
│   ├── placeholder-illust/     # 25张角色占位图
│   │   ├── 201.png ... 605.png
│   └── favicon.ico
├── src/
│   ├── api/                    # HTTP API 封装
│   │   ├── user.ts
│   │   └── room.ts
│   ├── components/             # 通用组件
│   │   ├── CharacterCard.tsx
│   │   ├── ActionCard.tsx
│   │   ├── Marker.tsx
│   │   ├── Board.tsx
│   │   ├── PhaseIndicator.tsx
│   │   └── Timer.tsx
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useSocket.ts
│   │   ├── useGameState.ts
│   │   └── useAuth.ts
│   ├── pages/                  # 页面组件
│   │   ├── StartScreen.tsx
│   │   ├── LoginPage.tsx
│   │   ├── MainMenu.tsx
│   │   ├── SingleModeSelect.tsx
│   │   ├── MultiModeSelect.tsx
│   │   ├── GameBoard.tsx
│   │   └── ResultScreen.tsx
│   ├── store/                  # Zustand 状态
│   │   ├── gameStore.ts
│   │   └── userStore.ts
│   ├── socket/                 # Socket.IO 封装
│   │   └── gameSocket.ts
│   ├── types/                  # TypeScript 类型
│   │   └── index.ts
│   ├── utils/                  # 工具函数
│   │   ├── board.ts            # 棋盘坐标计算
│   │   └── validation.ts       # 前端校验
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 7. 游戏核心逻辑设计

### 7.1 棋盘坐标系

```
列:  0    1    2    3    4
─────────────────────────────
行4: 601  602  603  604  605    (最上行)
行3: 501  502  503  504  505
行2: 401  402 [403] 404  405    (403=默认死亡)
行1: 301  302  303  304  305
行0: 201  202  203  204  205    (最下行)
```

**编号规则**: `charId = (row + 2) * 100 + col`

**坐标转换**:
```typescript
function charIdToPos(id: number): { row: number; col: number } {
    const row = Math.floor(id / 100) - 2;
    const col = id % 100;
    return { row, col };
}

function posToCharId(row: number, col: number): number {
    return (row + 2) * 100 + col;
}
```

### 7.2 标记范围计算

#### 7.2.1 九宫格范围

以目标 `(tr, tc)` 为中心，3×3 范围内所有格子（含自身）：

```typescript
function getNineGridRange(row: number, col: number): Array<{row: number; col: number}> {
    const cells: Array<{row: number; col: number}> = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
                cells.push({ row: nr, col: nc });
            }
        }
    }
    return cells;
}
```

#### 7.2.2 十字范围

以目标 `(tr, tc)` 为中心的十字形（同行 + 同列）：

```typescript
function getCrossRange(row: number, col: number): Array<{row: number; col: number}> {
    const cells: Array<{row: number; col: number}> = [];
    // 同列
    for (let r = 0; r < 5; r++) cells.push({ row: r, col });
    // 同行（避免重复中心）
    for (let c = 0; c < 5; c++) {
        if (c !== col) cells.push({ row, col: c });
    }
    return cells;
}
```

### 7.3 游戏流程状态机

```
                    ┌──────────────────────────────────────┐
                    │           游戏开始                     │
                    │  随机抽取3名反派(除403外24选3)        │
                    │  round = 1                            │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │        Phase 1: 正派放置监视标记       │
                    │  正派选择3个角色放置监视标记            │
                    │  【第1回合跳过此阶段】                  │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │        Phase 2: 反派行动               │
                    │  反派选择并打出1张行动卡（公开）        │
                    │  反派按行动卡放置死亡标记               │
                    │  【被监视的反派不能行动】               │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │        Phase 3: 结算阶段               │
                    │  执行死亡标记（角色翻面/标记死亡）       │
                    │  监视标记失效（变灰）                   │
                    │  检查胜负条件                           │
                    └──────┬────────────────────────────┬──┘
                           │                            │
                    ┌──────▼──────┐              ┌──────▼──────┐
                    │   胜负未分   │              │   胜负已分   │
                    │ round < 6   │              │   → 游戏结束 │
                    │ round++     │              └─────────────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────────────────────────────────┐
                    │  返回 Phase 1（正派放置新一轮监视标记）    │
                    └─────────────────────────────────────────┘
```

### 7.4 胜负判定

```typescript
function checkWinCondition(board: CharacterState[]): 'good' | 'evil' | null {
    const villains = board.filter(c => c.role === 'evil' && c.status !== 'default_dead');
    const allIncapacitated = villains.every(v => {
        if (v.status === 'dead') return true;          // 已死亡
        if (v.hasSurveillance && v.surveillanceActive) return true; // 被监视
        return false;
    });

    if (allIncapacitated) return 'good'; // 正派胜利

    // 第6回合Phase 3结算后仍未使所有反派无法行动
    // (由game flow在round=6, phase=3结算时判定)
    return null; // 由回合判定
}
```

### 7.5 监视标记规则

```typescript
// 放置监视标记
function placeSurveillance(board: CharacterState[], targets: number[], round: number) {
    for (const charId of targets) {
        const char = board.find(c => c.id === charId);
        // 403和已死亡角色不能放置
        if (char && char.status !== 'dead' && char.status !== 'default_dead') {
            // 如果已有监视标记，更新而非新增
            char.hasSurveillance = true;
            char.surveillanceRound = round;
            char.surveillanceActive = true;
        }
    }
}

// Phase 3: 监视标记失效
function expireSurveillance(board: CharacterState[]) {
    for (const char of board) {
        if (char.hasSurveillance) {
            char.surveillanceActive = false; // 变灰但不移除
        }
    }
}
```

### 7.6 行动卡系统

```typescript
// 5张行动卡池
const ACTION_CARD_POOL: ActionCard[] = [
    { index: 0, actions: [{ shape: '九宫格' }, { shape: '九宫格' }] },
    { index: 1, actions: [{ shape: '十字' }, { shape: '十字' }] },
    { index: 2, actions: [{ shape: '十字' }, { shape: '九宫格' }] },
    { index: 3, actions: [{ shape: '十字' }, { shape: '九宫格' }] },
    { index: 4, actions: [{ shape: '十字' }, { shape: '十字' }, { shape: '九宫格' }] },
];

// 每回合从可用卡中选择一张打出
// 每张卡全局只能用一次
```

---

## 8. AI 系统设计

### 8.1 AI 架构总览

```
┌─────────────────────────────────────────────────┐
│                 AI 决策接口                       │
│  decideAction(gameState, role, difficulty)       │
└────────────┬────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼──────┐   ┌──────▼─────┐
│ 正派 AI  │   │ 反派 AI    │
│          │   │            │
│ 简单: 随机│   │ 简单: 随机  │
│ 普通: 概率│   │ 普通: 评分  │
│ 困难: 推理│   │ 困难: 搜索  │
└──────────┘   └────────────┘
```

### 8.2 反派 AI 实现

#### 8.2.1 简单难度（均匀随机）

```typescript
function evilEasyAI(state: GameState): EvilAction {
    // 1. 过滤可行动的反派（存活 + 无活跃监视标记）
    const activeVillains = state.board.filter(c =>
        c.role === 'evil' && c.status === 'alive' &&
        !(c.hasSurveillance && c.surveillanceActive)
    );

    // 2. 随机选卡
    const availableCards = state.handCards.filter(c => !c.used);
    const card = randomPick(availableCards);

    // 3. 为每次行动随机选目标和角色
    const actions: DeathAction[] = [];
    const usedVillains = new Set<number>();
    const actionCount = Math.min(card.actions.length, activeVillains.length);

    for (let i = 0; i < actionCount; i++) {
        const villain = randomPick(activeVillains.filter(v => !usedVillains.has(v.id)));
        usedVillains.add(villain.id);
        const shape = card.actions[i].shape;
        const target = randomPick(state.board.filter(c =>
            c.status === 'alive' && c.id !== 403
        ));
        actions.push({ villainId: villain.id, targetId: target.id, shape });
    }

    return { cardIndex: card.index, actions };
}
```

#### 8.2.2 普通难度（启发式评分）

```typescript
// 评分权重配置
const EVIL_WEIGHTS = {
    kill_good: 10,      // 击杀正派角色 +10
    kill_evil: -15,      // 误伤反派 -15（惩罚重于奖励，保证不杀队友）
    kill_dead: 0,        // 对已死亡/403 不计分
    exposure: -3,        // 暴露度惩罚
    utilization: 5,      // 行动利用率奖励
    tempo: 2,            // 节奏因子（后期加权递增）
};

function evilNormalAI(state: GameState): EvilAction {
    const activeVillains = /* 同上 */;
    const availableCards = state.handCards.filter(c => !c.used);

    let bestScore = -Infinity;
    let bestChoice: EvilAction | null = null;

    for (const card of availableCards) {
        const actionCount = Math.min(card.actions.length, activeVillains.length);
        const { score, actions } = greedyActionSelection(
            card, activeVillains, state.board, actionCount, state.round
        );
        // 叠加利用率与节奏
        const utilScore = EVIL_WEIGHTS.utilization *
            (actionCount / card.actions.length);
        const tempoScore = EVIL_WEIGHTS.tempo * (state.round / 6);
        const totalScore = score + utilScore + tempoScore;

        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestChoice = { cardIndex: card.index, actions };
        }
    }
    return bestChoice!;
}

// 贪心选择最优行动组合
function greedyActionSelection(
    card: ActionCard,
    villains: CharacterState[],
    board: CharacterState[],
    maxActions: number,
    round: number
): { score: number; actions: DeathAction[] } {
    const actions: DeathAction[] = [];
    const usedVillains = new Set<number>();
    let totalScore = 0;

    for (let i = 0; i < maxActions; i++) {
        let bestTriplet: { villainId: number; targetId: number; shape: string; score: number } | null = null;

        for (const villain of villains.filter(v => !usedVillains.has(v.id))) {
            const shape = card.actions[i].shape;
            for (const target of board.filter(c => c.status === 'alive' && c.id !== 403)) {
                const s = scoreTriplet(villain, target, shape, board, round);
                if (bestTriplet === null || s > bestTriplet.score) {
                    bestTriplet = { villainId: villain.id, targetId: target.id, shape, score: s };
                }
            }
        }

        if (bestTriplet) {
            usedVillains.add(bestTriplet.villainId);
            actions.push({
                villainId: bestTriplet.villainId,
                targetId: bestTriplet.targetId,
                shape: bestTriplet.shape,
            });
            totalScore += bestTriplet.score;
        }
    }
    return { score: totalScore, actions };
}

function scoreTriplet(
    villain: CharacterState,
    target: CharacterState,
    shape: string,
    board: CharacterState[],
    round: number
): number {
    const range = shape === '九宫格'
        ? getNineGridRange(villain.row, villain.col)
        : getCrossRange(villain.row, villain.col);

    let score = 0;
    for (const { row, col } of range) {
        const char = board.find(c => c.row === row && c.col === col)!;
        if (char.role === 'good' && char.status === 'alive') {
            score += EVIL_WEIGHTS.kill_good;
        } else if (char.role === 'evil' && char.status === 'alive') {
            score += EVIL_WEIGHTS.kill_evil;
        }
    }

    // 暴露度惩罚（简化：目标越靠近嫌疑区域惩罚越大）
    const exposure = calculateExposure(target, board);
    score += EVIL_WEIGHTS.exposure * exposure;

    return score;
}
```

#### 8.2.3 困难难度（推理搜索）

```typescript
function evilHardAI(state: GameState): EvilAction {
    // 与普通模式相同，但对卡的各行动做全排列枚举取全局最优
    // 实现方式：在 greedyActionSelection 基础上
    // 改为对 maxActions 个位置做全排列搜索，而非贪心
    // 候选空间上界: 3×24×2 = 144 个三元组，全排列枚举在毫秒级
    const activeVillains = /* ... */;
    const availableCards = state.handCards.filter(c => !c.used);

    let bestScore = -Infinity;
    let bestChoice: EvilAction | null = null;

    for (const card of availableCards) {
        const actionCount = Math.min(card.actions.length, activeVillains.length);
        // 全排列搜索：枚举所有可能的角色-目标-形状分配
        const result = exhaustiveSearch(card, activeVillains, state.board, actionCount, state.round);
        if (result.score > bestScore) {
            bestScore = result.score;
            bestChoice = { cardIndex: card.index, actions: result.actions };
        }
    }
    return bestChoice!;
}
```

### 8.3 正派 AI 实现

#### 8.3.1 简单难度（均匀随机）

```typescript
function goodEasyAI(state: GameState): number[] {
    // 从可放置的目标中随机选3个
    const candidates = state.board.filter(c =>
        c.status === 'alive' && c.id !== 403
    );
    shuffle(candidates);
    return candidates.slice(0, 3).map(c => c.id);
}
```

#### 8.3.2 普通难度（概率推断 + 边际嫌疑排序）

```typescript
function goodNormalAI(state: GameState): number[] {
    // 1. 维护候选组合集合 Ω（2024种组合）
    const omega = updateCandidateSet(state);

    // 2. 计算每个存活角色的边际嫌疑概率 P(x)
    const suspects = calculateMarginProbabilities(omega, state.board);

    // 3. 按 P(x) 降序排列，取前3名
    const sorted = suspects
        .filter(s => s.status === 'alive' && s.id !== 403)
        .sort((a, b) => b.probability - a.probability);

    return sorted.slice(0, 3).map(s => s.id);
}

// 候选组合更新（约束传播）
function updateCandidateSet(state: GameState): Set<number[]>[] {
    const omega = initializeOmega(); // C(24,3) = 2024 种组合

    for (const roundData of state.historyRounds) {
        // 硬约束排除：本回合放置k个死亡标记
        // → 至少有k名反派处于"存活且未被监视"状态
        const k = roundData.deathMarkers.length;
        const aliveNotWatched = state.board.filter(c =>
            c.status === 'alive' && !(c.hasSurveillance && c.surveillanceActive)
        ).map(c => c.id);

        omega.filter(combo => {
            const inAliveNotWatched = combo.filter(id => aliveNotWatched.includes(id));
            return inAliveNotWatched.length >= k;
        });

        // 贝叶斯软更新：按死亡标记几何先验调整权重
        bayesianUpdate(omega, roundData.deathMarkers);
    }

    return omega;
}
```

#### 8.3.3 困难难度（约束传播 + 一层模拟搜索）

```typescript
function goodHardAI(state: GameState): number[] {
    // 1~2 步：同普通模式（约束传播 + 概率排序）

    // 3. 从概率前8名枚举 C(8,3)=56 种方案
    const topSuspects = /* 概率前8名 */;
    const plans = combinations(topSuspects, 3);

    // 4. 对每种方案模拟反派最优响应，选使反派收益最小的方案
    let bestPlan: number[] | null = null;
    let bestEvilScore = Infinity;

    for (const plan of plans) {
        const simulatedState = simulateSurveillancePlacement(state, plan);
        const evilResponse = evilNormalAI(simulatedState);
        const evilScore = evaluateEvilAction(evilResponse, simulatedState);

        if (evilScore < bestEvilScore) {
            bestEvilScore = evilScore;
            bestPlan = plan;
        }
    }

    return bestPlan!;
}
```

### 8.4 AI 配置化

```typescript
// ai-config.json - 后续调参
{
    "evil": {
        "weights": {
            "kill_good": 10,
            "kill_evil": -15,
            "kill_dead": 0,
            "exposure": -3,
            "utilization": 5,
            "tempo": 2
        }
    },
    "good": {
        "hard": {
            "top_suspect_count": 8,
            "simulation_depth": 1,
            "max_search_ms": 50
        }
    }
}
```

---

## 9. 联机系统设计

### 9.1 房间生命周期

```
创建房间 → 等待加入 → 双方准备 → 游戏开始 → 回合循环 → 游戏结束 → 房间关闭
```

### 9.2 匹配流程

```
玩家A发起匹配 → 加入匹配队列(Redis List)
玩家B发起匹配 → 加入匹配队列
匹配服务检测队列 ≥ 2人 → 取出2人 → 创建房间 → 通知双方
超时60秒 → 通知超时 → 取消匹配
```

### 9.3 邀请流程

```
玩家A创建房间 → 获得房间号(6位)
玩家A分享房间号给玩家B
玩家B输入房间号 → 加入房间
双方准备 → 游戏开始
```

---

## 10. 多媒体资源管理

### 10.1 资源清单

| 类型 | 数量 | 状态 | 格式 | 说明 |
|---|---|---|---|---|
| 角色插画 | 25 张 | **占位** | PNG/WebP | 201~605 号角色卡正面插画 |
| 角色翻面 | 25 张 | **占位** | PNG/WebP | 角色死亡后翻面图案 |
| 开始界面动画 | 1 段 | **占位** | Lottie/MP4 | 背景动画 |
| 转场动画 | 1 段 | **占位** | Lottie/MP4 | 点击进入主界面动画 |
| 背景音乐(BGM) | 3 首 | **占位** | MP3/OGG | 主菜单、游戏中、结算 |
| 监视标记音效 | 1 个 | **占位** | MP3/WAV | 放置监视标记时 |
| 死亡标记音效 | 1 个 | **占位** | MP3/WAV | 放置死亡标记时 |
| 打牌音效 | 1 个 | **占位** | MP3/WAV | 打出行动卡时 |
| 胜利/失败音效 | 2 个 | **占位** | MP3/WAV | 结算时 |
| UI 点击音效 | 1 个 | **占位** | MP3/WAV | 按钮点击 |

### 10.2 占位策略

所有资源使用统一占位机制：

```typescript
// 插画占位：按角色编号生成纯色+编号文字占位图
function getPlaceholderIllust(charId: number): string {
    // 使用 CSS/SVG 生成，或返回预制的占位PNG
    return `/assets/placeholder/char_${charId}.svg`;
}

// 音频占位：静默音频文件 + 接口就绪
// 所有音频调用通过 AudioManager 统一入口
class AudioManager {
    private enabled = false; // 正式资源就绪后启用

    playBGM(scene: 'menu' | 'game' | 'result') {
        if (!this.enabled) return; // 静默占位
        // 正式播放逻辑
    }
}
```

### 10.3 资源加载策略

- 插画：懒加载 + 预加载可见区域的角色
- 音频：按需加载，不预载
- 动画：首屏优先加载开始界面动画

---

## 11. 部署方案

### 11.1 前端部署

```
静态文件构建 → 上传至对象存储 → CDN 加速 → Nginx 反向代理
```

**构建命令**:
```bash
cd frontend && npm run build
# 产物: frontend/dist/
```

**Nginx 配置示例**:
```nginx
server {
    listen 80;
    server_name <domain>;

    root /var/www/happy-threads;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }

    # WebSocket 代理
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 11.2 后端部署

```bash
# 使用 PM2 进程管理
cd backend
npm install
pm2 start src/index.js --name happy-threads-api

# 开机自启
pm2 save
pm2 startup
```

### 11.3 环境变量

```env
# .env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=***
DB_NAME=happy_threads
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random-64-char-secret>
CORS_ORIGIN=https://<domain>
```

### 11.4 目录结构

```
gamemake/
├── frontend/            # 前端项目
│   ├── src/
│   ├── public/
│   ├── dist/            # 构建产物
│   ├── package.json
│   └── vite.config.ts
├── backend/             # 后端项目
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── ai/
│   │   └── config/
│   ├── package.json
│   └── .env
├── docs/                # 文档
│   └── software-engineering-book.md
└── resources/           # 待补充资源
    ├── illustrations/
    ├── music/
    └── sounds/
```

---

## 12. 开发迭代计划

### Phase 1 — 原型验证（MVP）

| 任务 | 优先级 | 预计工作量 |
|---|---|---|
| 后端基础框架（Express + DB + JWT） | P0 | 2天 |
| 用户注册/登录 API | P0 | 1天 |
| 前端项目初始化（React + Vite + Tailwind） | P0 | 1天 |
| 登录/注册页面 | P0 | 1天 |
| 开始界面 + 主菜单 | P0 | 1天 |
| 棋盘渲染（5×5 角色卡 + 编号文字） | P0 | 2天 |
| 单机游戏流程（状态机 + 回合阶段） | P0 | 3天 |
| AI 系统（简单 + 普通难度） | P0 | 3天 |
| 前端游戏交互（选角、放标记、打牌） | P0 | 3天 |
| 结算页面 | P1 | 1天 |

### Phase 2 — 完整单机体验

| 任务 | 优先级 | 预计工作量 |
|---|---|---|
| AI 困难难度 | P1 | 2天 |
| 插画占位图自动生成 | P1 | 0.5天 |
| 动画占位（CSS 动画过渡） | P1 | 1天 |
| 音效占位框架（AudioManager） | P1 | 0.5天 |
| 对局记录存储与查看 | P1 | 1天 |

### Phase 3 — 联机功能

| 任务 | 优先级 | 预计工作量 |
|---|---|---|
| Socket.IO 实时通信 | P1 | 2天 |
| 房间系统（创建/加入/离开） | P1 | 2天 |
| 匹配系统（Redis 队列） | P1 | 2天 |
| 联机游戏流程同步 | P1 | 3天 |
| 邀请系统（房间号分享） | P1 | 1天 |

### Phase 4 — 正式资源 + 部署

| 任务 | 优先级 | 预计工作量 |
|---|---|---|
| 部署上线（服务器 + 域名 + HTTPS） | P1 | 1天 |
| 正式插画替换占位 | P2 | — |
| 正式音乐/音效替换占位 | P2 | — |
| 开始动画 + 转场动画 | P2 | — |
| 性能优化 | P2 | 1天 |

---

## 13. 附录

### 13.1 行动卡详细规格

| 序号 | 行动次数 | 标记配置 |
|---|---|---|
| 卡1 | 2 | 九宫格 + 九宫格 |
| 卡2 | 2 | 十字 + 十字 |
| 卡3 | 2 | 十字 + 九宫格 |
| 卡4 | 2 | 十字 + 九宫格 |
| 卡5 | 3 | 十字 + 十字 + 九宫格 |

> 每局游戏 5 张卡各使用一次，共 6 回合（第 1 回合正派不行动，仅反派行动），故 5 张卡覆盖全部回合。

### 13.2 棋盘角色分类

| 类别 | 数量 | 编号范围 | 说明 |
|---|---|---|---|
| 所有角色 | 25 | 201~605 | 5×5 棋盘 |
| 默认死亡 | 1 | 403 | 始终不可选 |
| 反派角色 | 3 | 从 24 个候选随机 | 除去 403 |
| 正派角色 | 21 | 剩余所有 | — |

### 13.3 关键交互流程

**单机-正派视角**:
```
开始→选择单机→选择正派→选择难度→第1回合跳过Phase1
→反派AI自动Phase2→Phase3结算
→Phase1选3个监视目标→反派AI自动Phase2→Phase3结算
→...重复至胜负分晓→结算界面
```

**单机-反派视角**:
```
开始→选择单机→选择反派→选择难度→第1回合Phase1跳过
→Phase2选卡+放标记→Phase3结算
→正派AI自动Phase1→Phase2选卡+放标记→Phase3结算
→...重复至胜负分晓→结算界面
```

**联机**:
```
A选择联机→发起匹配/邀请→B加入→房间就绪→随机分配正反派
→双方交替操作（操作内容互不可见，仅展示标记结果、行动卡公开）
→胜负分晓→结算界面
```

### 13.4 安全注意事项

1. **密码安全**: 使用 bcrypt + salt，不可明文存储
2. **JWT 安全**: Token 过期时间 7 天，secret 环境变量存储
3. **联机安全**: WebSocket 握手验证 JWT
4. **操作校验**: 所有游戏操作在服务端二次校验（防止前端篡改）
5. **防刷**: 注册接口加验证码（后续版本）
6. **XSS 防护**: 输入过滤 + CSP 头

### 13.5 命名约定

- **组件文件**: PascalCase，如 `CharacterCard.tsx`
- **工具函数**: camelCase，如 `getNineGridRange()`
- **API 路由**: kebab-case，如 `/api/user/profile`
- **数据库字段**: snake_case，如 `good_player_id`
- **Redux Store**: camelCase，如 `gameStore.ts`

---

> **本文档为 AI 开发全程参考。所有设计遵循"先占位、后补充"原则，优先保证游戏核心逻辑完整可运行，插画/音乐/动画在后续版本迭代中逐步替换。**
>
> **游戏名称《幸福的丝线》为暂定名称，后续版本更改时需全局搜索替换。**
