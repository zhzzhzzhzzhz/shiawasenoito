"""
正派 AI 系统 — 简单(随机) | 普通(贝叶斯推断) | 困难(一层极小化)
"""
import random
from itertools import combinations
from services.game_engine import (
    get_surveillance_candidates, char_id_to_pos, ACTION_CARD_POOL,
)
from ai.bayes import build_inference
from ai.evil_ai import _greedy_selection
from ai.config import GOOD_HARD_WEIGHTS


def good_ai(board, difficulty, history_rounds=None, extra=False):
    """返回监视目标编号列表。extra=True 时返回 1 个（附加监视，已废弃调用）。"""
    if history_rounds is None:
        history_rounds = []
    n = 1 if extra else 3
    if difficulty == 'easy':
        return _good_easy(board, n)
    elif difficulty == 'hard':
        return _good_hard(board, history_rounds, n)
    else:
        return _good_normal(board, history_rounds, n)


def _good_easy(board, n=3):
    """简单难度：随机选 n 个"""
    candidates = get_surveillance_candidates(board)
    random.shuffle(candidates)
    return [c['id'] for c in candidates[:n]]


def _good_normal(board, history_rounds, n=3):
    """普通难度：真实贝叶斯推断 + 边际嫌疑排序"""
    inf = _build_inference(board, history_rounds)
    marg = inf.marginal()
    candidates = get_surveillance_candidates(board)
    ranked = sorted(candidates, key=lambda c: marg.get(c['id'], 0.0), reverse=True)
    return [c['id'] for c in ranked[:n]]


def _build_inference(board, history_rounds):
    """从历史回合记录构建反派身份推断器（严格信息边界，不读 villainId/role）。"""
    return build_inference(board, history_rounds)


def _good_hard(board, history_rounds, n=3):
    """困难难度：贝叶斯推断 + 一层极小化（模拟反派最优响应）。"""
    inf = _build_inference(board, history_rounds)
    marg = inf.marginal()
    candidates = get_surveillance_candidates(board)
    ranked = sorted(candidates, key=lambda c: marg.get(c['id'], 0.0), reverse=True)
    top8 = ranked[:8]

    if n == 1:
        return [top8[0]['id']] if top8 else []
    if len(top8) < 3:
        return [c['id'] for c in top8]

    suspect_ids = [c['id'] for c in top8[:3]]  # 边际 top3 近似反派组合

    best_plan = None
    best_score = float('-inf')
    for plan in combinations([c['id'] for c in top8], 3):
        s = _score_plan(plan, marg, suspect_ids, board)
        if s > best_score:
            best_score = s
            best_plan = list(plan)

    return best_plan or [c['id'] for c in top8[:3]]


def _score_plan(plan, marg, suspect_ids, board):
    """评估监视方案：命中期望 + 分散度 − 反派最优击杀收益。

    注（2026-09-02 实验记录）：曾将击杀惩罚项替换为"反派对抗泄漏度"奖励项，
    实验证伪——该度量与命中项先天冲突（行动的反派越多泄漏度越大，诱导正派
    主动放低命中），hard 档胜率从 48% 崩至 14%。已回退。击杀收益惩罚虽模拟
    旧版反派，但与对抗反派的行为正相关（都避开高嫌疑目标），作为启发式无害。
    """
    hit = sum(marg.get(x, 0.0) for x in plan)
    rows = {char_id_to_pos(x)['row'] for x in plan}
    cols = {char_id_to_pos(x)['col'] for x in plan}
    spread = len(rows) + len(cols)
    kill = _simulate_villain_response(board, suspect_ids, plan, marg)
    return (hit
            + GOOD_HARD_WEIGHTS['lambda_spread'] * spread
            - GOOD_HARD_WEIGHTS['lambda_kill'] * kill)


def _simulate_villain_response(board, suspect_ids, plan, marg):
    """模拟反派（假设 suspect_ids 为反派）在监视 plan 下的最优击杀收益。

    严格信息边界：用"假设身份"构造模拟棋盘，绝不读取真实 role。
    """
    suspect_set = set(suspect_ids)
    plan_set = set(plan)
    active_ids = [v for v in suspect_ids if v not in plan_set]
    if not active_ids:
        return 0.0  # 假设全部命中，反派无法行动

    # 构造假设棋盘：suspect_ids 视为反派，其余（非403）视为正派
    sim_board = []
    for c in board:
        sc = dict(c)
        if c['id'] in suspect_set:
            sc['role'] = 'evil'
        elif c['id'] != 403:
            sc['role'] = 'good'
        sim_board.append(sc)

    active_set = set(active_ids)
    villains = [c for c in sim_board
                if c['id'] in active_set and c['status'] == 'alive']
    if not villains:
        return 0.0

    best = 0.0
    for card in ACTION_CARD_POOL:
        m = min(len(card['actions']), len(villains))
        if m == 0:
            continue
        score, _ = _greedy_selection(card, villains, sim_board, m, 1, marg)
        best = max(best, score)
    return best
