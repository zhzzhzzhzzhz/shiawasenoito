"""
反派 AI 系统 — 简单(随机) | 普通(启发式评分) | 困难(TODO)
"""
import random
import copy
from services.game_engine import get_affected_char_ids, get_active_villains

EVIL_WEIGHTS = {
    'kill_good': 10,
    'kill_evil': -15,
    'kill_dead': 0,
    'exposure': -3,
    'utilization': 5,
    'tempo': 2,
}


def evil_ai(board: list, hand_cards: list, difficulty: str, round_num: int):
    if difficulty == 'easy':
        return _evil_easy(board, hand_cards, round_num)
    elif difficulty == 'hard':
        return _evil_hard(board, hand_cards, round_num)
    else:
        return _evil_normal(board, hand_cards, round_num)


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
        # 排除已被死亡标记的目标（标记视为死亡，不可重复标记）
        alive = [c for c in board if c['status'] == 'alive' and c['id'] != 403
                 and not c.get('hasDeathMarker')]
        if not alive:
            return None
        target = random.choice(alive)
        actions.append({'villainId': villain['id'], 'targetId': target['id'], 'shape': shape})

    return {'cardIndex': card['index'], 'actions': actions}


def _evil_normal(board, hand_cards, round_num):
    """普通难度：贪心启发式评分"""
    active_villains = get_active_villains(board)
    available = [c for c in hand_cards if not c['used']]
    if not available or not active_villains:
        return _evil_easy(board, hand_cards, round_num)

    best_score = float('-inf')
    best_choice = None

    for card in available:
        action_count = min(len(card['actions']), len(active_villains))
        score, actions = _greedy_selection(card, active_villains, board, action_count, round_num)
        util_score = EVIL_WEIGHTS['utilization'] * (action_count / len(card['actions']))
        tempo_score = EVIL_WEIGHTS['tempo'] * (round_num / 6)
        total = score + util_score + tempo_score
        if total > best_score:
            best_score = total
            best_choice = {'cardIndex': card['index'], 'actions': actions}

    return best_choice or _evil_easy(board, hand_cards, round_num)


def _greedy_selection(card, villains, board, max_actions, round_num):
    actions = []
    used_villains = set()
    total_score = 0
    board_snapshot = copy.deepcopy(board)

    for i in range(max_actions):
        best_triplet = None
        for villain in [v for v in villains if v['id'] not in used_villains]:
            shape = card['actions'][i]['shape']
            # 排除已被死亡标记的目标（标记视为死亡，不可重复标记）
            for target in [c for c in board_snapshot if c['status'] == 'alive' and c['id'] != 403
                           and not c.get('hasDeathMarker')]:
                s = _score_triplet(villain, target, shape, board_snapshot)
                if best_triplet is None or s > best_triplet['score']:
                    best_triplet = {
                        'villainId': villain['id'], 'targetId': target['id'],
                        'shape': shape, 'score': s,
                    }
        if best_triplet:
            used_villains.add(best_triplet['villainId'])
            actions.append({
                'villainId': best_triplet['villainId'],
                'targetId': best_triplet['targetId'],
                'shape': best_triplet['shape'],
            })
            total_score += best_triplet['score']
            # 模拟标记（原为模拟死亡，现规则改为标记）
            t = next(c for c in board_snapshot if c['id'] == best_triplet['targetId'])
            t['hasDeathMarker'] = True
            t['deathMarkerShape'] = best_triplet['shape']
            # 范围内的角色也标记为不可再选
            for aid in get_affected_char_ids(t['row'], t['col'], best_triplet['shape']):
                c = next((ch for ch in board_snapshot if ch['id'] == aid), None)
                if c and c['status'] == 'alive':
                    c['status'] = 'sim_dead'

    return total_score, actions


def _score_triplet(villain, target, shape, board):
    affected = get_affected_char_ids(target['row'], target['col'], shape)
    score = 0
    for aid in affected:
        char = next((c for c in board if c['id'] == aid), None)
        if not char:
            continue
        if char['role'] == 'good' and char['status'] == 'alive':
            score += EVIL_WEIGHTS['kill_good']
        elif char['role'] == 'evil' and char['status'] == 'alive':
            score += EVIL_WEIGHTS['kill_evil']

    exposure = 0
    for nid in get_affected_char_ids(target['row'], target['col'], '九宫格'):
        c = next((ch for ch in board if ch['id'] == nid), None)
        if c and c.get('hasSurveillance') and c.get('surveillanceActive'):
            exposure += 1
    score += EVIL_WEIGHTS['exposure'] * exposure
    return score


def _evil_hard(board, hand_cards, round_num):
    """困难难度 (TODO: 全排列搜索)"""
    return _evil_normal(board, hand_cards, round_num)
