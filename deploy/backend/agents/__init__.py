"""
agents 包 —— 智能体化升级的"大脑抽象层"（P0 架构落地，2026-09-01）。

设计原则（详见项目根目录 agent-singleplayer-upgrade-plan.md）：
    1. 零接口破坏：GameSession 只通过 Brain 协议调用决策，前端/路由无感知；
    2. 永不卡死：任何大脑失败都有兜底链（当前：未知后端一律回退 RuleBrain）；
    3. 零作弊：RuleBrain 内部沿用 ai/ 模块的信息边界；未来 AgentBrain 只允许
       通过 StateEncoder 输出的过滤观测进行决策，严禁直读 ctx.board 的 role 字段。
"""
