"""
反派 AI 系统 —— 简单(随机) | 普通(启发式评分+暴露度) | 困难(全排列搜索)

信息完备：反派 AI 知道 3 名反派身份与全部标记位置。
普通档：贪心评分，价值 = 击杀收益 − 暴露度 + 节奏。
"""
import random
import copy
from functools import lru_cache
from services.game_engine import (
    get_active_villains, get_affected_char_ids, char_id_to_pos,
)
from ai.bayes import build_inference
from ai.search import full_search
from ai.config import EVIL_WEIGHTS


def evil_ai(board, hand_cards, difficulty, round_num, history_rounds=None):
    if difficulty == 'easy':
        return _evil_easy(board, hand_cards, round_num)
    elif difficulty == 'hard':
        return _evil_hard(board, hand_cards, round_num, history_rounds)
    else:
        return _evil_normal(board, hand_cards, round_num, history_rounds)


def _evil_easy(board, hand_cards, round_num):
    """简单难度：随机"""
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return None

    card = random.choice(available)
    actions = []
    used_villains = set()
    action_count = min(len(card['actions']), len(active_villains))

    for i in range(action_count):
        available_v = [v for v in active_villains if v['id'] not in used_villains]
        if not available_v:
            break
        villain = random.choice(available_v)
        used_villains.add(villain['id'])
        shape = card['actions'][i]['shape']
        # 只击杀存活正派（反派知晓身份）
        targets = [c for c in board if c['status'] == 'alive' and c['id'] != 403
                   and not c.get('hasDeathMarker') and c['role'] == 'good']
        if not targets:
            return None
        target = random.choice(targets)
        actions.append({'villainId': villain['id'], 'targetId': target['id'], 'shape': shape})

    return {'cardIndex': card['index'], 'actions': actions}


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
                           if c['status'] == 'alive' and c['id'] != 403
                           and not c.get('hasDeathMarker') and c['role'] == 'good']:
                s = _score_triplet(villain, target, shape, round_num, heatmap)
                if best_triplet is None or s > best_triplet['score']:
                    best_triplet = {
                        'villainId': villain['id'], 'targetId': target['id'],
                        'shape': shape, 'score': s,
                    }
        if best_triplet is None:
            break
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
    """
    # 击杀收益：击杀正派等值=1；杀"正派误判的高嫌疑角色"会帮正派排除错误项，扣分
    kill_gain = (EVIL_WEIGHTS['kill_gain']
                 - EVIL_WEIGHTS['lambda_purge'] * heatmap.get(target['id'], 0.0))

    # 暴露度：站位暴露自己（v 落在可行域内），代价 = 正派对 v 的当前嫌疑
    exposure = 0.0
    if villain['id'] in _feasible_region(target['id'], shape):
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
