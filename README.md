# 幸せの糸（幸福的丝线 / Happy Threads）

5×5 棋盘双人对战策略游戏 —— 正派 vs 反派，推理与博弈的较量。

## 游戏简介

25 名角色排列在 5×5 的棋盘上，其中 3 名是隐藏的反派，其余是正派。正派通过每回合放置 3 个监视标记来锁定反派，反派则通过行动卡（九宫格 / 十字）放置死亡标记清除正派。

- **正派胜利条件**：同一回合内 3 名反派全部被监视
- **反派胜利条件**：撑过 6 回合仍有可行动的反派存活
- **规则特点**：反派必须站进自己标记的影响范围内，正派可通过几何范围推理锁定嫌疑人

## 游戏截图

<div align="center">
  <img src="https://github.com/user-attachments/assets/49a93133-8853-4093-b192-0abf2f6de0a2" alt="游戏截图" width="30%" />
  &nbsp;&nbsp;
  <img src="https://github.com/user-attachments/assets/b7bb17fc-a39b-45d6-a81d-c379c4d19331" alt="游戏截图" width="30%" />
  &nbsp;&nbsp;
  <img src="https://github.com/user-attachments/assets/9f62bb97-868b-4768-83d9-d2c70bb94d6f" alt="游戏截图" width="30%" />
</div>

## 技术架构

```
┌──────────────────────────────────────────────────┐
│              Electron 桌面端 (React)              │
│                       │                          │
│                       ▼                          │
│          FastAPI + Socket.IO (3000)              │
│          ┌──────────┬──────────┐                 │
│          │ 规则 AI  │ LLM 智能体│                 │
│          │ 贝叶斯推断│ DeepSeek │                 │
│          └──────────┴──────────┘                 │
│                       │                          │
│                    MySQL 8                       │
└──────────────────────────────────────────────────┘
```

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面端 | Electron + React 19 + TypeScript + Tailwind CSS | 桌面应用，通过 config.json 配置后端地址 |
| 后端 | Python 3.11 + FastAPI + Socket.IO | REST API + WebSocket 实时通信 |
| 数据库 | MySQL 8 + PyMySQL | 用户 / 房间 / 对局记录 |
| 认证 | JWT + bcrypt | 注册 / 登录 / Token 鉴权 |
| AI | 贝叶斯推断 + 全排列搜索 | 三档难度（easy / normal / hard） |
| LLM 智能体 | DeepSeek / Qwen / GLM / Ollama | 可选，大模型替代规则 AI 决策 |
| 部署 | Docker Compose | 一键编排 MySQL + 后端 |

## 快速开始（本地开发）

### 前提

- Python 3.10+
- Node.js 20+
- MySQL 8.0（或 Docker 运行 MySQL）

### 1. 启动 MySQL

```bash
# 如果本机没有 MySQL，用 Docker 一行启动
docker run -d --name happy-threads-mysql \
  -e MYSQL_ROOT_PASSWORD=admin123 \
  -e MYSQL_DATABASE=happy_threads \
  -p 3306:3306 \
  mysql:8.0 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

### 2. 启动后端

```bash
cd backend-python

# 创建虚拟环境
python -m venv venv
source venv/bin/activate   # Windows: .\venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置 .env（数据库密码、JWT 密钥等）
cp ../.env.example .env
# 编辑 .env，填入你的 MySQL 密码

# 启动（自动建库建表）
python main.py
```

看到 `[DB] Database initialized` 和 `[Server] REST API + Socket.IO → http://0.0.0.0:3000` 即启动成功。

### 3. 构建前端 + 启动桌面端

```bash
# 构建前端产物
cd frontend
npm install
npm run build

# 复制到桌面端
cd ../desktop
npm install
# 编辑 config.json，backendUrl 设为 http://127.0.0.1:3000
npm start
```

## Docker 部署（云端）

后端 Docker 化部署到云服务器，桌面端通过 config.json 连接：

```bash
# 1. 构建并推送镜像
cd backend-python
docker build -t 你的用户名/shiawasenoito-backend:latest .
docker push 你的用户名/shiawasenoito-backend:latest

# 2. 服务器上启动
docker run -d --name happy-threads-backend \
  -p 3000:3000 \
  -e DB_HOST=数据库地址 \
  -e DB_PASSWORD=密码 \
  -e JWT_SECRET=随机密钥 \
  你的用户名/shiawasenoito-backend:latest
```

或使用 deploy/ 目录的 docker-compose.yml 一键编排 MySQL + 后端。详见 [deploy/README.md](deploy/README.md)。

## 项目结构

```
shiawasenoito/
├── backend-python/          # 后端（Python + FastAPI）
│   ├── main.py              # 入口，FastAPI + Socket.IO 服务
│   ├── routes/              # API 路由（用户、房间）
│   ├── services/            # 游戏引擎、会话管理、房间管理
│   ├── ai/                  # 规则 AI（贝叶斯推断 + 搜索）
│   │   ├── bayes.py         # 贝叶斯推断核心（C(24,3)=2024 候选枚举）
│   │   ├── good_ai.py       # 正派 AI（easy/random, normal/bayes, hard/minimax）
│   │   ├── evil_ai.py       # 反派 AI（easy/random, normal/greedy, hard/permutation）
│   │   ├── search.py        # 全排列搜索
│   │   └── config.py        # 权重配置
│   ├── agents/              # LLM 智能体大脑（可选）
│   │   ├── brain.py         # Brain 协议 + 工厂函数
│   │   ├── agent_brain.py   # AgentBrain：LLM 决策管线
│   │   ├── rule_brain.py    # RuleBrain：规则 AI 封装
│   │   ├── llm_gateway.py   # LLM 网关（纯标准库 urllib）
│   │   ├── state_encoder.py # 状态编码器（严格信息边界）
│   │   ├── prompts.py       # 提示词中心（策略原则热更新）
│   │   ├── validator.py     # 动作校验器
│   │   ├── demo.py          # 智能体对战演示
│   │   ├── eval.py          # L1 评测框架
│   │   ├── recorder.py      # 决策点录制
│   │   └── annotate.py      # 人工标注工具
│   ├── middleware/           # 认证中间件
│   ├── config/              # 数据库配置
│   ├── data/                # 训练数据（决策点样本）
│   ├── Dockerfile           # 后端 Docker 镜像
│   └── requirements.txt
├── frontend/                # 前端（React + Vite + Tailwind，Electron 加载用）
│   ├── src/
│   │   ├── api/             # API 调用层
│   │   ├── config/          # 后端地址解析（Electron 用 window.__BACKEND_URL__）
│   │   ├── components/      # UI 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── pages/           # 页面
│   │   ├── stores/          # 状态管理（Zustand）
│   │   └── types/           # TypeScript 类型
│   └── vite.config.ts
├── desktop/                 # 桌面端（Electron 壳）
│   ├── main.js              # Electron 主进程
│   ├── preload.js           # 预加载脚本（注入后端地址到 window）
│   └── config.json          # 后端地址配置
├── deploy/                  # Docker 部署包
│   ├── docker-compose.yml   # 一键编排 MySQL + 后端
│   ├── backend/             # 后端代码（Docker 构建上下文）
│   └── .env.example         # 环境变量模板
└── .env.example             # 本地开发环境变量模板
```

## AI 系统

### 规则 AI（三档难度）

| 难度 | 正派 AI | 反派 AI | 特点 |
|------|---------|---------|------|
| easy | 随机选择 | 随机选择 | 基准线 |
| normal | 贝叶斯边际概率 Top3 | 贪心评分（击杀收益 − 暴露度） | 推理 vs 规避 |
| hard | 一层极小化 | 全排列搜索 | 最强对抗 |

**核心**：正派 AI 使用贝叶斯推断，从 C(24,3)=2024 个反派组合中计算后验概率，综合几何站位约束、标记次数反推、跨回合范围叠加等推理，**全程不偷看反派身份**。

### LLM 智能体（可选）

配置环境变量后，AI 决策由大模型替代规则 AI：

```env
AGENT_LLM_BASE_URL=https://api.deepseek.com/v1
AGENT_LLM_API_KEY=sk-你的key
AGENT_LLM_MODEL=deepseek-chat
```

- 支持 DeepSeek / Qwen / GLM / vLLM / Ollama 等任何 OpenAI 兼容端点
- 决策管线：状态编码 → LLM 推理 → JSON 解析 → 校验 → 失败重试 → 回退规则 AI
- **不配 LLM 或 LLM 失败时自动回退规则 AI，对局永不卡死**
- 创建房间时通过 `aiBackend` 参数选择大脑（`rule` / `agent` / `hybrid`）

## 桌面端

前端 React 代码通过 Electron 打包为桌面应用，`preload.js` 将 `config.json` 中的后端地址注入到 `window.__BACKEND_URL__`，前端 API 层自动走绝对地址连接后端：

```bash
cd desktop
npm install
# 编辑 config.json 配置后端地址
npm start        # 开发运行
npm run dist     # 打包成 exe
```

详见 [desktop/README.md](desktop/README.md)。

## 许可证

Private