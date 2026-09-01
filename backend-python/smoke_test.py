"""
冒烟测试：验证阶段推进逻辑（修复反派行动后不进入下一阶段的问题）
场景1：AI vs AI 全自动（两个玩家都是 None），完整跑 6 回合
场景2：真人扮演反派（evil_player_id=1, good_player_id=None），模拟 AI 正派放置监视
场景3：真人扮演正派（good_player_id=1, evil_player_id=None），模拟 AI 反派行动
"""
import sys
import traceback
from services.game_session import GameSession
from services.game_engine import Phase


def run_auto(session, max_steps=200):
    """模拟 auto_advance_loop 的推进逻辑（同步版）

    阶段流：PLACEMENT(正派行动,第1回合跳过) → ACTION(反派行动) → REVEAL(公示+自动结算)
    """
    steps = 0
    while session.status == 'playing' and steps < max_steps:
        phase = session.phase
        if phase == Phase.PLACEMENT and session.good_player_id is not None:
            break  # 需要真人正派操作
        if phase == Phase.ACTION and session.evil_player_id is not None:
            break  # 需要真人反派操作
        # REVEAL 公示结算无需玩家操作，自动推进

        if phase == Phase.REVEAL:
            result = session.resolve_phase()
        elif phase in (Phase.PLACEMENT, Phase.ACTION):
            result = session.auto_advance()
        else:
            break

        if not result or not result.get('success'):
            session.skip_ai_phase()
        steps += 1
        if steps >= max_steps:
            raise RuntimeError(f'死循环！卡在 phase={session.phase} round={session.round}')
    return steps


def test_all_ai():
    print('=== 场景1: AI vs AI 全自动 ===')
    session = GameSession('t1', {'mode': 'single', 'aiDifficulty': 'normal',
                                  'goodPlayerId': None, 'evilPlayerId': None})
    steps = run_auto(session)
    assert session.status == 'finished', f'游戏未结束: status={session.status}'
    assert session.round <= 7, f'回合数异常: {session.round}'
    assert session.winner in ('good', 'evil'), f'无胜者: {session.winner}'
    print(f'  OK: {steps} 步推进完成, {session.round} 回合, 胜者={session.winner}')


def test_human_evil():
    print('=== 场景2: 真人反派 + AI 正派 ===')
    session = GameSession('t2', {'mode': 'single', 'aiDifficulty': 'normal',
                                  'goodPlayerId': None, 'evilPlayerId': 1})
    # 第一回合 phase=ACTION，轮到真人反派
    assert session.phase == Phase.ACTION, f'初始阶段错误: {session.phase}'

    # 模拟 AI 正派自动推进（放置监视应在反派行动之后进行）
    round_played = 0
    while session.status == 'playing' and round_played < 6:
        assert session.phase == Phase.ACTION, f'应轮到反派行动: {session.phase}'
        # 玩家出行动卡：选未被监视的存活反派
        available_cards = [c for c in session.hand_cards if not c['used']]
        if not available_cards:
            # 行动卡用尽（5张全局各一次）→ 真人反派无卡时跳过行动进入公示结算
            session.history_rounds.append({
                'round': session.round, 'phase': 'action', 'type': 'skip',
                'reason': 'no_cards_left',
            })
            session.phase = Phase.REVEAL
            steps = run_auto(session)
            if session.status == 'finished':
                break
            continue
        card = available_cards[0]
        active_board = session.get_state('evil')['board']
        villain = next((c for c in active_board
                        if c['role'] == 'evil' and c['status'] == 'alive' and
                        not c.get('hasDeathMarker') and
                        not (c['hasSurveillance'] and c['surveillanceActive'])), None)
        if not villain:
            # 反派被监视/标记，无法行动 → 跳过行动进入公示结算
            session.history_rounds.append({
                'round': session.round, 'phase': 'action', 'type': 'skip',
                'reason': 'no_active_villain',
            })
            session.phase = Phase.REVEAL
            steps = run_auto(session)
            if session.status == 'finished':
                break
            continue
        actions = [{'villainId': villain['id'],
                     'targetId': next(c['id'] for c in session.board
                                      if c['status'] == 'alive' and c['id'] != 403
                                      and not c.get('hasDeathMarker')),
                     'shape': card['actions'][0]['shape']}]
        r = session.play_action_card(1, card['index'], actions)
        assert r['success'], f'出牌失败: {r}'
        round_played += 1
        # 出牌后应自动推进：REVEAL(公示结算) → 下一回合 ACTION
        steps = run_auto(session)
        if session.status == 'playing':
            assert session.phase == Phase.ACTION, f'应回到反派行动阶段: {session.phase} round={session.round}'

    print(f'  OK: 真人反派打完 {round_played} 回合, 每回合自动推进正常')


def test_human_good():
    print('=== 场景3: 真人正派 + AI 反派 ===')
    session = GameSession('t3', {'mode': 'single', 'aiDifficulty': 'normal',
                                  'goodPlayerId': 1, 'evilPlayerId': None})
    # 第一回合 phase=ACTION（AI 反派先行动，第1回合跳过正派行动）
    assert session.phase == Phase.ACTION, f'初始阶段错误: {session.phase}'
    # AI 反派自动行动 → 应进入 REVEAL（公示结算阶段）
    session.auto_advance()
    assert session.phase == Phase.REVEAL, f'反派行动后应进入 REVEAL: {session.phase}'
    # REVEAL 无需正派操作，直接结算 → 下一回合 PLACEMENT（等待真人正派放置监视）
    session.resolve_phase()
    assert session.phase == Phase.PLACEMENT, f'结算后应进入 PLACEMENT: {session.phase}'
    # 正派放置监视 → ACTION（AI 反派行动）；若3个监视全命中反派则正派立即获胜
    targets3 = [c['id'] for c in session.board
                if c['status'] == 'alive' and not c.get('hasDeathMarker')][:3]
    r = session.place_surveillance_action(1, targets3)
    assert r['success'], f'放置监视失败: {r}'
    if session.status == 'finished':
        assert session.phase == Phase.GAMEOVER, f'全监视获胜应进入 GAMEOVER: {session.phase}'
        print('  OK: 正派放置监视全命中 → 立即获胜（正确）')
        return
    assert session.phase == Phase.ACTION, f'放置监视后应进入 ACTION: {session.phase}'
    # AI 反派行动 → REVEAL；若无可行动（无未标记目标）则跳过推进到 REVEAL
    session.auto_advance()
    if session.phase == Phase.ACTION:
        # 无可用行动：auto_advance 不应卡死，手动推进验证跳过逻辑
        session.skip_ai_phase()
        assert session.phase == Phase.REVEAL, f'无行动时应跳过到 REVEAL: {session.phase}'
        print('  OK: 正派/反派阶段切换完整走通（AI无行动跳过分支）')
    else:
        assert session.phase == Phase.REVEAL, f'AI反派行动后应进入 REVEAL: {session.phase}'
        print('  OK: 正派/反派阶段切换完整走通')


if __name__ == '__main__':
    tests = [test_all_ai, test_human_evil, test_human_good]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception:
            failed += 1
            traceback.print_exc()
    if failed:
        print(f'\n❌ {failed} 个场景失败')
        sys.exit(1)
    print('\n✅ 全部冒烟测试通过')
