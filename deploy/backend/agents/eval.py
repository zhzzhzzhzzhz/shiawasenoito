"""
eval.py —— L1 评测 harness（方案 §3.2：基础操作阶段）。

用法（在 backend-python 目录下）：
    python -m agents.eval --side good --games 30 --difficulty normal

指标口径（与方案 §3.0 对齐）：
    - 合法率       = 智能体输出一次通过校验（含重试后通过）的决策占比
    - 格式正确率   = 1 − 解析失败次数 / 成功发出的 LLM 调用次数
    - 回退率       = 回退 RuleBrain 的决策占比（≥5% 判异常，提示词/校验链需回炉）
    - 延迟         = 单决策耗时 P50 / P95（云端档目标 P95 ≤ 3s）
    - 边界场景     = 编码器/校验器在极端局面上的确定性检查（不需 LLM）

未配置 LLM 时回退率 = 100%，harness 仍可运行（用于验证管线本身）。
"""
import argparse
import sys
import time

sys.path.insert(0, '.')

from services.game_engine import (
    create_initial_board, draw_villains, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase, get_active_villains,
    get_surveillance_candidates,
)
from agents.brain import DecisionContext
from agents.agent_brain import AgentBrain
from agents.rule_brain import RuleBrain
from agents.state_encoder import encode_observation, _action_space
from agents.validator import validate


def run_games(side, difficulty, n, agent, rule, stats):
    for _ in range(n):
        winner = _play_one(side, difficulty, agent, rule, stats)
        if winner == ('good' if side == 'good' else 'evil'):
            stats['wins_agent'] += 1


def _play_one(agent_side, difficulty, agent, rule, stats):
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
                                  difficulty=difficulty)
            t0 = time.perf_counter()
            prev = (agent.fallback_count, agent.retry_count, agent.parse_errors)
            targets = (agent.good_decision(ctx) if agent_side == 'good'
                       else rule.good_decision(ctx))
            if agent_side == 'good':
                stats['latency'].append((time.perf_counter() - t0) * 1000)
                stats['decisions'] += 1
                if agent.fallback_count > prev[0]:
                    stats['fallbacks'] += 1
                elif agent.retry_count > prev[1]:
                    stats['legal_after_retry'] += 1
                else:
                    stats['first_try_legal'] += 1
            # L2 指标：正派监视命中统计（与 benchmark 同口径）
            role = {c['id']: c['role'] for c in board}
            stats['good_hits'] += sum(1 for t in targets if role.get(t) == 'evil')
            stats['good_watches'] += 1
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
            prev = (agent.fallback_count, agent.retry_count, agent.parse_errors)
            action = (agent.evil_decision(ctx) if agent_side == 'evil'
                      else rule.evil_decision(ctx))
            if agent_side == 'evil':
                stats['latency'].append((time.perf_counter() - t0) * 1000)
                stats['decisions'] += 1
                if agent.fallback_count > prev[0]:
                    stats['fallbacks'] += 1
                elif agent.retry_count > prev[1]:
                    stats['legal_after_retry'] += 1
                else:
                    stats['first_try_legal'] += 1
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

    return winner if winner else 'evil'


def run_edge_checks():
    """边界场景确定性检查：编码器与校验器在极端局面上不崩、不泄漏。"""
    checks = []

    # 1. 仅剩 3 个存活候选（正派必须且只能选这 3 个）
    board = create_initial_board([201, 202, 203])
    for c in board:
        if c['id'] not in (201, 202, 203, 403):
            c['status'] = 'dead'
    space = _action_space(board, get_action_card_pool(), 'good')
    checks.append(('仅剩3候选', sorted(space['candidates']) == [201, 202, 203]))

    # 2. 全部反派被监视 → 无可行动反派（反派动作空间为空、合法率不受影响）
    board2 = create_initial_board([301, 302, 303])
    for c in board2:
        if c['id'] in (301, 302, 303):
            c['hasSurveillance'] = True
            c['surveillanceActive'] = True
    active = get_active_villains(board2)
    checks.append(('全监视无可行动反派', active == []))

    # 3. 复活变体：403 入候选
    board3 = create_initial_board([403, 201, 202], revive403=True)
    cands = [c['id'] for c in get_surveillance_candidates(board3)]
    checks.append(('403复活入候选', 403 in cands))

    # 4. 编码器信息边界：正派观测无身份、反派全知
    board4 = create_initial_board([501, 502, 503])
    ctx = DecisionContext(side='good', round_num=2, phase='placement',
                          board=board4, hand_cards=get_action_card_pool(),
                          history_rounds=[])
    obs = encode_observation(ctx, 'good')
    checks.append(('正派观测零身份', all(c['role'] == 'unknown' for c in obs['board'])))
    obs_e = encode_observation(
        DecisionContext(side='evil', round_num=1, phase='action',
                        board=board4, hand_cards=get_action_card_pool(),
                        history_rounds=[]), 'evil')
    checks.append(('反派观测含身份', any(c['role'] == 'evil' for c in obs_e['board'])))

    # 5. 校验器：满员 / 禁同伙 / 范围内 / 互异 拒绝
    board5 = create_initial_board([401, 402, 404])
    ok, _ = validate('good', board5, [], {'targets': [401, 401, 402]})
    checks.append(('监视互异校验', not ok))
    ok6, _ = validate('evil', board5, get_action_card_pool(),
                      {'cardIndex': 0, 'actions': [{'villainId': 401, 'targetId': 402, 'shape': '十字'}]})
    checks.append(('禁标同伙校验', not ok6))

    passed = sum(1 for _, r in checks if r)
    for name, r in checks:
        print(f'  [{"PASS" if r else "FAIL"}] {name}')
    print(f'边界场景 {passed}/{len(checks)} 通过')
    return passed == len(checks)


def _pct(x):
    import statistics
    if not x:
        return 'n/a'
    return f'{statistics.median(x):.0f}ms / {sorted(x)[int(len(x) * 0.95) - 1]:.0f}ms'


def main():
    ap = argparse.ArgumentParser(description='L1 评测：智能体基础操作能力')
    ap.add_argument('--side', default='good', choices=['good', 'evil'])
    ap.add_argument('--games', type=int, default=30)
    ap.add_argument('--difficulty', default='normal',
                    choices=['easy', 'normal', 'hard'])
    args = ap.parse_args()

    agent = AgentBrain()
    rule = RuleBrain()
    stats = {'decisions': 0, 'fallbacks': 0, 'first_try_legal': 0,
             'legal_after_retry': 0, 'latency': [],
             'wins_agent': 0, 'good_hits': 0, 'good_watches': 0}

    t0 = time.perf_counter()
    run_games(args.side, args.difficulty, args.games, agent, rule, stats)
    elapsed = time.perf_counter() - t0

    d = stats['decisions']
    legal = stats['first_try_legal'] + stats['legal_after_retry']
    fmt_ok = (1 - agent.parse_errors / agent.llm_attempts
              if agent.llm_attempts else None)
    print(f'\n=== L1 评测报告（智能体扮演 {args.side}，对手 RuleBrain-{args.difficulty}，{args.games} 局） ===')
    print(f'决策总数          : {d}')
    print(f'合法率            : {legal}/{d} = {legal/d*100:.1f}%  '
          f'(一次通过 {stats["first_try_legal"]}，重试通过 {stats["legal_after_retry"]})')
    print(f'回退率            : {stats["fallbacks"]}/{d} = {stats["fallbacks"]/d*100:.1f}% '
          f'{"（≥5% 判异常，回炉提示词）" if d and stats["fallbacks"]/d >= 0.05 else ""}')
    print(f'格式正确率        : {fmt_ok*100:.1f}%' if fmt_ok is not None
          else '格式正确率        : n/a（无 LLM 调用）')
    print(f'LLM 调用/失败     : {agent.llm_attempts} / {agent.call_failures}')
    print(f'决策延迟 P50/P95  : {_pct(stats["latency"])}')
    print(f'总耗时            : {elapsed:.1f}s')
    # ---- L2 指标（与 benchmark 同口径） ----
    hit = stats['good_hits'] / stats['good_watches'] if stats['good_watches'] else 0
    print(f'\n--- L2 指标（与 benchmark 同口径） ---')
    print(f'智能体胜率        : {stats["wins_agent"]}/{args.games} = '
          f'{stats["wins_agent"]/args.games*100:.0f}%')
    if args.side == 'good':
        print(f'智能体监视命中率  : {hit:.2f}（每次决策平均命中反派数，参照规则基线 easy1.8/normal1.7/hard1.7）')
    else:
        print(f'对手正派命中率    : {hit:.2f}（越低代表智能体隐蔽性越好，规则反派 hard 档 ≈0.68）')
    if agent.llm_attempts == 0:
        print('\n提示：LLM 未配置，以上为回退路径自检（回退率 100% 属预期）。')
        print('配置 AGENT_LLM_BASE_URL/API_KEY 后重跑即为真实 L1 评测。')

    print('\n--- 边界场景检查 ---')
    edge_ok = run_edge_checks()
    if not edge_ok:
        sys.exit(1)


if __name__ == '__main__':
    main()
