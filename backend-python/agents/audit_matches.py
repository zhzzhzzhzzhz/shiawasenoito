"""
audit_matches.py —— 双人对局录制数据审计器。

对 backend-python/dataset/ 下的 match 记录做五层审计：
    1. 结构检查：必填字段、villains/winner 合法性、steps 非空
    2. 顺序检查：steps 时间顺序、回合边界（R1 无监视、R6 无反派行动）
    3. 动作合法性：逐 step 用引擎校验器重判（监视 3 目标 / 满员 / 范围内 / 禁同伙）
    4. 快照一致性：每步 state.board 与回放到该时刻的棋盘逐格比对（抓快照时机 bug）
    5. 胜负一致性：按 steps 回放整局，最终胜者必须与记录的 winner 一致

用法：python -m agents.audit_matches [--dir backend-python/dataset] [--self-test]
输出：逐局审计报告（PASS/FAIL + 问题清单），FAIL 的局即坏样本。
"""
import argparse
import copy
import glob
import json
import os
import sys

sys.path.insert(0, '.')

from services.game_engine import (
    create_initial_board, draw_villains, get_action_card_pool,
    place_surveillance, place_death_marker, execute_death_markers,
    expire_surveillance, check_win_condition, Phase,
)
from agents.validator import validate

BOARD_FIELDS = ('id', 'row', 'col', 'role', 'status', 'hasDeathMarker',
                'deathMarkerShape', 'deathMarkerRound', 'hasSurveillance',
                'surveillanceActive', 'surveillanceExpired')


def _board_sig(board):
    return [[c.get(f) for f in BOARD_FIELDS] for c in board]


def _check_struct(rec, issues):
    for k in ('roomId', 'mode', 'villains', 'winner', 'totalRounds', 'steps'):
        if k not in rec:
            issues.append(f'缺字段 {k}')
    if len(rec.get('villains', [])) != 3:
        issues.append(f'villains 应为 3 个，实际 {len(rec.get("villains", []))}')
    if rec.get('winner') not in ('good', 'evil'):
        issues.append(f'winner 非法: {rec.get("winner")}')
    if not rec.get('steps'):
        issues.append('steps 为空（整局无决策记录）')


def _check_order(steps, issues):
    prev_r = 0
    for i, s in enumerate(steps):
        if s.get('type') not in ('good_watch', 'evil_action'):
            issues.append(f'step[{i}] 类型非法: {s.get("type")}')
            continue
        r = s.get('round')
        if not isinstance(r, int) or not 1 <= r <= 6:
            issues.append(f'step[{i}] 回合非法: {r}')
            continue
        if s['type'] == 'good_watch' and r < 2:
            issues.append(f'step[{i}] 第 1 回合不存在正派监视')
        if s['type'] == 'evil_action' and r >= 6:
            issues.append(f'step[{i}] 第 6 回合无反派行动阶段')
        if r < prev_r:
            issues.append(f'step[{i}] 回合回退（R{r} 出现在 R{prev_r} 之后）')
        prev_r = r
    # 同回合重复决策检测
    seen = {}
    for i, s in enumerate(steps):
        key = (s.get('type'), s.get('round'))
        seen[key] = seen.get(key, 0) + 1
    for (t, r), n in seen.items():
        if n > 1:
            issues.append(f'{t} R{r} 出现 {n} 次（重复决策）')


def _replay(rec, issues):
    """按 steps 回放整局：动作合法性 + 快照一致性 + 胜负一致性。"""
    villains = rec['villains']
    board = create_initial_board(villains)
    hand = get_action_card_pool()
    replay_winner = None

    for i, s in enumerate(rec['steps']):
        if s.get('type') not in ('good_watch', 'evil_action'):
            continue
        r = s.get('round')
        action = s.get('action') or {}
        # 动作合法性（与线上同口径校验器）
        ok, err = validate(s['type'].replace('good_watch', 'good').replace('evil_action', 'evil'),
                           board, hand, action)
        if not ok:
            issues.append(f'step[{i}] 动作非法: {err}')
        # 快照一致性（逐格比对决策前棋盘）
        snap = (s.get('state') or {}).get('board')
        if snap and _board_sig(snap) != _board_sig(board):
            issues.append(f'step[{i}] 棋盘快照与回放状态不一致（快照时机/深拷贝 bug）')
        # 应用动作
        if s['type'] == 'good_watch':
            place_surveillance(board, action.get('targets', []), r)
            w = check_win_condition(board, r, Phase.PLACEMENT)
            if w:
                replay_winner = w
        else:
            card = next((c for c in hand if c['index'] == action.get('cardIndex')), None)
            if card:
                card['used'] = True
                for a in action.get('actions', []):
                    place_death_marker(board, a['villainId'], a['targetId'], a['shape'], r)
        if s['type'] == 'evil_action':
            execute_death_markers(board, r)
            w = check_win_condition(board, r, Phase.REVEAL)
            if w:
                replay_winner = w
            expire_surveillance(board)
        if replay_winner:
            if i != len(rec['steps']) - 1:
                issues.append(f'step[{i}] 已分出胜负（{replay_winner}），其后仍有 {len(rec["steps"]) - 1 - i} 步多余记录')

    final = replay_winner or 'evil'
    if final != rec['winner']:
        issues.append(f'胜负不一致：回放={final}，记录={rec["winner"]}')


def audit(rec):
    issues = []
    _check_struct(rec, issues)
    _check_order(rec.get('steps', []), issues)
    if not issues or all('缺字段' not in x and 'steps 为空' not in x for x in issues):
        try:
            _replay(rec, issues)
        except Exception as e:
            issues.append(f'回放异常: {e}')
    return issues


def _self_test():
    """合成一局规则 AI 对局（合法样本）+ 一处篡改（坏样本），验证审计器判定。"""
    from agents.rule_brain import RuleBrain
    from agents.brain import DecisionContext
    villains = draw_villains()
    board = create_initial_board(villains)
    hand = get_action_card_pool()
    history, steps = [], []
    winner, r = None, 1
    good_brain, evil_brain = RuleBrain(), RuleBrain()
    while r <= 6 and winner is None:
        if r >= 2:
            steps.append({'type': 'good_watch', 'round': r,
                          'state': {'board': copy.deepcopy(board),
                                    'history': copy.deepcopy(history)}})
            ctx = DecisionContext(side='good', round_num=r, phase='placement',
                                  board=board, hand_cards=hand, history_rounds=history)
            targets = good_brain.good_decision(ctx)
            steps[-1]['action'] = {'targets': targets}
            place_surveillance(board, targets, r)
            winner = check_win_condition(board, r, Phase.PLACEMENT)
            if winner:
                break
        if r < 6:
            steps.append({'type': 'evil_action', 'round': r,
                          'state': {'board': copy.deepcopy(board),
                                    'handCards': copy.deepcopy(hand),
                                    'history': copy.deepcopy(history)}})
            ctx = DecisionContext(side='evil', round_num=r, phase='action',
                                  board=board, hand_cards=hand, history_rounds=history)
            action = evil_brain.evil_decision(ctx)
            steps[-1]['action'] = action
            if action:
                card = next(c for c in hand if c['index'] == action['cardIndex'])
                card['used'] = True
                for a in action['actions']:
                    place_death_marker(board, a['villainId'], a['targetId'], a['shape'], r)
        execute_death_markers(board, r)
        winner = check_win_condition(board, r, Phase.REVEAL)
        expire_surveillance(board)
        r += 1
    rec = {'roomId': 'selftest', 'mode': 'match', 'villains': villains,
           'winner': winner or 'evil', 'totalRounds': r - 1, 'steps': steps,
           'goodPlayerId': 1, 'evilPlayerId': 2}
    ok_issues = audit(rec)
    print(f'[自测] 合法样本: {"PASS" if not ok_issues else "FAIL " + str(ok_issues)}')
    # 篡改：把最后一步的动作换成非法（监视已死角色）
    bad = copy.deepcopy(rec)
    last = bad['steps'][-1]
    if last['type'] == 'good_watch':
        last['action'] = {'targets': [villains[0]] * 3}  # 重复目标 → 非法
    else:
        last['action']['actions'][0]['villainId'] = last['action']['actions'][0]['villainId']
        last['action']['actions'][0]['targetId'] = 403  # 恒死者 → 非法
    bad_issues = audit(bad)
    print(f'[自测] 坏样本: {"PASS(能抓出)" if bad_issues else "FAIL(漏检!)"} → {bad_issues[:2]}')


def main():
    ap = argparse.ArgumentParser(description='双人对局录制数据审计器')
    ap.add_argument('--dir', default='dataset')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()

    if args.self_test:
        _self_test()
        return

    files = sorted(glob.glob(os.path.join(args.dir, '*.json')))
    if not files:
        print(f'{args.dir} 下暂无对局记录（等待 RECORD_MATCH=on 录制）')
        return
    print(f'审计 {len(files)} 份对局记录：')
    bad_count = 0
    for f in files:
        try:
            rec = json.load(open(f, encoding='utf-8'))
        except Exception as e:
            print(f'[BAD] {os.path.basename(f)}: JSON 解析失败 {e}')
            bad_count += 1
            continue
        issues = audit(rec)
        if issues:
            bad_count += 1
            print(f'[BAD] {os.path.basename(f)} ({len(issues)} 项):')
            for x in issues:
                print(f'    - {x}')
        else:
            print(f'[OK ] {os.path.basename(f)}: R{rec.get("totalRounds")} '
                  f'{rec.get("winner")} 胜, {len(rec.get("steps", []))} 步')
    print(f'\n汇总: {len(files) - bad_count}/{len(files)} 通过, {bad_count} 份坏样本')


if __name__ == '__main__':
    main()
