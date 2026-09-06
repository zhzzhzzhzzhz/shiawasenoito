"""
游戏会话管理 — 管理单个对局的完整生命周期
"""
import copy
import time
from collections import Counter
from services.game_engine import (
    create_initial_board, place_surveillance, get_action_card_pool,
    get_next_phase, get_initial_phase, Phase, check_win_condition,
    execute_death_markers, expire_surveillance, draw_villains,
    get_active_villains, get_public_board, place_death_marker, find_char,
    get_affected_char_ids,
)
from agents.brain import DecisionContext, build_brain
from ai.evil_ai import find_full_assignment


class GameSession:
    def __init__(self, room_id: str, options: dict = None):
        if options is None:
            options = {}
        self.room_id = room_id
        self.mode = options.get('mode', 'single')
        self.ai_difficulty = options.get('aiDifficulty', 'normal')
        # 大脑后端：'rule' | 'agent' | 'hybrid'（默认 rule，行为与升级前一致）
        self.ai_backend = options.get('aiBackend', 'rule')
        self.brain = build_brain(self.ai_backend, options)
        # 403 复活变体（正派困难档）：403 可被标记、可入反派池（25 人候选）
        self.revive403 = bool(options.get('revive403', False))
        self.good_player_id = options.get('goodPlayerId')
        self.evil_player_id = options.get('evilPlayerId')
        self.good_player_account = options.get('goodPlayerAccount')
        self.evil_player_account = options.get('evilPlayerAccount')

        self.villains = draw_villains(self.revive403)
        self.board = create_initial_board(self.villains, self.revive403)
        self.hand_cards = get_action_card_pool()
        self.round = 1
        self.phase = get_initial_phase(1)
        self.winner = None
        self.status = 'playing'
        self.history_rounds = []
        self.good_player_ready = False
        self.evil_player_ready = False
        self.reveal_data = None  # 公示数据（行动卡 + 死亡标记）
        self.invite_consumed = False  # 邀请码是否已销毁（房主进入房间后置 True，拒绝再加入）

        # 回合倒计时（双人模式）
        self.turn_deadline = None   # 回合截止时间戳（epoch 秒）
        self.turn_player = None     # 当前计时玩家 'good' | 'evil'
        self.paused = False         # 断线暂停标志
        self.pause_started = None   # 暂停开始时间戳

        # 断线重连倒计时（双人模式弃赛判定）
        self.disconnect_player_id = None   # 当前断线等待重连的玩家 id
        self.disconnect_deadline = None    # 重连截止时间戳（epoch 秒）

        # 训练数据采集：决策步骤记录（状态 → 动作），对局结束时由 recorder 落盘
        self.training_steps = []
        self.recorded = False
        self.ended_by = 'natural'   # natural / surrender（认输局标记，供数据审计豁免胜负校验）

    def get_state(self, viewer_role: str = None) -> dict:
        return {
            'roomId': self.room_id,
            'mode': self.mode,
            'status': self.status,
            'round': self.round,
            'phase': self.phase,
            'winner': self.winner,
            'board': get_public_board(self.board, viewer_role),
            'handCards': self.hand_cards,
            'usedCards': [c['index'] for c in self.hand_cards if c['used']],
            'villains': self.villains if viewer_role == 'evil' else None,
            'goodPlayerId': self.good_player_id,
            'evilPlayerId': self.evil_player_id,
            'aiDifficulty': self.ai_difficulty,
            'revive403': self.revive403,
            'reveal': self._sanitize_reveal(viewer_role),
            'roundRecords': self.get_round_records(viewer_role),
            # 回合倒计时（双人模式，前端据此显示剩余时间）
            'turnEndAt': int(self.turn_deadline * 1000) if self.turn_deadline else None,
            'turnPlayer': self.turn_player,
            'paused': self.paused,
            'serverNow': int(time.time() * 1000),
            # 断线重连倒计时（双人模式弃赛判定）
            'disconnectDeadline': int(self.disconnect_deadline * 1000) if self.disconnect_deadline else None,
            'disconnectPlayerId': self.disconnect_player_id,
        }

    def _sanitize_reveal(self, viewer_role: str):
        """公示数据按视角过滤（信息边界，2026-09-02 修复）：

        死亡标记的 villainId（行动者身份）仅对反派可见——正派玩家必须通过
        范围约束与行动次数自行推断行动者，前端本就不展示该字段，但接口层
        此前会随状态下发造成信息泄漏。
        """
        reveal = self.reveal_data if self.phase == Phase.REVEAL else None
        if not reveal or viewer_role == 'evil':
            return reveal
        return {
            **reveal,
            'deathMarkers': [
                {k: v for k, v in m.items() if k != 'villainId'}
                for m in reveal['deathMarkers']
            ],
        }

    def get_room_info(self) -> dict:
        """返回房间 presence（供等待界面展示双方是否进入/准备）"""
        return {
            'roomId': self.room_id,
            'status': self.status,
            'players': [
                {
                    'role': 'good',
                    'account': self.good_player_account,
                    'joined': self.good_player_id is not None,
                    'ready': self.good_player_ready,
                },
                {
                    'role': 'evil',
                    'account': self.evil_player_account,
                    'joined': self.evil_player_id is not None,
                    'ready': self.evil_player_ready,
                },
            ],
        }

    def get_round_records(self, viewer_role: str = None, reveal_villain: bool = False) -> list:
        """汇总历史记录为每回合展示结构（供前端左侧滚动记录框）。

        viewer_role 非 'evil' 时剥离 deathMarkers 中的 villainId（信息边界，
        2026-09-02 修复），正派只能看到目标与形状。
        reveal_villain=True 时不剥离（复盘用：对局已结束，反派身份公开）。
        """
        records = []
        for h in self.history_rounds:
            r = h.get('round')
            entry = next((e for e in records if e['round'] == r), None)
            if not entry:
                entry = {'round': r, 'surveillance': None, 'death': None, 'result': None, 'skip': False}
                records.append(entry)

            ptype = h.get('type')
            if h.get('phase') == 'placement':
                entry['surveillance'] = h.get('targets', [])
            elif ptype == 'death':
                markers = h.get('deathMarkers', [])
                if viewer_role != 'evil' and not reveal_villain:
                    markers = [{k: v for k, v in m.items() if k != 'villainId'}
                               for m in markers]
                entry['death'] = {
                    'cardIndex': h.get('cardIndex'),
                    'cardDescription': self._card_desc(h.get('cardIndex')),
                    'deathMarkers': markers,
                }
            elif h.get('phase') == 'reveal':
                entry['result'] = {
                    'marked': h.get('marked', []),
                    'winner': h.get('winner'),
                }
            elif ptype == 'skip':
                entry['skip'] = True
        return records

    def _card_desc(self, card_index) -> str:
        card = next((c for c in self.hand_cards if c['index'] == card_index), None)
        return card['description'] if card else ''

    def place_surveillance_action(self, player_id, targets: list) -> dict:
        if self.phase != Phase.PLACEMENT:
            return {'success': False, 'error': '当前不是放置监视阶段'}
        if self.good_player_id and self.good_player_id != player_id:
            return {'success': False, 'error': '你不是正派玩家'}
        if not isinstance(targets, list) or len(targets) != 3:
            return {'success': False, 'error': '必须选择3个监视目标'}

        # 决策前快照（训练数据：正派监视的状态 → 动作）
        board_before = copy.deepcopy(self.board)
        history_before = copy.deepcopy(self.history_rounds)

        results = place_surveillance(self.board, targets, self.round)
        failed = [r for r in results if not r['success']]
        if failed:
            return {'success': False,
                    'error': f"部分目标不可用: {','.join(str(r['charId']) for r in failed)}"}

        self.history_rounds.append({
            'round': self.round, 'phase': 'placement',
            'type': 'surveillance', 'targets': targets,
        })

        # 记录正派监视决策（状态 → 动作）
        self.training_steps.append({
            'type': 'good_watch',
            'round': self.round,
            'state': {'board': board_before, 'history': history_before},
            'action': {'targets': targets},
        })

        # 若所有反派均被监视/死亡 → 正派立即获胜，防止反派无法行动导致卡死
        winner = check_win_condition(self.board, self.round, Phase.PLACEMENT)
        if winner:
            self.winner = winner
            self.status = 'finished'
            self.phase = Phase.GAMEOVER
            return {'success': True, 'nextPhase': self.phase, 'winner': winner}

        # 第 6 回合跳过反派行动阶段，直接进入公示结算
        self.phase = get_next_phase(Phase.PLACEMENT, self.round)
        return {'success': True, 'nextPhase': self.phase}

    def play_action_card(self, player_id, card_index: int, death_actions: list) -> dict:
        if self.phase != Phase.ACTION:
            return {'success': False, 'error': '当前不是行动阶段'}
        if self.evil_player_id and self.evil_player_id != player_id:
            return {'success': False, 'error': '你不是反派玩家'}

        card = next((c for c in self.hand_cards if c['index'] == card_index), None)
        if not card or card['used']:
            return {'success': False, 'error': '行动卡不可用'}

        active_villains = get_active_villains(self.board)
        max_actions = min(len(card['actions']), len(active_villains))

        # 满员行动规则（硬约束，2026-09-02 定）：能动时必须满动，
        # 必须恰好放置 max_actions 个死亡标记（正派 P3 计数推理的信息发动机）。
        if not death_actions or len(death_actions) != max_actions:
            return {'success': False, 'error': f'必须恰好放置{max_actions}个死亡标记（满员行动规则）'}

        # 形状数量校验：混合卡（十字+九宫格）不固定顺序，但每种形状总数不能超过卡牌规定
        card_shape_counts = Counter(a['shape'] for a in card['actions'])
        action_shape_counts = Counter(a['shape'] for a in death_actions)
        for shape, count in action_shape_counts.items():
            if count > card_shape_counts.get(shape, 0):
                return {'success': False, 'error': '死亡标记形状与行动卡不符'}

        # 决策前快照（训练数据：反派行动的状态 → 动作）
        board_before = copy.deepcopy(self.board)
        hand_before = copy.deepcopy(self.hand_cards)
        history_before = copy.deepcopy(self.history_rounds)

        for action in death_actions:
            result = place_death_marker(
                self.board, action['villainId'], action['targetId'],
                action['shape'], self.round
            )
            if not result['success']:
                return {'success': False, 'error': result['reason']}

        card['used'] = True
        self.history_rounds.append({
            'round': self.round, 'phase': 'action', 'type': 'death',
            'cardIndex': card_index, 'deathMarkers': death_actions,
            'boardSnapshot': copy.deepcopy(self.board),
        })

        # 记录反派行动决策（状态 → 动作）
        self.training_steps.append({
            'type': 'evil_action',
            'round': self.round,
            'state': {'board': board_before, 'handCards': hand_before,
                      'history': history_before},
            'action': {'cardIndex': card_index, 'actions': death_actions},
        })
        # 保存公示数据：行动卡 + 死亡标记对象（供正派推理附加监视）
        self.reveal_data = {
            'cardIndex': card_index,
            'cardDescription': card['description'],
            'deathMarkers': [
                {
                    'villainId': a['villainId'],
                    'targetId': a['targetId'],
                    'shape': a['shape'],
                    'affectedIds': get_affected_char_ids(
                        find_char(self.board, a['targetId'])['row'],
                        find_char(self.board, a['targetId'])['col'],
                        a['shape']
                    ),
                } for a in death_actions
            ],
        }
        self.phase = Phase.REVEAL
        return {'success': True, 'nextPhase': self.phase}

    def place_extra_surveillance_action(self, player_id, targets: list) -> dict:
        # 已废弃：正派仅在第一阶段放置监视标记，其他阶段无法操作
        return {'success': False, 'error': '当前阶段正派无法操作'}

    def resolve_phase(self) -> dict:
        """公示阶段（REVEAL）结束：结算本回合结果并进入下一回合"""
        if self.phase != Phase.REVEAL:
            return {'success': False, 'error': '当前不是公示结算阶段'}

        marked = execute_death_markers(self.board, self.round)
        # 先判定胜负（此时监视标记仍然有效），再让监视标记失效
        winner = check_win_condition(self.board, self.round, self.phase)
        expire_surveillance(self.board)

        self.history_rounds.append({
            'round': self.round, 'phase': 'reveal',
            'marked': marked, 'winner': winner,
        })

        if winner:
            self.winner = winner
            self.status = 'finished'
            self.phase = Phase.GAMEOVER
        else:
            self.round += 1
            if self.round > 6:
                # 第6回合后仍有可行动反派 → 反派获胜
                self.winner = 'evil'
                self.status = 'finished'
                self.phase = Phase.GAMEOVER
            else:
                self.phase = get_initial_phase(self.round)

        return {
            'success': True, 'marked': marked, 'winner': self.winner,
            'nextRound': self.round, 'nextPhase': self.phase, 'status': self.status,
        }

    def ai_good_place(self) -> dict:
        ctx = DecisionContext.from_session(self, 'good')
        targets = self.brain.good_decision(ctx)
        result = self.place_surveillance_action(None, targets)
        result['aiTargets'] = targets
        return result

    def ai_evil_action(self) -> dict:
        ctx = DecisionContext.from_session(self, 'evil')
        action = self.brain.evil_decision(ctx)
        if not action:
            # 无可用行动卡或无可行动反派（被监视/死亡）→ 跳过行动，直接进入公示结算，防止流程卡死
            self.history_rounds.append({
                'round': self.round, 'phase': 'action', 'type': 'skip',
                'reason': 'no_available_action',
            })
            self.phase = Phase.REVEAL
            return {'success': True, 'skipped': True, 'nextPhase': self.phase}
        result = self.play_action_card(None, action['cardIndex'], action['actions'])
        result['aiAction'] = action
        return result

    def skip_ai_phase(self):
        """AI 操作失败时跳过当前阶段，防止流程卡死"""
        if self.phase == Phase.PLACEMENT:
            # 正派 AI 无法放置监视 → 进入下一阶段（第 6 回合直接进公示结算）
            self.phase = get_next_phase(Phase.PLACEMENT, self.round)
        elif self.phase == Phase.ACTION:
            # 反派 AI 无法行动 → 直接进入公示结算
            self.phase = Phase.REVEAL
        elif self.phase == Phase.REVEAL:
            # 公示结算阶段无法推进（理论不发生）→ 保持现状由 auto_advance 兜底
            pass

    def evil_skip_action(self, player_id) -> dict:
        """真人反派跳过本回合行动：无可用卡 / 无可行动反派 / 无未标记目标"""
        if self.phase != Phase.ACTION:
            return {'success': False, 'error': '当前不是行动阶段'}
        if self.evil_player_id is not None and self.evil_player_id != player_id:
            return {'success': False, 'error': '你不是反派玩家'}

        available_cards = [c for c in self.hand_cards if not c['used']]
        active_villains = get_active_villains(self.board)
        # 满员行动规则下，"可执行行动" = 存在至少一张卡的满员合法方案
        feasible = any(
            find_full_assignment(card, active_villains, self.board)
            for card in available_cards
        )
        if feasible:
            return {'success': False, 'error': '仍有可执行行动，不能跳过'}

        self.history_rounds.append({
            'round': self.round, 'phase': 'action', 'type': 'skip',
            'reason': 'no_available_action',
        })
        self.phase = Phase.REVEAL
        return {'success': True, 'skipped': True, 'nextPhase': self.phase}

    def force_skip_placement(self):
        """正派超时：跳过放置监视，进入下一阶段（第 6 回合直接进公示结算）"""
        if self.phase != Phase.PLACEMENT:
            return
        self.history_rounds.append({
            'round': self.round, 'phase': 'placement', 'type': 'skip',
            'reason': 'timeout', 'targets': [],
        })
        self.phase = get_next_phase(Phase.PLACEMENT, self.round)

    def force_skip_action(self):
        """反派超时：跳过行动，直接进入公示结算"""
        if self.phase != Phase.ACTION:
            return
        self.history_rounds.append({
            'round': self.round, 'phase': 'action', 'type': 'skip',
            'reason': 'timeout',
        })
        self.phase = Phase.REVEAL

    def auto_advance(self):
        if self.status != 'playing':
            return None
        if self.phase == Phase.PLACEMENT and self.good_player_id is None:
            return self.ai_good_place()
        if self.phase == Phase.ACTION and self.evil_player_id is None:
            return self.ai_evil_action()
        if self.phase == Phase.REVEAL:
            # 公示结算：无需玩家操作，自动推进
            return self.resolve_phase()
        return None

    def get_record_detail(self) -> dict:
        return {
            'villains': self.villains,
            # 复盘阶段身份已公开：用不脱敏的聚合回合记录（含 villainId），
            # 正派回放时也能看到死亡标记的真实行动者
            'history': self.get_round_records(None, reveal_villain=True),
            'finalBoard': [{'id': c['id'], 'role': c['role'], 'status': c['status']}
                           for c in self.board],
            'winner': self.winner,
            'totalRounds': self.round,
        }

    def get_training_record(self) -> dict:
        """汇总训练数据集记录（完整对局 + 状态→动作决策步骤）"""
        return {
            'roomId': self.room_id,
            'mode': self.mode,
            'villains': self.villains,
            'winner': self.winner,
            'totalRounds': self.round,
            'goodPlayerId': self.good_player_id,
            'evilPlayerId': self.evil_player_id,
            'aiDifficulty': self.ai_difficulty,
            'endedBy': getattr(self, 'ended_by', 'natural'),
            'steps': self.training_steps,
        }