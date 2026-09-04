"""
RuleBrain —— 规则大脑：薄封装现有 ai/ 模块（贝叶斯推断 + 搜索），行为与升级前完全一致。

这是 Brain 协议的第一个实现，也是"基线"与"兜底"：
    - 基线：benchmark 矩阵即为 RuleBrain 三档能力基准；
    - 兜底：未来 AgentBrain 输出非法动作时，回退到 RuleBrain 保证对局不卡死。
"""
from ai.good_ai import good_ai
from ai.evil_ai import evil_ai


class RuleBrain:
    """包装 ai/good_ai.py 与 ai/evil_ai.py 的规则大脑。"""

    def good_decision(self, ctx) -> list:
        return good_ai(ctx.board, ctx.difficulty, ctx.history_rounds)

    def evil_decision(self, ctx) -> dict | None:
        return evil_ai(ctx.board, ctx.hand_cards, ctx.difficulty,
                       ctx.round_num, ctx.history_rounds)
