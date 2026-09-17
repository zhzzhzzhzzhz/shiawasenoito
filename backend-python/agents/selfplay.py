"""selfplay.py —— 同模型自对弈评测（14B vs 14B 内斗）。

双方均用 AgentBrain（正派 good_decision / 反派 evil_decision），
共用同一个 LLM 端点（AGENT_LLM_BASE_URL）。统计双方胜率、对局长度、
合法率与回退率，检验模型左右手策略平衡性。

用法：AGENT_LLM_BASE_URL=http://127.0.0.1:8001/v1 AGENT_LLM_API_KEY=dummy \
      AGENT_LLM_TIMEOUT=300 python -m agents.selfplay --games 10
"""
import argparse
import sys
import time

sys.path.insert(0, '.')

from agents.agent_brain import AgentBrain
from agents.brain import DecisionContext
from services.game_engine import (
    draw_villains, create_initial_board, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase,
)


def play_one(good_agent, evil_agent, stats):
    villains = draw_villains()
    board = create_initial_board(villains)
    hand_cards = get_action_card_pool()
    history = []
    round_num = 1
    winner = None

    while round_num <= 6 and winner is None:
        if round_num >= 2:
            ctx = DecisionContext(side='good', round_num=round_num,
                                  phase='placement', board=board,
                                  hand_cards=hand_cards, history_rounds=history,
                                  difficulty='normal')
            t0 = time.perf_counter()
            targets = good_agent.good_decision(ctx)
            stats['good_latency'].append((time.perf_counter() - t0) * 1000)
            stats['good_decisions'] += 1
            if good_agent.fallback_count > stats['prev_good_fb']:
                stats['good_fallbacks'] += 1
            stats['prev_good_fb'] = good_agent.fallback_count
            place_surveillance(board, targets, round_num)
            history.append({'round': round_num, 'phase': 'placement',
                            'type': 'surveillance', 'targets': targets})
            winner = check_win_condition(board, round_num, Phase.PLACEMENT)
            if winner:
                break

        if round_num < 6:
            ctx = DecisionContext(side='evil', round_num=round_num,
                                  phase='action', board=board,
                                  hand_cards=hand_cards, history_rounds=history,
                                  difficulty='normal')
            t0 = time.perf_counter()
            action = evil_agent.evil_decision(ctx)
            stats['evil_latency'].append((time.perf_counter() - t0) * 1000)
            stats['evil_decisions'] += 1
            if evil_agent.fallback_count > stats['prev_evil_fb']:
                stats['evil_fallbacks'] += 1
            stats['prev_evil_fb'] = evil_agent.fallback_count
            if action:
                card = next(c for c in hand_cards if c['index'] == action['cardIndex'])
                card['used'] = True
                for a in action['actions']:
                    place_death_marker(board, a['villainId'], a['targetId'],
                                       a['shape'], round_num)
                history.append({'round': round_num, 'phase': 'action',
                                'type': 'death', 'cardIndex': action['cardIndex'],
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

    stats['rounds'].append(round_num)
    return winner if winner else 'evil'


def main():
    ap = argparse.ArgumentParser(description='同模型自对弈（双 AgentBrain 互搏）')
    ap.add_argument('--games', type=int, default=10)
    args = ap.parse_args()

    good = AgentBrain()
    evil = AgentBrain()
    stats = {'wins_good': 0, 'wins_evil': 0, 'rounds': [],
             'good_decisions': 0, 'evil_decisions': 0,
             'good_fallbacks': 0, 'evil_fallbacks': 0,
             'good_latency': [], 'evil_latency': [],
             'prev_good_fb': 0, 'prev_evil_fb': 0}

    t0 = time.perf_counter()
    for _ in range(args.games):
        w = play_one(good, evil, stats)
        if w == 'good':
            stats['wins_good'] += 1
        else:
            stats['wins_evil'] += 1
    elapsed = time.perf_counter() - t0

    import statistics
    med = lambda x: f'{statistics.median(x)/1000:.1f}s' if x else 'n/a'
    print(f'\n=== 自对弈报告（同模型 good vs evil，{args.games} 局） ===')
    print(f'正派胜 : 反派胜 = {stats["wins_good"]} : {stats["wins_evil"]}')
    print(f'平均对局长度    : {sum(stats["rounds"])/len(stats["rounds"]):.1f} 回合')
    print(f'正派决策/回退   : {stats["good_decisions"]} / {stats["good_fallbacks"]}')
    print(f'反派决策/回退   : {stats["evil_decisions"]} / {stats["evil_fallbacks"]}')
    print(f'正派延迟 P50    : {med(stats["good_latency"])}')
    print(f'反派延迟 P50    : {med(stats["evil_latency"])}')
    print(f'LLM 调用/失败   : {good.llm_attempts + evil.llm_attempts} / '
          f'{good.call_failures + evil.call_failures}')
    print(f'总耗时          : {elapsed:.0f}s')
    print('=== SELFPLAY_DONE ===')


if __name__ == '__main__':
    main()
