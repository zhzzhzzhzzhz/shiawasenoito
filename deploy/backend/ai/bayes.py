"""
贝叶斯推断核心 —— 正派视角的反派身份概率推断。

纯类/纯函数模块，无 IO、无副作用。
正派 AI 用它做真实推断；反派 AI 用它站在正派视角模拟推断，评估自身暴露度。
两套 AI 共用，保证"嫌疑热度图"的数学一致性。

信息边界（硬性原则）：
    本模块只接收公开观测（死亡标记目标/形状、监视位置、行动次数），
    绝不读取真实反派身份（role / villainId）。凡传入本模块的数据均视为公开信息。

核心模型：
    - 反派组合空间 T ⊂ 候选集，|T| = 3，先验均匀。
    - 每回合观测：死亡标记 {(目标 t_i, 形状 s_i)}、被监视角色、行动卡行动次数 c。
    - 更新 = 硬约束传播（被杀者排除 + 可行动反派数精确反推 + 范围内标记指派）
      + 软似然加权（几何站位线索的强度，GEOMETRY_HARD=False 时退化为纯软约束）。
"""
from itertools import combinations, permutations
from collections import defaultdict
from services.game_engine import char_id_to_pos, get_affected_char_ids, ACTION_CARD_POOL
from ai.config import ALPHA, GEOMETRY_HARD


def _can_assign(regions, active):
    """是否存在 标记→反派 的一一指派，使每个标记的范围内都有其作案反派。

    regions: 每个死亡标记的凶手可行域集合列表
    active:  该组合中本回合可行动（未被监视）的反派列表
    """
    if len(regions) > len(active):
        return False
    for perm in permutations(active, len(regions)):
        if all(v in regions[i] for i, v in enumerate(perm)):
            return True
    return False


def _apply_observation(combos, weights, alive_ids, all_candidates,
                       death_targets, death_shapes, watched_ids,
                       card_action_count, alpha):
    """在组合状态上应用一次回合观测，返回 (new_combos, new_weights, new_alive_ids)。

    纯函数：不修改入参。正派推断 observe() 与反派 AI 的对抗模拟共用本函数，
    保证双方对"正派会如何更新"的数学一致。
    """
    k = len(death_targets)
    if k == 0:
        # 反派跳过（无可用卡 / 无可行动反派），无新信息
        return combos, weights, set(alive_ids)

    watched = set(watched_ids)
    dead = set(death_targets)

    # 凶手可行域：每个死亡标记的站位约束范围（不含目标自身）
    regions = []
    for tid, shape in zip(death_targets, death_shapes):
        pos = char_id_to_pos(tid)
        ids = get_affected_char_ids(pos['row'], pos['col'], shape)
        regions.append({i for i in ids if i != tid})

    # 硬排除①：被杀者不可能是反派 → 从存活候选集移除
    new_alive = alive_ids - dead

    new_combos = []
    new_weights = []
    for combo, w in zip(combos, weights):
        if w <= 0:
            continue
        # 硬排除①：组合含被杀者 → 剔除
        if any(v in dead for v in combo):
            continue

        # 可行动反派 = 组合中"未被本回合监视"的角色（组合元素均为存活候选）
        active = [v for v in combo if v not in watched]
        a = len(active)

        # 硬约束②：满员行动规则 ⇒ k = min(c, a)，精确反推 a
        if k < card_action_count:
            if a != k:
                continue
        else:
            if a < card_action_count:
                continue

        # 几何站位约束（假设A）：
        #   GEOMETRY_HARD=True  → 硬约束：每个标记必须能指派一名活跃反派落在其范围内
        #                         （一一指派，一个反派一个标记），否则剔除该组合；
        #   GEOMETRY_HARD=False → 软似然（旧行为）：范围线索只作加权。
        factor = 1.0
        if GEOMETRY_HARD and not _can_assign(regions, active):
            continue
        for region in regions:
            hit = sum(1 for v in active if v in region)
            factor *= (1.0 + alpha * hit)

        new_combos.append(combo)
        new_weights.append(w * factor)

    return new_combos, new_weights, new_alive


def _marginal_from(combos, weights, all_candidates, alive_ids):
    """从组合状态计算角色 → 嫌疑概率(0~1)（不依赖推断器对象）。"""
    total = sum(weights)
    probs = {cid: 0.0 for cid in all_candidates}
    if total <= 0:
        # 防御回退：均匀分布（理论上真实组合恒满足约束，不会走到这里）
        n = len(alive_ids) or 1
        return {cid: (1.0 / n if cid in alive_ids else 0.0)
                for cid in all_candidates}
    for combo, w in zip(combos, weights):
        for v in combo:
            probs[v] += w
    return {cid: val / total for cid, val in probs.items()}


class VillainInference:
    """正派视角的反派身份概率推断器。"""

    def __init__(self, candidate_ids):
        """candidate_ids: 初始候选角色ID（24 人，剔除 403；复活变体 25 人）。"""
        self.ALPHA = ALPHA  # 软似然强度：站位线索（假设A）的权重
        self.all_candidates = set(candidate_ids)
        self.alive_ids = set(candidate_ids)   # 存活候选（累积剔除被杀者）
        self.combos = []                       # 当前候选三组合 list[tuple[int,int,int]]
        self.weights = []                      # 与 combos 平行的未归一化权重
        self._rebuild()

    def _rebuild(self):
        alive = sorted(self.alive_ids)
        self.combos = list(combinations(alive, 3))
        self.weights = [1.0] * len(self.combos)

    def observe(self, death_targets, death_shapes, watched_ids, card_action_count):
        """处理一个已结束回合的公开观测，更新后验。

        death_targets:      该回合死亡标记的目标角色ID列表（被杀者）
        death_shapes:       与 death_targets 对齐的形状列表（'九宫格' / '十字'）
        watched_ids:        该回合正派放置监视的角色ID（激活状态）
        card_action_count:  该回合行动卡的行动次数 c
        """
        self.combos, self.weights, self.alive_ids = _apply_observation(
            self.combos, self.weights, self.alive_ids, self.all_candidates,
            death_targets, death_shapes, watched_ids, card_action_count,
            self.ALPHA)

    def marginal(self):
        """角色 → 嫌疑概率(0~1)，覆盖全部候选角色（被杀者概率为 0）。"""
        return _marginal_from(self.combos, self.weights,
                              self.all_candidates, self.alive_ids)

    def heatmap(self):
        """存活候选的归一化热度图（供反派评估暴露度）。"""
        marg = self.marginal()
        s = sum(marg.get(c, 0.0) for c in self.alive_ids) or 1.0
        return {c: marg.get(c, 0.0) / s for c in self.alive_ids}


def build_inference(board, history_rounds):
    """从 board + 历史回合记录构建正派视角的推断器（严格信息边界）。

    正派 AI 与反派 AI 共用：反派调用它来模拟正派推断、评估暴露度。
    只提取公开观测（targetId/shape/监视位置/行动次数），绝不读取 villainId/role。
    """
    # 候选集按状态取存活角色（403 复活变体下自然包含 403，25 人）
    candidate_ids = [c['id'] for c in board
                     if c['status'] not in ('dead', 'default_dead')]
    inf = VillainInference(candidate_ids)

    # 按回合分组：watched ← placement，death/cardIndex ← action
    rounds = defaultdict(dict)
    for h in history_rounds or []:
        r = h.get('round')
        if r is None:
            continue
        if h.get('type') == 'surveillance':
            rounds[r]['watched'] = h.get('targets', [])
        elif h.get('type') == 'death':
            rounds[r]['death'] = h.get('deathMarkers', [])
            rounds[r]['cardIndex'] = h.get('cardIndex')

    for r in sorted(rounds.keys()):
        data = rounds[r]
        death = data.get('death')
        if not death:
            continue  # 该回合无死亡观测（反派跳过），无新信息
        death_targets = [a['targetId'] for a in death]
        death_shapes = [a['shape'] for a in death]
        watched = data.get('watched', [])
        ci = data.get('cardIndex')
        card = ACTION_CARD_POOL[ci] if ci is not None else None
        c = len(card['actions']) if card else 0
        inf.observe(death_targets, death_shapes, watched, c)
    return inf
