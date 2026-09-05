"""
Brain 抽象层 —— 决策上下文与大脑协议（可插拔接口）。

所有"大脑"（规则 AI / LLM 智能体 / 混合）都实现同一协议：
    good_decision(ctx) -> 监视目标 ID 列表（3 个）
    evil_decision(ctx) -> {'cardIndex', 'actions': [{'villainId','targetId','shape'}]} 或 None（跳过）

后端注册（build_brain）：
    'rule'   → RuleBrain  包装现有 ai/ 模块（基线 + 兜底）
    'agent'  → AgentBrain LLM 智能体（状态编码 + 提示词 + 结构化解码 + 校验兜底）
    'hybrid' → AgentBrain（校验与回退链内建，与 agent 同实现，配置区分留待后续）
"""
from dataclasses import dataclass, field
from typing import Protocol, Optional


@dataclass
class DecisionContext:
    """单次决策的上下文快照。

    注意（信息边界红线）：
        board / hand_cards 是引擎内部全量状态，含角色身份。
        RuleBrain 内部沿用 ai/ 模块的信息边界（不读 role 做推理）；
        AgentBrain **严禁**直接读取 role / villainId 等隐藏信息做决策，
        必须使用 StateEncoder 输出的过滤观测；身份信息只可用于校验（validator）。
    """
    side: str                                   # 'good' | 'evil'
    round_num: int
    phase: str = ''                             # 当前阶段（placement/action/reveal）
    difficulty: str = 'normal'                  # easy | normal | hard
    board: list = field(default_factory=list)   # 引擎内部棋盘（含 role，见上方红线）
    hand_cards: list = field(default_factory=list)  # 反派行动卡池（含 used 状态）
    history_rounds: list = field(default_factory=list)  # 公开历史回合记录

    @classmethod
    def from_session(cls, session, side: str) -> 'DecisionContext':
        """从 GameSession 构建决策上下文（同步快照，不含引用语义）。"""
        return cls(
            side=side,
            round_num=session.round,
            phase=session.phase,
            difficulty=session.ai_difficulty,
            board=session.board,
            hand_cards=session.hand_cards,
            history_rounds=session.history_rounds,
        )


class Brain(Protocol):
    """大脑协议：所有 AI 后端（规则/智能体/混合）的统一接口。"""

    def good_decision(self, ctx: DecisionContext) -> list:
        """正派决策：返回 3 个监视目标角色 ID。"""
        ...

    def evil_decision(self, ctx: DecisionContext) -> Optional[dict]:
        """反派决策：返回行动方案 dict，无可行动时返回 None（跳过）。"""
        ...


def build_brain(backend: str, options: Optional[dict] = None) -> Brain:
    """大脑工厂：按 aiBackend 选项构造对应大脑。

    'rule'            → RuleBrain（包装现有 ai/ 模块，行为与升级前一致）
    'agent' / 'hybrid'→ AgentBrain（LLM 智能体；未配置 LLM 或输出非法时
                        自动回退 RuleBrain，对局永不卡死）
    未知后端一律回退 RuleBrain。
    """
    if backend in ('agent', 'hybrid'):
        from agents.agent_brain import AgentBrain
        return AgentBrain()

    from agents.rule_brain import RuleBrain
    return RuleBrain()
