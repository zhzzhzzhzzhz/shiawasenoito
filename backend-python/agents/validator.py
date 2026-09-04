"""
validator.py —— 动作合法性校验（智能体输出的最后一道防线）。

校验口径与引擎规则完全一致（2026-09-01/02 硬规则）：
    - 正派：3 个互异目标，均为存活且未被死亡标记的角色；
    - 反派：卡可用、满员行动（恰好 min(卡行动次数, 可行动反派数)）、
      形状数量符合卡面、反派可行动且互异、目标存活且非反派（禁标同伙）、
      反派必须落在目标影响范围内（范围内标记）。
身份信息只用于校验，绝不进入智能体提示词。
"""
from collections import Counter
from services.game_engine import get_affected_char_ids, get_active_villains


def validate_good_targets(board, targets) -> tuple:
    """返回 (ok: bool, reason: str)。"""
    if not isinstance(targets, list) or len(targets) != 3:
        return False, 'targets 必须是 3 个编号'
    if len(set(targets)) != 3:
        return False, 'targets 必须互不相同'
    candidates = {c['id'] for c in board
                  if c['status'] == 'alive' and not c.get('hasDeathMarker')}
    for t in targets:
        if not isinstance(t, int) or t not in candidates:
            return False, f'编号 {t} 不可监视（不存在/已死亡/已标记）'
    return True, ''


def validate_evil_action(board, hand_cards, action) -> tuple:
    """返回 (ok: bool, reason: str)。"""
    if not isinstance(action, dict):
        return False, '输出不是 JSON 对象'
    card_index = action.get('cardIndex')
    actions = action.get('actions')
    card = next((c for c in hand_cards if c['index'] == card_index), None)
    if not card:
        return False, f'cardIndex {card_index} 不存在'
    if card['used']:
        return False, f'cardIndex {card_index} 已用过'
    if not isinstance(actions, list) or not actions:
        return False, 'actions 不能为空'

    active_villains = {v['id'] for v in get_active_villains(board)}
    max_actions = min(len(card['actions']), len(active_villains))
    if len(actions) != max_actions:
        return False, f'必须满员行动：恰好 {max_actions} 个 actions（给了 {len(actions)} 个）'

    card_shape_counts = Counter(a['shape'] for a in card['actions'])
    action_shape_counts = Counter(a.get('shape') for a in actions)
    for shape, count in action_shape_counts.items():
        if count > card_shape_counts.get(shape, 0):
            return False, f'形状 {shape} 数量超出卡面规定'

    used_villains = set()
    for a in actions:
        vid = a.get('villainId')
        tid = a.get('targetId')
        shape = a.get('shape')
        if shape not in ('九宫格', '十字'):
            return False, f'形状非法: {shape}'
        if vid not in active_villains:
            return False, f'反派 {vid} 不可行动（被监视/已标记/不存在）'
        if vid in used_villains:
            return False, f'反派 {vid} 重复行动（每回合每人最多 1 个标记）'
        used_villains.add(vid)

        target = next((c for c in board if c['id'] == tid), None)
        if not target or target['status'] != 'alive':
            return False, f'目标 {tid} 不可用'
        if target.get('hasDeathMarker'):
            return False, f'目标 {tid} 已被标记'
        if target['role'] == 'evil':
            return False, f'目标 {tid} 是反派同伙（禁标同伙）'
        if vid == tid:
            return False, '不能标记自身'
        affected = get_affected_char_ids(target['row'], target['col'], shape)
        if vid not in affected:
            return False, f'反派 {vid} 不在目标 {tid} 的 {shape} 范围内（范围内标记规则）'
    return True, ''


def validate(side: str, board, hand_cards, result) -> tuple:
    """按阵营分发校验。result 为解析后的动作对象。"""
    if side == 'good':
        return validate_good_targets(board, result.get('targets') if isinstance(result, dict) else result)
    return validate_evil_action(board, hand_cards, result)
