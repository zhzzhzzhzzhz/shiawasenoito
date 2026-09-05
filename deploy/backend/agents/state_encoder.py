"""
StateEncoder —— 决策上下文 → 智能体观测（严格信息边界）。

职责：
    1. 按阵营过滤棋盘视图：正派看不到任何角色身份，反派全知；
    2. 附上正派视角贝叶斯信念（热度图，供"信念工具"）；
    3. 枚举动作空间（正派：可监视目标；反派：可用卡 × 可行动反派 × 各自合法目标）；
    4. 生成紧凑的公开历史摘要。

信息边界红线（与 ai/bayes.py 一致）：
    正派观测中绝不出现 role / villainId 等隐藏信息；本模块输出的
    observation 是 AgentBrain 提示词的唯一局面输入。
"""
from services.game_engine import (
    get_surveillance_candidates, get_active_villains, get_affected_char_ids,
    ACTION_CARD_POOL,
)
from ai.bayes import build_inference

CARD_DESC = {c['index']: c['description'] for c in ACTION_CARD_POOL}


def _board_view(board, side):
    """按阵营过滤的棋盘视图（不带身份泄漏）。"""
    view = []
    for c in board:
        item = {
            'id': c['id'],
            'row': c['row'],
            'col': c['col'],
            'status': c['status'],
            'hasDeathMarker': c.get('hasDeathMarker', False),
            'deathMarkerShape': c.get('deathMarkerShape'),
            'deathMarkerRound': c.get('deathMarkerRound'),
            'watched': bool(c.get('hasSurveillance') and c.get('surveillanceActive')),
        }
        if side == 'evil':
            item['role'] = c['role']  # 反派全知
        else:
            item['role'] = 'unknown'
        view.append(item)
    return view


def _history_summary(history_rounds):
    """紧凑公开历史：每回合 [正派监视目标, 反派标记 (目标/形状), 行动卡] 。"""
    rounds = {}
    for h in history_rounds or []:
        r = h.get('round')
        if r is None:
            continue
        entry = rounds.setdefault(r, {'surveillance': [], 'death': [], 'card': None, 'skip': False})
        if h.get('type') == 'surveillance':
            entry['surveillance'] = list(h.get('targets', []))
        elif h.get('type') == 'death':
            entry['death'] = [{'targetId': m.get('targetId'), 'shape': m.get('shape')}
                              for m in h.get('deathMarkers', [])]
            entry['card'] = h.get('cardIndex')
            # 卡面描述：标注者/智能体据此判断 k 与 c 的关系（P3 次数反推）
            entry['cardDescription'] = CARD_DESC.get(h.get('cardIndex'), '')
        elif h.get('type') == 'skip':
            entry['skip'] = True
    return [{'round': r, **d} for r, d in sorted(rounds.items())]


def _affected_ids(target, shape):
    """目标在指定形状下的凶手可行域（不含目标自身）。"""
    ids = get_affected_char_ids(target['row'], target['col'], shape)
    return {i for i in ids if i != target['id']}


def _slot_targets(board, villain_id, shape):
    """该反派在指定形状槽位下可合法标记的目标（纯查表用，含全部规则约束）。"""
    return [
        t['id'] for t in board
        if t['status'] == 'alive' and not t.get('hasDeathMarker')
        and t['role'] != 'evil' and t['id'] != villain_id
        and villain_id in _affected_ids(t, shape)
    ]


def _action_space(board, hand_cards, side):
    """动作空间枚举（合法候选，不含身份信息泄漏：正派侧不暴露角色身份）。"""
    if side == 'good':
        return {
            'type': 'choose_3_surveillance',
            'candidates': [c['id'] for c in get_surveillance_candidates(board)],
        }
    active = get_active_villains(board)
    space = {
        'type': 'play_action_card_full',
        'rule': ('满员行动：所选卡的 action_count_required 已替你算好，'
                 '必须恰好输出该数量的 actions；villainId 互不相同；'
                 'targetId 从对应 villain 的 targets 列表中选择；targetId 本回合不重复'),
        'active_villains': [v['id'] for v in active],
        'available_cards': [],
    }
    for card in hand_cards:
        if card['used']:
            continue
        max_actions = min(len(card['actions']), len(active))
        if max_actions == 0:
            continue  # 无可用行动：该卡不可执行
        slots = []
        for a in card['actions'][:max_actions]:
            slots.append({
                'shape': a['shape'],
                'targets_by_villain': {
                    v['id']: _slot_targets(board, v['id'], a['shape'])
                    for v in active
                },
            })
        space['available_cards'].append({
            'index': card['index'],
            'description': card['description'],
            'action_count_required': max_actions,
            'slots': slots,
        })
    return space


def _belief(board, history_rounds, side):
    """正派视角贝叶斯信念：仅正派智能体需要（反派已知身份，无需信念）。"""
    if side != 'good':
        return None
    try:
        inf = build_inference(board, history_rounds or [])
        heat = inf.marginal()
        top = sorted(heat.items(), key=lambda kv: kv[1], reverse=True)[:5]
        return {'top5_suspects': [{'id': i, 'prob': round(p, 3)} for i, p in top
                                  if p > 1e-6]}
    except Exception:
        return {'top5_suspects': []}


def encode_observation(ctx, side):
    """构建智能体观测（AgentBrain 提示词的唯一局面输入）。"""
    obs = {
        'side': side,
        'round': ctx.round_num,
        'phase': ctx.phase,
        'board': _board_view(ctx.board, side),
        'hand_cards_used': [c['index'] for c in ctx.hand_cards if c['used']],
        'history': _history_summary(ctx.history_rounds),
        'belief': _belief(ctx.board, ctx.history_rounds, side),
        'action_space': _action_space(ctx.board, ctx.hand_cards, side),
    }
    return obs
