"""
agent_brain.py —— AgentBrain：LLM 智能体大脑（Brain 协议实现）。

决策管线（方案 §1.3）：
    ① 状态编码（StateEncoder，严格信息边界）
    ② LLM 推理（CoT + 结构化解码提示）
    ③ JSON 解析（容错：截取首个 { ... }）
    ④ 动作校验（Validator，引擎同口径）
    ⑤ 失败重试 1 次（携带错误原因）→ 再失败回退 RuleBrain（对局永不卡死）

LLM 未配置时直接回退 RuleBrain。
轨迹统计（fallback_count / llm_attempts）供评测与调优。
"""
import json
import os
import re

from agents.prompts import build_messages
from agents.state_encoder import encode_observation
from agents.validator import validate
from agents.llm_gateway import chat, LLMError
from agents.rule_brain import RuleBrain


def _parse_json(text: str) -> dict:
    """从 LLM 输出中提取 JSON 对象（容忍前后缀/代码块围栏）。"""
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```[a-zA-Z]*\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end <= start:
        raise ValueError('输出中找不到 JSON 对象')
    return json.loads(text[start:end + 1])


class AgentBrain:
    """LLM 智能体大脑：主决策走大模型，校验兜底走规则 AI。"""

    def __init__(self):
        self._rule = RuleBrain()
        self.fallback_count = 0    # 回退 RuleBrain 次数
        self.llm_attempts = 0      # 成功发出的 LLM 调用次数
        self.retry_count = 0       # 校验失败重试次数
        self.parse_errors = 0      # 输出解析失败次数（JSON 格式/字段错误）
        self.call_failures = 0     # LLM 调用失败次数（未配置/网络/服务端错误）
        self._warned = set()       # 已告警的失败类型（避免刷屏）

    def good_decision(self, ctx) -> list:
        return self._decide('good', ctx)['targets']

    def evil_decision(self, ctx):
        # 无可用卡/无可行动反派 → 直接跳过（不发无谓的 LLM 请求）
        from services.game_engine import get_active_villains
        if not any(c for c in ctx.hand_cards if not c['used']):
            return None
        if not get_active_villains(ctx.board):
            return None
        result = self._decide('evil', ctx)
        return result or None

    # ------------------------------------------------------------------
    def _decide(self, side, ctx) -> dict:
        obs = encode_observation(ctx, side)
        user_msg = json.dumps(obs, ensure_ascii=False)

        for attempt in range(2):
            try:
                # 强制 JSON 模式 + 提高 token 预算：避免推理文字截断 JSON。
                # 深度思考类模型（如 deepseek-reasoner）可能不支持 response_format，
                # 设置 AGENT_LLM_NO_JSON_MODE=1 时改为自然输出 + 容错解析。
                rf = None if os.environ.get('AGENT_LLM_NO_JSON_MODE') else {'type': 'json_object'}
                content = chat(build_messages(side, user_msg), max_tokens=3000,
                               response_format=rf)
                self.llm_attempts += 1  # 仅成功发出的调用计入
                result = _parse_json(content)
                ok, reason = validate(side, ctx.board, ctx.hand_cards, result)
                if ok:
                    return result
                # 校验失败：带错误重试一次
                self.retry_count += 1
                user_msg = (user_msg + '\n\n'
                            f'[系统] 你上一次的输出被判定非法：{reason}。'
                            '请严格按格式重新输出 JSON。')
            except LLMError as e:
                self.call_failures += 1
                if attempt == 1:
                    key = str(e)[:60]
                    if key not in self._warned:
                        self._warned.add(key)
                        print(f'[AgentBrain] {side} LLM 失败，回退 RuleBrain: {e}')
                else:
                    continue
            except (ValueError, KeyError, TypeError):
                # 输出不可解析（JSON 格式/字段错误）→ 提示格式后重试
                self.parse_errors += 1
                if attempt == 0:
                    user_msg = (user_msg + '\n\n'
                                '[系统] 你的上一次输出无法解析为 JSON，'
                                '请只输出推理文字 + 最后一行 JSON，不要输出其他内容。')
                    continue
                break
        self.fallback_count += 1
        return self._rule_fallback(side, ctx)

    def _rule_fallback(self, side, ctx) -> dict:
        """回退规则大脑（对局永不卡死）。"""
        if side == 'good':
            return {'targets': self._rule.good_decision(ctx)}
        action = self._rule.evil_decision(ctx)
        return action if action else {}
