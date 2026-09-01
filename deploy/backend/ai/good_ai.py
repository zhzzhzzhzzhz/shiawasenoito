"""
正派 AI 系统 — 简单(随机) | 普通(概率推断) | 困难(TODO)
"""
import random
from services.game_engine import get_surveillance_candidates, char_id_to_pos, get_affected_char_ids


def good_ai(board: list, difficulty: str, history_rounds: list = None,
            extra: bool = False) -> list:
    """返回监视目标编号列表
    extra=False: 返回3个初始监视目标
    extra=True:  返回1个附加监视目标（公示后推理）
    """
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
    """普通难度：概率推断 + 边际嫌疑排序"""
    suspects = _calculate_marginal_probabilities(board, history_rounds)
    sorted_suspects = sorted(
        [s for s in suspects if s['status'] == 'alive' and s['id'] != 403
         and not s.get('hasDeathMarker')],
        key=lambda x: x['probability'], reverse=True
    )
    return [s['id'] for s in sorted_suspects[:n]]


def _calculate_marginal_probabilities(board, history_rounds):
    """计算边际嫌疑概率"""
    alive_chars = [c for c in board if c['status'] == 'alive' and c['id'] != 403
                   and not c.get('hasDeathMarker')]
    probs = {c['id']: 1.0 for c in alive_chars}

    for rd in history_rounds:
        death_markers = rd.get('deathMarkers', [])
        k = len(death_markers)
        if k == 0:
            continue

        # 找该回合"存活+未监视"的角色
        snapshot = rd.get('boardSnapshot', board)
        alive_not_watched = {
            c['id'] for c in snapshot
            if c['status'] == 'alive' and
            not (c.get('hasSurveillance') and c.get('surveillanceActive'))
        }

        for cid in list(probs.keys()):
            if cid not in alive_not_watched:
                probs[cid] *= 0.5
            else:
                probs[cid] *= 1.2

    total = sum(probs.values()) or 1
    return [
        {'id': cid, 'probability': val / total * 100,
         'status': next((c['status'] for c in board if c['id'] == cid), 'unknown'),
         'hasDeathMarker': next((c.get('hasDeathMarker') for c in board if c['id'] == cid), False)}
        for cid, val in probs.items()
    ]


def _good_hard(board, history_rounds, n=3):
    """困难难度：约束传播 + 模拟搜索"""
    suspects = _calculate_marginal_probabilities(board, history_rounds)
    top = sorted(
        [s for s in suspects if s['status'] == 'alive' and s['id'] != 403
         and not s.get('hasDeathMarker')],
        key=lambda x: x['probability'], reverse=True
    )[:8]

    if n == 1:
        # 附加监视：直接选最高嫌疑
        return [top[0]['id']] if top else []

    plans = _combinations([s['id'] for s in top], 3)
    best_plan = None
    best_score = float('-inf')

    for plan in plans:
        score = _evaluate_plan(plan, top)
        if score > best_score:
            best_score = score
            best_plan = plan

    return best_plan or [s['id'] for s in top[:3]]


def _evaluate_plan(plan_ids, top_suspects):
    score = 0
    rows = set()
    cols = set()
    for cid in plan_ids:
        s = next((t for t in top_suspects if t['id'] == cid), None)
        if s:
            score += s['probability']
        pos = char_id_to_pos(cid)
        rows.add(pos['row'])
        cols.add(pos['col'])
    score += len(rows) * 5 + len(cols) * 5
    high_suspects = {s['id'] for s in top_suspects if s['probability'] > 50}
    for cid in plan_ids:
        if cid in high_suspects:
            score += 20
    return score


def _combinations(arr, k):
    result = []

    def helper(start, chosen):
        if len(chosen) == k:
            result.append(list(chosen))
            return
        for i in range(start, len(arr)):
            chosen.append(arr[i])
            helper(i + 1, chosen)
            chosen.pop()

    helper(0, [])
    return result
