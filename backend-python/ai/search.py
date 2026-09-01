"""
搜索层 —— 全排列搜索（反派困难档用）。

单回合全局最优：枚举所有"反派指派 × 目标选择"组合，取总评分最高。
依赖注入 score_fn，避免与 evil_ai 循环 import。
用 itertools.permutations（C 实现）+ 评分矩阵预计算，控制决策耗时在毫秒级。
"""
from itertools import permutations


def full_search(card, villains, board, round_num, heatmap, score_fn):
    """对一张行动卡，全排列搜索全局最优行动方案。

    card:     行动卡 dict，含 'actions'（每项含 'shape'，顺序固定）
    villains: 可行动反派列表 list[dict]
    board:    棋盘（含 role/status/hasDeathMarker）
    round_num, heatmap: 透传给 score_fn
    score_fn: (villain, target, shape, round_num, heatmap) -> float

    返回 {'score': float, 'actions': [{'villainId','targetId','shape'}]}；
          无可行动组合时返回 {'score': float('-inf'), 'actions': []}。
    """
    m = min(len(card['actions']), len(villains))
    targets = [c for c in board
               if c['status'] == 'alive' and c['id'] != 403
               and not c.get('hasDeathMarker') and c['role'] == 'good']
    if m == 0 or not targets:
        return {'score': float('-inf'), 'actions': []}

    shapes = [a['shape'] for a in card['actions'][:m]]

    # 预计算评分矩阵，避免 dfs 内重复调用 score_fn（含几何可行域计算）
    score = {}
    for v in villains:
        for t in targets:
            for s in set(shapes):
                score[(v['id'], t['id'], s)] = score_fn(v, t, s, round_num, heatmap)

    best_score = float('-inf')
    best_actions = []
    for vperm in permutations(villains, m):
        vids = [v['id'] for v in vperm]
        for tperm in permutations(targets, m):
            tids = [t['id'] for t in tperm]
            total = sum(score[(vids[i], tids[i], shapes[i])] for i in range(m))
            if total > best_score:
                best_score = total
                best_actions = [
                    {'villainId': vids[i], 'targetId': tids[i], 'shape': shapes[i]}
                    for i in range(m)
                ]
    return {'score': best_score, 'actions': best_actions}
