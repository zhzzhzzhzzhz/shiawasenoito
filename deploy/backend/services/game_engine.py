"""
游戏核心逻辑引擎 — 棋盘管理、坐标转换、标记系统、状态机、胜负判定
"""
import random
import copy

# ==================== 棋盘与坐标 ====================


def char_id_to_pos(char_id: int) -> dict:
    """角色编号转棋盘坐标（编号列从1开始：201→col=0, 605→col=4）"""
    row = char_id // 100 - 2
    col = (char_id % 100) - 1
    return {'row': row, 'col': col}


def pos_to_char_id(row: int, col: int) -> int:
    """棋盘坐标转角色编号（列0→01, 列4→05）"""
    return (row + 2) * 100 + (col + 1)


def create_initial_board(villains: list = None, revive403: bool = False) -> list:
    """生成完整的25个角色初始状态（顶行到底行：601~605 → 201~205）。

    revive403=True 时 403"复活"：正常存活、可被标记、可入反派池（正派困难档变体）。
    """
    if villains is None:
        villains = []
    board = []
    for row in range(4, -1, -1):  # 4→0，使顶行(601~605)在数组最前
        for col in range(5):
            cid = pos_to_char_id(row, col)
            is_default_dead = (cid == 403 and not revive403)
            status = 'default_dead' if is_default_dead else 'alive'
            role = 'evil' if cid in villains else ('unknown' if is_default_dead else 'good')

            board.append({
                'id': cid,
                'row': row,
                'col': col,
                'role': role,
                'status': status,
                'hasSurveillance': False,
                'surveillanceRounds': [],
                'surveillanceActive': False,
                'hasDeathMarker': False,
                'deathMarkerShape': None,
                'deathMarkerRound': None,
            })
    return board


# ==================== 范围计算 ====================


def get_nine_grid_range(row: int, col: int) -> list:
    """九宫格范围：以 (row, col) 为中心的 3x3 格子"""
    cells = []
    for dr in range(-1, 2):
        for dc in range(-1, 2):
            nr, nc = row + dr, col + dc
            if 0 <= nr < 5 and 0 <= nc < 5:
                cells.append({'row': nr, 'col': nc})
    return cells


def get_cross_range(row: int, col: int) -> list:
    """十字范围：同行 + 同列"""
    cells = []
    for r in range(5):
        cells.append({'row': r, 'col': col})
    for c in range(5):
        if c != col:
            cells.append({'row': row, 'col': c})
    return cells


def get_affected_char_ids(row: int, col: int, shape: str) -> list:
    """获取指定形状影响的角色ID列表"""
    rng = get_nine_grid_range(row, col) if shape == '九宫格' else get_cross_range(row, col)
    return [pos_to_char_id(p['row'], p['col']) for p in rng]


# ==================== 行动卡池 ====================

ACTION_CARD_POOL = [
    {'index': 0, 'actions': [{'shape': '九宫格'}, {'shape': '九宫格'}], 'description': '九宫格×2'},
    {'index': 1, 'actions': [{'shape': '十字'}, {'shape': '十字'}], 'description': '十字×2'},
    {'index': 2, 'actions': [{'shape': '十字'}, {'shape': '九宫格'}], 'description': '十字+九宫格'},
    {'index': 3, 'actions': [{'shape': '十字'}, {'shape': '九宫格'}], 'description': '十字+九宫格'},
    {'index': 4, 'actions': [{'shape': '十字'}, {'shape': '十字'}, {'shape': '九宫格'}], 'description': '十字×2+九宫格'},
]


def get_action_card_pool() -> list:
    return [dict(card, used=False) for card in ACTION_CARD_POOL]


# ==================== 标记操作 ====================


def find_char(board, char_id):
    return next((c for c in board if c['id'] == char_id), None)


def place_surveillance(board: list, targets: list, round_num: int) -> list:
    """放置监视标记"""
    results = []
    for char_id in targets:
        char = find_char(board, char_id)
        if not char or char['status'] in ('dead', 'default_dead') or char.get('hasDeathMarker'):
            results.append({'charId': char_id, 'success': False, 'reason': '角色不可用'})
            continue
        char['hasSurveillance'] = True
        # 追加本轮监视记录（同一角色可被多个回合监视，历史记录保留用于堆叠显示）
        rounds = char.setdefault('surveillanceRounds', [])
        if round_num not in rounds:
            rounds.append(round_num)
        char['surveillanceActive'] = True
        results.append({'charId': char_id, 'success': True})
    return results


def place_death_marker(board: list, villain_id: int, target_id: int,
                       shape: str, round_num: int) -> dict:
    """放置死亡标记（标记目标角色，不产生死亡）"""
    villain = find_char(board, villain_id)
    target = find_char(board, target_id)

    if not villain or villain['status'] != 'alive':
        return {'success': False, 'reason': '反派不可用'}
    if villain.get('hasSurveillance') and villain.get('surveillanceActive'):
        return {'success': False, 'reason': '反派被监视，无法行动'}
    if villain.get('hasDeathMarker'):
        return {'success': False, 'reason': '反派已被标记，无法行动'}
    if not target or target['status'] != 'alive':
        return {'success': False, 'reason': '目标不可用'}
    if target.get('hasDeathMarker'):
        return {'success': False, 'reason': '目标已被标记'}
    # 禁止标记反派同伙（规则硬约束，2026-09-02 补）：自残标记破坏
    # "被杀者不可能是反派"公理，且会推进正派胜利条件。
    if target['role'] == 'evil':
        return {'success': False, 'reason': '不能标记反派同伙'}

    # 范围校验（规则硬约束，2026-09-01 补）：反派必须站在死亡标记的影响范围内，
    # 与前端"只能放在范围内"（GameBoard.tsx）一致；且不能标记自身。
    affected_ids = get_affected_char_ids(target['row'], target['col'], shape)
    if villain_id not in affected_ids or villain_id == target_id:
        return {'success': False, 'reason': '反派不在标记影响范围内'}

    target['hasDeathMarker'] = True
    target['deathMarkerShape'] = shape
    target['deathMarkerRound'] = round_num

    return {
        'success': True,
        'affectedIds': get_affected_char_ids(target['row'], target['col'], shape),
    }


def execute_death_markers(board: list, round_num: int) -> list:
    """结算阶段：保留死亡标记（不产生实际死亡）。

    被标记的目标角色保持存活，但标记会保留到游戏结束。
    胜负判定时，带有死亡标记的角色视为「已死亡」（见 check_win_condition）。
    返回本回合被标记的角色信息。
    """
    marked = []
    for char in board:
        if char.get('hasDeathMarker') and char.get('deathMarkerRound') == round_num:
            marked.append({'charId': char['id'], 'role': char['role'],
                           'shapes': [char.get('deathMarkerShape', '')]})
    return marked


def expire_surveillance(board: list):
    """结算阶段：监视标记失效"""
    for char in board:
        if char.get('hasSurveillance'):
            char['surveillanceActive'] = False


# ==================== 状态机 ====================


class Phase:
    PLACEMENT = 'placement'   # 阶段1：正派行动（放置监视），第1回合跳过
    ACTION = 'action'         # 阶段2：反派行动（放置死亡标记）
    REVEAL = 'reveal'         # 阶段3：公示本回合结果 + 自动结算
    GAMEOVER = 'gameover'


def get_next_phase(current_phase: str, round_num: int) -> str:
    if current_phase == Phase.PLACEMENT:
        # 第 6 回合跳过反派行动阶段，直接进入公示结算
        return Phase.REVEAL if round_num >= 6 else Phase.ACTION
    if current_phase == Phase.ACTION:
        return Phase.REVEAL
    if current_phase == Phase.REVEAL:
        # 公示结算后：若未到最后一回合，进入下一回合的第一阶段（正派行动）
        return Phase.GAMEOVER if round_num >= 6 else Phase.PLACEMENT
    return Phase.GAMEOVER


def get_initial_phase(round_num: int) -> str:
    # 第1回合跳过正派行动，直接从反派行动开始；其余回合从正派行动开始
    return Phase.ACTION if round_num == 1 else Phase.PLACEMENT


# ==================== 胜负判定 ====================


def _is_incapacitated(char: dict) -> bool:
    """角色是否失去行动能力：死亡 / 被监视 / 带有死亡标记（标记视为死亡）"""
    return (char['status'] == 'dead' or
            char.get('hasDeathMarker') or
            (char.get('hasSurveillance') and char.get('surveillanceActive')))


def check_win_condition(board: list, round_num: int, phase: str):
    """检查胜负条件，返回 'good' / 'evil' / None

    带有死亡标记的角色视为已死亡，参与胜负判定。
    """
    villains = [c for c in board if c['role'] == 'evil' and c['status'] != 'default_dead']

    all_incapacitated = all(_is_incapacitated(v) for v in villains)
    if all_incapacitated:
        return 'good'

    if round_num >= 6 and phase == Phase.REVEAL:
        active_villains = [v for v in villains if not _is_incapacitated(v)]
        if active_villains:
            return 'evil'

    return None


# ==================== 随机反派 ====================


def draw_villains(revive403: bool = False) -> list:
    """随机抽取 3 名反派。revive403=True 时 403 进入候选池（25 人）。"""
    candidates = []
    for row in range(5):
        for col in range(5):
            cid = pos_to_char_id(row, col)
            if cid != 403 or revive403:
                candidates.append(cid)
    random.shuffle(candidates)
    return sorted(candidates[:3])


# ==================== 工具函数 ====================


def get_active_villains(board: list) -> list:
    """可行动的反派：存活、未被监视、且未被死亡标记（标记视为死亡）"""
    return [c for c in board
            if c['role'] == 'evil' and c['status'] == 'alive' and
            not c.get('hasDeathMarker') and
            not (c.get('hasSurveillance') and c.get('surveillanceActive'))]


def get_surveillance_candidates(board: list) -> list:
    """可监视候选：存活且未被死亡标记的角色（403 复活变体下自然包含 403）。"""
    return [c for c in board
            if c['status'] == 'alive' and not c.get('hasDeathMarker')]


def get_public_board(board: list, viewer_role: str = None) -> list:
    """获取棋盘公开状态"""
    result = []
    for c in board:
        pub = {
            'id': c['id'],
            'row': c['row'],
            'col': c['col'],
            'status': c['status'],
            'hasSurveillance': c.get('hasSurveillance', False),
            'surveillanceActive': c.get('surveillanceActive', False),
            # 该角色被监视的所有回合（历史 + 当前），用于堆叠显示
            'surveillanceRounds': c.get('surveillanceRounds') or [],
            'hasDeathMarker': c.get('hasDeathMarker', False),
            # 死亡标记形状对双方可见（作为推理线索）
            'deathMarkerShape': c.get('deathMarkerShape'),
            # 死亡标记所属回合（用于标记插画显示回合号）
            'deathMarkerRound': c.get('deathMarkerRound'),
        }
        if viewer_role == 'good':
            pub['role'] = 'unknown'
        else:
            pub['role'] = c['role']
        result.append(pub)
    return result
