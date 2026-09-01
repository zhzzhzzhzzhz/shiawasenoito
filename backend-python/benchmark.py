"""
AI 对战基准测试 —— 三档 AI 互相对战。

输出：正派胜率矩阵 + 正派监视命中率矩阵（推理精度）+ 单局决策耗时。
命中率 = 正派每次监视决策平均命中反派数（0~3），比胜率更能反映推理梯度。

用法：python benchmark.py [每格局数]  （默认 100）
"""
import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.game_engine import (
    create_initial_board, draw_villains, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase,
)
from ai.good_ai import good_ai
from ai.evil_ai import evil_ai

DIFFS = ['easy', 'normal', 'hard']


def play_game(good_diff, evil_diff):
    """跑一局，返回 (winner, 决策耗时ms, 命中反派数, 监视决策次数)。"""
    villains = draw_villains()
    board = create_initial_board(villains)
    hand_cards = get_action_card_pool()
    history = []

    winner = None
    round_num = 1
    t_total = 0.0
    hits = 0
    watches = 0

    while round_num <= 6 and winner is None:
        # 阶段1：正派放监视（第 1 回合跳过）
        if round_num >= 2:
            t0 = time.perf_counter()
            targets = good_ai(board, good_diff, history)
            t_total += time.perf_counter() - t0
            place_surveillance(board, targets, round_num)
            # 统计命中：targets 中真实反派的数量
            role = {c['id']: c['role'] for c in board}
            hits += sum(1 for t in targets if role.get(t) == 'evil')
            watches += 1
            history.append({'round': round_num, 'phase': 'placement',
                            'type': 'surveillance', 'targets': targets})
            winner = check_win_condition(board, round_num, Phase.PLACEMENT)
            if winner:
                break

        # 阶段2：反派行动
        t0 = time.perf_counter()
        action = evil_ai(board, hand_cards, evil_diff, round_num, history)
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

        # 阶段3：结算
        execute_death_markers(board, round_num)
        winner = check_win_condition(board, round_num, Phase.REVEAL)
        expire_surveillance(board)
        history.append({'round': round_num, 'phase': 'reveal',
                        'marked': [], 'winner': winner})

        if winner:
            break
        round_num += 1

    if winner is None:
        winner = 'evil'

    return winner, t_total * 1000, hits, watches


def sanity_check():
    """完美正派（直接监视真实反派）应能赢，验证游戏循环正确性。"""
    wins = 0
    for _ in range(20):
        villains = draw_villains()
        board = create_initial_board(villains)
        hand_cards = get_action_card_pool()
        history = []
        winner = None
        round_num = 1
        while round_num <= 6 and winner is None:
            if round_num >= 2:
                # 作弊：直接监视真实反派
                targets = villains
                place_surveillance(board, targets, round_num)
                history.append({'round': round_num, 'phase': 'placement',
                                'type': 'surveillance', 'targets': targets})
                winner = check_win_condition(board, round_num, Phase.PLACEMENT)
                if winner:
                    break
            action = evil_ai(board, hand_cards, 'easy', round_num, history)
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
        if winner == 'good':
            wins += 1
    print(f"\n[Sanity Check] 完美正派（作弊监视真实反派）20 局胜 {wins} 局 "
          f"→ {'游戏循环正确' if wins == 20 else '存在异常，需排查'}\n")
    return wins == 20


def run_matrix(games_per_cell):
    print(f"\n三档对战矩阵（每格 {games_per_cell} 局，行=正派难度，列=反派难度）\n")

    # 胜率矩阵
    print("【正派胜率】")
    print(f"{'正派\\反派':<10}" + "".join(f"{d:>12}" for d in DIFFS))
    res = {}
    for good_diff in DIFFS:
        row = [f"{good_diff:<10}"]
        for evil_diff in DIFFS:
            wins = 0
            total_t = 0.0
            total_hits = 0
            total_watches = 0
            for _ in range(games_per_cell):
                w, t, h, wc = play_game(good_diff, evil_diff)
                total_t += t
                total_hits += h
                total_watches += wc
                if w == 'good':
                    wins += 1
            res[(good_diff, evil_diff)] = (wins / games_per_cell,
                                           total_t / games_per_cell,
                                           total_hits / max(total_watches, 1))
            row.append(f"{wins/games_per_cell*100:>11.1f}%")
        print("".join(row))

    # 命中率矩阵
    print("\n【正派监视命中率（每次决策平均命中反派数 0~3，越高推理越准）】")
    print(f"{'正派\\反派':<10}" + "".join(f"{d:>12}" for d in DIFFS))
    for good_diff in DIFFS:
        row = [f"{good_diff:<10}"]
        for evil_diff in DIFFS:
            row.append(f"{res[(good_diff, evil_diff)][2]:>11.2f}")
        print("".join(row))

    # 耗时矩阵
    print("\n【单局决策耗时（ms）】")
    print(f"{'正派\\反派':<10}" + "".join(f"{d:>12}" for d in DIFFS))
    for good_diff in DIFFS:
        row = [f"{good_diff:<10}"]
        for evil_diff in DIFFS:
            row.append(f"{res[(good_diff, evil_diff)][1]:>11.1f}")
        print("".join(row))

    return res


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    sanity_check()
    run_matrix(n)
