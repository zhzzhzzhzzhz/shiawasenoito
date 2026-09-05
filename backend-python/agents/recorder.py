"""
recorder.py —— 决策点录制器（P1 数据管线）。

把对局导出为方案 §2.2 定义的数据集样本 JSON（决策点粒度），
供人工标注（S3 自对弈修正 / S5 线上回灌）与 SFT 数据构建。

用法（在 backend-python 目录下）：
    python -m agents.recorder --games 5 --out data/decision_points

输出：data/decision_points/*.json，每条样本含：
    sample_id / source / game_id / game_meta（含反派身份，供事后标注，不进入智能体观测）
    decision_point（公开状态 + 信念 + 合法动作空间，严格信息边界）
    ai_label（当次决策方大脑的选择）/ human_label / outcome / quality（留空待标注）
"""
import argparse
import copy
import json
import os
import sys
import time

sys.path.insert(0, '.')

from services.game_engine import (
    create_initial_board, draw_villains, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase, get_public_board,
)
from agents.brain import DecisionContext
from agents.rule_brain import RuleBrain
from agents.state_encoder import encode_observation


def _snapshot(side, round_num, phase, board, hand_cards, history):
    """决策点快照：公开状态 + 信念 + 合法动作空间（信息边界内）。"""
    ctx = DecisionContext(side=side, round_num=round_num, phase=phase,
                          board=board, hand_cards=hand_cards,
                          history_rounds=history)
    obs = encode_observation(ctx, side)
    return {
        'side': side,
        'round': round_num,
        'phase': phase,
        'public_state': {
            'board': obs['board'],
            'used_cards': obs['hand_cards_used'],
            'history': obs['history'],
        },
        'belief_state': obs['belief'],
        'legal_actions': obs['action_space'],
    }


def play_and_record(seed, game_index, out_dir, good_diff, evil_diff,
                    revive403=False, agent_side='none', agent=None):
    """跑一局，逐决策点导出样本。agent_side ∈ {none, good, evil, both}
    时对应侧由 LLM 智能体决策，推理链写入 ai_label.reasoning（SFT 数据）。"""
    villains = draw_villains(revive403)
    board = create_initial_board(villains, revive403)
    hand_cards = get_action_card_pool()
    history = []
    round_num = 1
    winner = None
    good_brain = agent if agent_side in ('good', 'both') else RuleBrain()
    evil_brain = agent if agent_side in ('evil', 'both') else RuleBrain()
    samples = []

    def _label(brain_name, difficulty, chosen, is_agent):
        label = {'brain': brain_name, 'difficulty': difficulty,
                 'chosen_action': chosen}
        if is_agent and agent is not None:
            label['reasoning'] = agent.last_reasoning
        return label

    while round_num <= 6 and winner is None:
        if round_num >= 2:
            samples.append(_snapshot('good', round_num, 'placement',
                                     board, hand_cards, history))
            ctx = DecisionContext(side='good', round_num=round_num,
                                  phase='placement', board=board,
                                  hand_cards=hand_cards, history_rounds=history)
            targets = good_brain.good_decision(ctx)
            samples[-1]['ai_label'] = _label(
                'AgentBrain' if agent_side in ('good', 'both') else 'RuleBrain',
                good_diff, {'targets': targets}, agent_side in ('good', 'both'))
            place_surveillance(board, targets, round_num)
            history.append({'round': round_num, 'phase': 'placement',
                            'type': 'surveillance', 'targets': targets})
            winner = check_win_condition(board, round_num, Phase.PLACEMENT)
            if winner:
                break

        # 第 6 回合无反派行动阶段（规则：正派行动后直接结算）
        if round_num < 6:
            samples.append(_snapshot('evil', round_num, 'action',
                                     board, hand_cards, history))
            ctx = DecisionContext(side='evil', round_num=round_num,
                                  phase='action', board=board,
                                  hand_cards=hand_cards, history_rounds=history)
            action = evil_brain.evil_decision(ctx)
            samples[-1]['ai_label'] = _label(
                'AgentBrain' if agent_side in ('evil', 'both') else 'RuleBrain',
                evil_diff, action or None, agent_side in ('evil', 'both'))
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

    winner = winner or 'evil'
    game_id = f'g-{game_index:04d}-r{seed}'
    out_records = []
    for i, s in enumerate(samples):
        out_records.append({
            'sample_id': f'{game_id}-{s["side"]}-r{s["round"]}-{i:02d}',
            'source': 'selfplay_raw',
            'game_id': game_id,
            'game_meta': {
                'seed': seed,
                'villains': villains,          # 仅用于事后标注/评测，绝不进入智能体观测
                'good_difficulty': good_diff,
                'evil_difficulty': evil_diff,
                'revive403': revive403,
                'result': winner,
                'total_rounds': round_num,
            },
            'decision_point': s,
            'ai_label': s.pop('ai_label', None),
            'human_label': None,
            'outcome': None,
            'quality': None,
        })
    return out_records


def main():
    ap = argparse.ArgumentParser(description='决策点录制器（P1 数据管线）')
    ap.add_argument('--games', type=int, default=5)
    ap.add_argument('--out', default='data/decision_points')
    ap.add_argument('--good', default='normal', choices=['easy', 'normal', 'hard'])
    ap.add_argument('--evil', default='normal', choices=['easy', 'normal', 'hard'])
    ap.add_argument('--revive', action='store_true', help='启用 403 复活变体')
    ap.add_argument('--agent-side', default='none',
                    choices=['none', 'good', 'evil', 'both'],
                    help='由 LLM 智能体决策的一侧（需配置 AGENT_LLM_*，推理链入 ai_label.reasoning）')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    agent = None
    if args.agent_side != 'none':
        from agents.agent_brain import AgentBrain
        agent = AgentBrain()
    t0 = time.perf_counter()
    total = 0
    for i in range(args.games):
        seed = (int(time.time() * 1000) + i) % 100000
        records = play_and_record(seed, i, args.out, args.good, args.evil,
                                  revive403=args.revive, agent_side=args.agent_side,
                                  agent=agent)
        with open(os.path.join(args.out, f'{records[0]["game_id"]}.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=1)
        total += len(records)
    print(f'已导出 {args.games} 局 → {total} 条决策点样本 → {args.out}/'
          f'（耗时 {time.perf_counter() - t0:.1f}s）')
    print('样本 source=selfplay_raw（弱监督）；人工修正/标注后升级为 '
          'human_thinkaloud / selfplay_corrected。')


if __name__ == '__main__':
    main()
