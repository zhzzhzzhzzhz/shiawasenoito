"""
demo.py —— 智能体 vs 规则 AI 对战演示（P0 落地验收脚本）。

用法（在 backend-python 目录下）：
    python -m agents.demo --side good --games 20            # 智能体当正派
    python -m agents.demo --side evil --games 20            # 智能体当反派
    python -m agents.demo --side good --games 20 --difficulty hard   # 对方 hard 档

配置 LLM（OpenAI 兼容，如 DeepSeek）：
    AGENT_LLM_BASE_URL=https://api.deepseek.com/v1
    AGENT_LLM_API_KEY=sk-xxx
    AGENT_LLM_MODEL=deepseek-chat

未配置 LLM 时智能体自动回退规则 AI（演示仍可运行，胜率即"基线对基线"）。
"""
import argparse
import json
import random
import sys
import time

sys.path.insert(0, '.')

from services.game_engine import (
    create_initial_board, draw_villains, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase,
)
from agents.brain import DecisionContext
from agents.agent_brain import AgentBrain
from agents.rule_brain import RuleBrain


def play(agent_side: str, difficulty: str, agent: AgentBrain, rule: RuleBrain):
    """跑一局：agent 扮演 agent_side，RuleBrain 扮演另一侧。返回 (winner, 耗时ms)。"""
    villains = draw_villains()
    board = create_initial_board(villains)
    hand_cards = get_action_card_pool()
    history = []
    round_num = 1
    winner = None
    t_total = 0.0

    while round_num <= 6 and winner is None:
        if round_num >= 2:
            ctx = DecisionContext(side='good', round_num=round_num,
                                  phase='placement', board=board,
                                  hand_cards=hand_cards, history_rounds=history,
                                  difficulty=difficulty)
            t0 = time.perf_counter()
            targets = (agent.good_decision(ctx) if agent_side == 'good'
                       else rule.good_decision(ctx))
            t_total += time.perf_counter() - t0
            place_surveillance(board, targets, round_num)
            history.append({'round': round_num, 'phase': 'placement',
                            'type': 'surveillance', 'targets': targets})
            winner = check_win_condition(board, round_num, Phase.PLACEMENT)
            if winner:
                break

        # 第 6 回合无反派行动阶段（规则：正派行动后直接结算）
        if round_num < 6:
            ctx = DecisionContext(side='evil', round_num=round_num,
                                  phase='action', board=board,
                                  hand_cards=hand_cards, history_rounds=history,
                                  difficulty=difficulty)
            t0 = time.perf_counter()
            action = (agent.evil_decision(ctx) if agent_side == 'evil'
                      else rule.evil_decision(ctx))
            t_total += time.perf_counter() - t0
            if action:
                card = next(c for c in hand_cards if c['index'] == action['cardIndex'])
                card['used'] = True
                for a in action['actions']:
                    place_death_marker(board, a['villainId'], a['targetId'],
                                       a['shape'], round_num)
                history.append({'round': round_num, 'phase': 'action', 'type': 'death',
                                'cardIndex': action['cardIndex'],
                                'deathMarkers': action['actions']})
            else:
                history.append({'round': round_num, 'phase': 'action',
                                'type': 'skip', 'reason': 'no_action'})

        execute_death_markers(board, round_num)
        winner = check_win_condition(board, round_num, Phase.REVEAL)
        expire_surveillance(board)
        history.append({'round': round_num, 'phase': 'reveal',
                        'marked': [], 'winner': winner})
        if winner:
            break
        round_num += 1

    return (winner if winner else 'evil'), t_total * 1000


def main():
    ap = argparse.ArgumentParser(description='智能体 vs 规则 AI 对战演示')
    ap.add_argument('--side', default='good', choices=['good', 'evil'])
    ap.add_argument('--games', type=int, default=20)
    ap.add_argument('--difficulty', default='normal',
                    choices=['easy', 'normal', 'hard'], help='对方规则 AI 档位')
    args = ap.parse_args()

    agent = AgentBrain()
    rule = RuleBrain()
    wins_agent = 0
    total_t = 0.0
    for i in range(args.games):
        w, t = play(args.side, args.difficulty, agent, rule)
        total_t += t
        if (args.side == 'good' and w == 'good') or (args.side == 'evil' and w == 'evil'):
            wins_agent += 1
    print(f'\n=== 智能体（{args.side}） vs RuleBrain（{args.difficulty}） ===')
    print(f'局数 {args.games} | 智能体胜 {wins_agent} 局 '
          f'({wins_agent/args.games*100:.0f}%) | 平均每局 {total_t/args.games:.0f}ms')
    print(f'AgentBrain: LLM 调用 {agent.llm_attempts} 次 | '
          f'校验重试 {agent.retry_count} 次 | 回退规则 {agent.fallback_count} 次')
    if agent.llm_attempts == 0:
        print('提示：LLM 未配置（AGENT_LLM_BASE_URL/API_KEY），全部回退规则 AI。'
              '配置后重跑即为真实智能体对战。')


if __name__ == '__main__':
    main()
