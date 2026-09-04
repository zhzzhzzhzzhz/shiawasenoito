"""
反派 AI 系统 —— 简单(随机满员) | 普通(对抗代理贪心) | 困难(对抗 beam 搜索)

设计哲学（倒推设计 v1，2026-09-02）：
    标记对反派是纯信息损失（不助获胜、只暴露自身），反派被规则强制满员行动，
    因此反派唯一课题 = 被迫行动下的泄漏最小化。
    评分 = 模拟正派推断器（bayes.py）在观测本方案后的"真反派暴露度之和"，
    越低越好。R1 稀释 / R2 卡序调度 / R6 防误杀从目标函数中自然涌现。
"""
import random
import copy
from functools import lru_cache
from services.game_engine import (
    get_active_villains, get_affected_char_ids, char_id_to_pos,
)
from ai.bayes import build_inference, _apply_observation, _marginal_from
from ai.search import full_search
from ai.config import EVIL_WEIGHTS, EVIL_ADVERSARIAL_WEIGHTS


def evil_ai(board, hand_cards, difficulty, round_num, history_rounds=None):
    if difficulty == 'easy':
        return _evil_easy(board, hand_cards, round_num)
    elif difficulty == 'hard':
        return _evil_adversarial(board, hand_cards, round_num, history_rounds,
                                 hard=True)
    else:
        return _evil_adversarial(board, hand_cards, round_num, history_rounds,
                                 hard=False)


def find_full_assignment(card, villains, board, max_actions=None, randomize=False):
    """寻找一张卡的满员合法指派（回溯求解，保证"能动必须满动"）。

    规则约束（2026-09-01/02 硬规则）：
        - 每个行动的 (反派, 目标, 形状) 三元组合法：反派 ∈ 目标影响范围、反派互异、
          目标存活且未被标记、目标为正派（禁标同伙）；
        - 满员：恰好 min(卡行动数, 可行动反派数) 个行动。
    返回 actions 列表或 None（不存在满员方案）。

    用途：① 反派 easy 档（随机化版本） ② 会话层跳过判定（可行性检查）
          ③ 冒烟测试等需要"任一合法满员方案"的场合。
    """
    if max_actions is None:
        max_actions = min(len(card['actions']), len(villains))
    if max_actions <= 0:
        return None

    shapes = [a['shape'] for a in card['actions'][:max_actions]]
    targets = [c for c in board
               if c['status'] == 'alive' and not c.get('hasDeathMarker')
               and c['role'] == 'good']
    # 每个 (反派, 形状) 的候选目标集（反派必须落在目标的影响范围内）
    candidates = {}
    for v in villains:
        for i, s in enumerate(shapes):
            key = (v['id'], i)
            candidates[key] = [t for t in targets
                               if v['id'] in _feasible_region(t['id'], s)]
            if randomize:
                random.shuffle(candidates[key])

    used_villains = set()
    used_targets = set()
    actions = []

    def dfs(i):
        if i == max_actions:
            return True
        vlist = [v for v in villains if v['id'] not in used_villains]
        if randomize:
            random.shuffle(vlist)
        for v in vlist:
            key = (v['id'], i)
            for t in candidates[key]:
                if t['id'] in used_targets:
                    continue
                used_villains.add(v['id'])
                used_targets.add(t['id'])
                actions.append({'villainId': v['id'], 'targetId': t['id'],
                                'shape': shapes[i]})
                if dfs(i + 1):
                    return True
                actions.pop()
                used_targets.discard(t['id'])
                used_villains.discard(v['id'])
        return False

    if dfs(0):
        return actions
    return None


def _evil_easy(board, hand_cards, round_num):
    """简单难度：范围内随机（满员指派，随机化 DFS）"""
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return None

    random.shuffle(available)
    for card in available:
        actions = find_full_assignment(card, active_villains, board, randomize=True)
        if actions:
            return {'cardIndex': card['index'], 'actions': actions}
    return None


# ==================== 对抗评分反派 AI（倒推设计 v1） ====================

def _plan_exposure(inf0, watched, card, actions, true_villains):
    """模拟正派在观测该行动方案后的后验，返回真反派暴露度之和（越低越隐蔽）。

    用 bayes._apply_observation 在"正派当前后验"上增量应用本方案的公开观测
    （目标/形状/行动卡次数/监视位置），不修改原推断器、不读取任何超出
    公开信息边界的量——反派只是"替正派算了一遍"。
    """
    c = len(card['actions'])
    dts = [a['targetId'] for a in actions]
    dss = [a['shape'] for a in actions]
    ncombos, nweights, nalive = _apply_observation(
        inf0.combos, inf0.weights, inf0.alive_ids, inf0.all_candidates,
        dts, dss, watched, c, inf0.ALPHA)
    heat = _marginal_from(ncombos, nweights, inf0.all_candidates, nalive)
    return sum(heat.get(v, 0.0) for v in true_villains)


def _proxy_score(villain_id, target, shape, board, heat0, villain_set, active_ids):
    """代理评分（可解释的 R1/R6 镜像，用于快速筛选候选三元组）：

    + 稀释    ：范围内其他存活无辜者数（帮自己分走嫌疑）——R1
    − 防误杀  ：目标当前嫌疑（杀高嫌疑无辜者 = 帮正派排除错误假设）——R6
    − 防连带  ：范围内其他可行动真反派数（避免暴露同伙）——R1
    − 防定位  ：自己是范围内唯一可行动反派时重罚（会被精确定位）——R1
    """
    region = _feasible_region(target['id'], shape)
    innocents = 0
    buddies = 0
    for c in board:
        if c['id'] in region and c['status'] == 'alive' and not c.get('hasDeathMarker'):
            if c['id'] in villain_set:
                if c['id'] in active_ids:
                    buddies += 1
            else:
                innocents += 1
    purge = heat0.get(target['id'], 0.0)
    unique = 1.0 if buddies == 0 else 0.0
    w = EVIL_ADVERSARIAL_WEIGHTS
    return (innocents - w['proxy_purge'] * purge
            - w['proxy_buddy'] * buddies - w['proxy_unique'] * unique)


def _greedy_adversarial_plan(card, villains, board, max_actions,
                             inf0, watched, true_villains):
    """普通档：代理评分贪心，逐行动位选最优三元组；无法满员返回 None。"""
    heat0 = inf0.marginal()
    active_ids = {v['id'] for v in villains}
    villain_set = set(true_villains)
    actions = []
    used_villains = set()
    snapshot = copy.deepcopy(board)
    for i in range(max_actions):
        shape = card['actions'][i]['shape']
        best_t = None
        for v in villains:
            if v['id'] in used_villains:
                continue
            for t in [c for c in snapshot
                      if c['status'] == 'alive' and not c.get('hasDeathMarker')
                      and c['role'] == 'good']:
                if v['id'] not in _feasible_region(t['id'], shape):
                    continue
                s = _proxy_score(v['id'], t, shape, snapshot, heat0,
                                 villain_set, active_ids)
                if best_t is None or s > best_t['score']:
                    best_t = {'villainId': v['id'], 'targetId': t['id'],
                              'shape': shape, 'score': s}
        if best_t is None:
            return None  # 该卡无法满员指派
        used_villains.add(best_t['villainId'])
        actions.append({'villainId': best_t['villainId'],
                        'targetId': best_t['targetId'],
                        'shape': best_t['shape']})
        t = next(c for c in snapshot if c['id'] == best_t['targetId'])
        t['hasDeathMarker'] = True
    return actions


def _beam_adversarial_plan(card, villains, board, max_actions,
                           inf0, watched, true_villains, width=3):
    """困难档：beam 搜索，按"部分方案的精确暴露度"筛选，逐行动位扩展。"""
    shapes = [a['shape'] for a in card['actions'][:max_actions]]
    snapshot = copy.deepcopy(board)
    partials = [([], 0.0)]
    for i in range(max_actions):
        shape = shapes[i]
        candidates = []
        for actions, _exp in partials:
            used_v = {a['villainId'] for a in actions}
            used_t = {a['targetId'] for a in actions}
            for v in villains:
                if v['id'] in used_v:
                    continue
                for t in [c for c in snapshot
                          if c['status'] == 'alive' and not c.get('hasDeathMarker')
                          and c['role'] == 'good']:
                    if t['id'] in used_t:
                        continue
                    if v['id'] not in _feasible_region(t['id'], shape):
                        continue
                    cand = actions + [{'villainId': v['id'], 'targetId': t['id'],
                                       'shape': shape}]
                    exp = _plan_exposure(inf0, watched, card, cand, true_villains)
                    candidates.append((cand, exp))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[1])
        partials = candidates[:width]
    return partials[0][0] if partials else None


def _evil_adversarial(board, hand_cards, round_num, history_rounds=None, hard=False):
    """对抗评分反派 AI：在全部候选方案中选"正派后验真反派暴露度之和最小"者。

    所有方案的公开观测完全相同（满员行动规则下 k 由卡与可行动数决定），
    差异仅在"标记落在谁身上"——因此卡序调度（R2：少标记的卡天然更隐蔽）
    与目标稀释（R1）都通过暴露度自然涌现。
    """
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return None

    inf0 = build_inference(board, history_rounds or [])  # 正派当前后验（每决策一次）
    watched = [c['id'] for c in board if c.get('surveillanceActive')]
    true_villains = [c['id'] for c in board if c['role'] == 'evil']

    best = None  # (exposure, choice)
    for card in available:
        max_actions = min(len(card['actions']), len(active_villains))
        if hard:
            plan = _beam_adversarial_plan(card, active_villains, board, max_actions,
                                          inf0, watched, true_villains)
        else:
            plan = _greedy_adversarial_plan(card, active_villains, board, max_actions,
                                            inf0, watched, true_villains)
        if not plan:
            continue
        exposure = _plan_exposure(inf0, watched, card, plan, true_villains)
        if best is None or exposure < best[0]:
            best = (exposure, {'cardIndex': card['index'], 'actions': plan})

    if best:
        return best[1]
    return _evil_easy(board, hand_cards, round_num)


def _evil_normal(board, hand_cards, round_num, history_rounds=None):
    """普通难度：贪心启发式评分（击杀收益 − 暴露度 + 节奏）"""
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return _evil_easy(board, hand_cards, round_num)

    heatmap = _build_heatmap(board, history_rounds)

    best_score = float('-inf')
    best_choice = None
    for card in available:
        action_count = min(len(card['actions']), len(active_villains))
        score, actions = _greedy_selection(card, active_villains, board,
                                           action_count, round_num, heatmap)
        if score == float('-inf') or len(actions) != action_count:
            continue  # 无法满员指派 → 该卡不可行（满员行动规则）
        util = EVIL_WEIGHTS['utilization'] * (action_count / len(card['actions']))
        total = score + util
        if total > best_score:
            best_score = total
            best_choice = {'cardIndex': card['index'], 'actions': actions}

    return best_choice or _evil_easy(board, hand_cards, round_num)


def _build_heatmap(board, history_rounds):
    """反派站在正派视角模拟推断，得到嫌疑热度图（严格信息边界，不含真实身份）。"""
    return build_inference(board, history_rounds).heatmap()


def _greedy_selection(card, villains, board, max_actions, round_num, heatmap):
    actions = []
    used_villains = set()
    total_score = 0
    board_snapshot = copy.deepcopy(board)

    for i in range(max_actions):
        shape = card['actions'][i]['shape']
        best_triplet = None
        for villain in [v for v in villains if v['id'] not in used_villains]:
            for target in [c for c in board_snapshot
                           if c['status'] == 'alive'
                           and not c.get('hasDeathMarker') and c['role'] == 'good']:
                s = _score_triplet(villain, target, shape, round_num, heatmap)
                if s == float('-inf'):
                    continue  # 越范围标记已被规则禁止（2026-09-01）
                if best_triplet is None or s > best_triplet['score']:
                    best_triplet = {
                        'villainId': villain['id'], 'targetId': target['id'],
                        'shape': shape, 'score': s,
                    }
        if best_triplet is None:
            return float('-inf'), []  # 该卡无法满员指派（满员行动规则）
        used_villains.add(best_triplet['villainId'])
        actions.append({
            'villainId': best_triplet['villainId'],
            'targetId': best_triplet['targetId'],
            'shape': best_triplet['shape'],
        })
        total_score += best_triplet['score']
        # 单点击杀：只标记目标，不产生范围死亡（与引擎规则一致）
        t = next(c for c in board_snapshot if c['id'] == best_triplet['targetId'])
        t['hasDeathMarker'] = True
        t['deathMarkerShape'] = best_triplet['shape']

    return total_score, actions


@lru_cache(maxsize=None)
def _feasible_region(target_id, shape):
    """凶手可行域：以目标为中心的站位约束范围（不含目标自身）。"""
    pos = char_id_to_pos(target_id)
    ids = get_affected_char_ids(pos['row'], pos['col'], shape)
    return frozenset(i for i in ids if i != target_id)


def _score_triplet(villain, target, shape, round_num, heatmap):
    """评分三元组 (反派 v, 目标 t, 形状 s)。

    价值 = 击杀收益 − 暴露度 + 节奏
    范围规则（2026-09-01）：反派必须站进标记影响范围，越范围直接判非法。
    """
    if villain['id'] not in _feasible_region(target['id'], shape):
        return float('-inf')

    # 击杀收益：击杀正派等值=1；杀"正派误判的高嫌疑角色"会帮正派排除错误项，扣分
    kill_gain = (EVIL_WEIGHTS['kill_gain']
                 - EVIL_WEIGHTS['lambda_purge'] * heatmap.get(target['id'], 0.0))

    # 暴露度：站位必然暴露（范围规则下 v 恒落在可行域内），代价 = 正派对 v 的当前嫌疑
    exposure = heatmap.get(villain['id'], 0.0)

    tempo = EVIL_WEIGHTS['tempo'] * (round_num / 6)

    return kill_gain - EVIL_WEIGHTS['lambda_exposure'] * exposure + tempo


def _evil_hard(board, hand_cards, round_num, history_rounds=None):
    """困难难度：全排列搜索取全局最优"""
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return _evil_easy(board, hand_cards, round_num)

    heatmap = _build_heatmap(board, history_rounds)

    best_total = float('-inf')
    best_choice = None
    for card in available:
        action_count = min(len(card['actions']), len(active_villains))
        result = full_search(card, active_villains, board, round_num, heatmap, _score_triplet)
        if result['score'] == float('-inf'):
            continue
        util = EVIL_WEIGHTS['utilization'] * (action_count / len(card['actions']))
        total = result['score'] + util
        if total > best_total:
            best_total = total
            best_choice = {'cardIndex': card['index'], 'actions': result['actions']}

    return best_choice or _evil_easy(board, hand_cards, round_num)
