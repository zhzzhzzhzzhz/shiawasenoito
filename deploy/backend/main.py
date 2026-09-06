"""
《幸福的丝线》后端主入口 — FastAPI (REST) + Socket.IO (WebSocket)
端口: 3000
"""
import os
import time
import asyncio
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routes.user import router as user_router
from routes.room import router as room_router
from services.room_manager import room_manager
from middleware.auth import verify_token
from services.game_engine import Phase
from services import recorder

load_dotenv()

# ==================== FastAPI (REST) ====================

app = FastAPI(title='幸福的丝线', version='1.0.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.include_router(user_router)
app.include_router(room_router)


@app.get('/api/health')
def health():
    return {'code': 0, 'message': 'ok', 'data': {'uptime': time.time()}}


# ==================== Socket.IO ====================

sio = socketio.AsyncServer(
    cors_allowed_origins='*',
    async_mode='asgi',
    logger=False,
    engineio_logger=False,
)


async def _room_sids(room_id: str) -> list:
    """获取房间内的所有 socket sid"""
    try:
        # manager.rooms 结构: rooms[namespace][room_name][sid] = eio_sid
        ns_rooms = sio.manager.rooms.get('/', {})
        room = ns_rooms.get(room_id, {})
        return list(room.keys())
    except Exception:
        return []


def _maybe_record(session):
    """RECORD_MATCH=on 且为双人模式时，保存训练记录（弃赛局不走到 finished，天然被排除）"""
    if os.getenv('RECORD_MATCH', 'off').lower() == 'on' and session.mode != 'single':
        path = recorder.save(session)
        if path:
            print(f'[Recorder] 对局记录已保存: {path}')


async def broadcast_game_state(room_id: str, extra: dict = None):
    """按玩家角色分别广播游戏状态给房间内所有玩家"""
    session = room_manager.get_room(room_id)
    if not session:
        return

    for sid in await _room_sids(room_id):
        try:
            async with sio.session(sid) as sess:
                user = sess.get('user', {})
        except Exception:
            continue
        player_id = user.get('id')
        if session.evil_player_id is not None and session.evil_player_id == player_id:
            viewer_role = 'evil'
        elif session.good_player_id is not None and session.good_player_id == player_id:
            viewer_role = 'good'
        else:
            viewer_role = 'good'  # 游客 / 旁观 默认 good 视角
        state = session.get_state(viewer_role)
        state['yourRole'] = viewer_role
        if extra:
            state.update(extra)
        await sio.emit('game:state', state, to=sid)

    if session.status == 'finished':
        _maybe_record(session)
        await sio.emit('game:result', {
            'winner': session.winner,
            'detail': session.get_record_detail(),
        }, room=room_id)


async def broadcast_room_info(room_id: str):
    """广播房间 presence 给房间内所有玩家（等待界面用）"""
    session = room_manager.get_room(room_id)
    if not session:
        return
    await sio.emit('game:room_update', session.get_room_info(), room=room_id)


async def start_game(room_id: str):
    """唯一开局入口：双方就绪后启动对局"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'waiting':
        return
    session.status = 'playing'
    session.phase = Phase.ACTION
    await sio.emit('game:started', session.get_state(), room=room_id)
    await broadcast_game_state(room_id)
    await auto_advance_loop(room_id)


# 每个阶段结束后的展示缓冲等待时间（秒）
PHASE_WAIT_SECONDS = 20

# 每位玩家操作回合的倒计时时长（秒）
TURN_SECONDS = 300

# 断线后等待重连的时长（秒），超时判定弃赛
DISCONNECT_WAIT_SECONDS = 60


async def auto_advance_loop(room_id: str, max_steps: int = 40):
    """自动推进游戏直到需要玩家操作（循环实现 + 防死循环上限）

    阶段流：PLACEMENT(正派行动,第1回合跳过) → ACTION(反派行动) → REVEAL(公示+自动结算)
    每个 AI 行动阶段 / 公示阶段结束后等待 PHASE_WAIT_SECONDS 秒（展示缓冲），
    广播 countdown 字段供前端倒计时展示。
    """
    for _ in range(max_steps):
        session = room_manager.get_room(room_id)
        if not session or session.status != 'playing':
            return

        phase = session.phase
        # 当前阶段需要真人玩家操作 → 启动回合倒计时并停止推进
        if phase == Phase.PLACEMENT and session.good_player_id is not None:
            maybe_start_turn(room_id)
            await broadcast_game_state(room_id)
            return
        if phase == Phase.ACTION and session.evil_player_id is not None:
            maybe_start_turn(room_id)
            await broadcast_game_state(room_id)
            return
        # REVEAL 为公示结算阶段，无需玩家操作，自动推进

        if phase == Phase.REVEAL:
            # 公示展示缓冲已由上一阶段（ACTION 结束）的 20s 承载，此处直接结算
            result = session.resolve_phase()
            extra = {'resolution': result}
            # 结算结果广播不附加倒计时（下一阶段的缓冲由循环下一轮处理）
            await broadcast_game_state(room_id, extra)
        elif phase in (Phase.PLACEMENT, Phase.ACTION):
            result = session.auto_advance()
            extra = {'aiAction': result}
            if result and result.get('success'):
                # AI 操作完成 → 广播结果 + 阶段结束倒计时（展示缓冲）
                extra.setdefault('countdown', PHASE_WAIT_SECONDS)
                await broadcast_game_state(room_id, extra)
                await asyncio.sleep(PHASE_WAIT_SECONDS)
            else:
                # AI 操作失败（异常兜底）→ 跳过当前 AI 阶段，防止死循环
                session.skip_ai_phase()
                await broadcast_game_state(room_id, {
                    'aiAction': {'success': True, 'skipped': True},
                    'countdown': PHASE_WAIT_SECONDS,
                })
                await asyncio.sleep(PHASE_WAIT_SECONDS)
        else:
            return


# ==================== 回合倒计时（双人模式） ====================

# room_id -> 计时任务
_turn_tasks: dict = {}


def _cancel_turn_task(room_id: str):
    task = _turn_tasks.pop(room_id, None)
    if task and not task.done():
        task.cancel()


def start_turn(room_id: str, player: str):
    """开始某玩家回合的倒计时"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return
    # 环境变量 TURN_TIMER=off 时关闭回合倒计时（训练数据采集期，便于真人慢慢决策）
    if os.getenv('TURN_TIMER', 'on').lower() == 'off':
        return
    deadline = time.time() + TURN_SECONDS
    session.turn_deadline = deadline
    session.turn_player = player
    session.paused = False
    session.pause_started = None
    _cancel_turn_task(room_id)
    _turn_tasks[room_id] = asyncio.create_task(_turn_timeout(room_id, deadline))


def stop_turn(room_id: str):
    """玩家完成操作 / 回合结束 → 清除倒计时"""
    session = room_manager.get_room(room_id)
    if session:
        session.turn_deadline = None
        session.turn_player = None
        session.paused = False
        session.pause_started = None
    _cancel_turn_task(room_id)


def pause_turn(room_id: str):
    """断线暂停倒计时"""
    session = room_manager.get_room(room_id)
    if not session or session.turn_deadline is None or session.paused:
        return
    session.paused = True
    session.pause_started = time.time()
    _cancel_turn_task(room_id)


def resume_turn(room_id: str):
    """重连恢复倒计时（截止时间顺延暂停时长）"""
    session = room_manager.get_room(room_id)
    if not session or not session.paused or session.turn_deadline is None:
        return
    session.turn_deadline += (time.time() - session.pause_started)
    session.paused = False
    session.pause_started = None
    deadline = session.turn_deadline
    _cancel_turn_task(room_id)
    _turn_tasks[room_id] = asyncio.create_task(_turn_timeout(room_id, deadline))


def maybe_start_turn(room_id: str):
    """按当前阶段决定是否开始真人玩家回合倒计时（单机模式跳过）"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return
    if session.mode == 'single':
        return
    if session.turn_deadline is not None:
        return
    if session.phase == Phase.PLACEMENT and session.good_player_id is not None:
        start_turn(room_id, 'good')
    elif session.phase == Phase.ACTION and session.evil_player_id is not None:
        start_turn(room_id, 'evil')


async def _turn_timeout(room_id: str, deadline: float):
    delay = max(0.0, deadline - time.time())
    await asyncio.sleep(delay)
    # 本任务已触发，先从登记中移除，避免 force_end_turn 里的 stop_turn 取消当前任务
    _turn_tasks.pop(room_id, None)
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return
    if session.turn_deadline != deadline or session.paused:
        return
    await force_end_turn(room_id)


async def force_end_turn(room_id: str):
    """倒计时超时：强制结束当前玩家回合并推进到下一玩家"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return

    if session.phase == Phase.PLACEMENT:
        # 正派超时 → 跳过放置，进入反派行动
        session.force_skip_placement()
        stop_turn(room_id)
        await broadcast_game_state(room_id, {
            'turnTimeout': {'role': 'good', 'round': session.round},
            'countdown': PHASE_WAIT_SECONDS,
        })
        await asyncio.sleep(PHASE_WAIT_SECONDS)
        await auto_advance_loop(room_id)
    elif session.phase == Phase.ACTION:
        # 反派超时 → 跳过行动，进入公示结算
        session.force_skip_action()
        stop_turn(room_id)
        await broadcast_game_state(room_id, {
            'turnTimeout': {'role': 'evil', 'round': session.round},
            'countdown': PHASE_WAIT_SECONDS,
        })
        await asyncio.sleep(PHASE_WAIT_SECONDS)
        await auto_advance_loop(room_id)


# ==================== 断线重连 + 弃赛判定（双人模式） ====================

# room_id -> 弃赛倒计时任务
_disconnect_tasks: dict = {}


def _cancel_disconnect_task(room_id: str):
    task = _disconnect_tasks.pop(room_id, None)
    if task and not task.done():
        task.cancel()


def start_disconnect_countdown(room_id: str, player_id: int):
    """玩家断线后启动 60 秒重连倒计时"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing' or session.mode == 'single':
        return
    if session.disconnect_player_id is not None:
        return  # 已有人断线等待重连，保持先断者的倒计时
    deadline = time.time() + DISCONNECT_WAIT_SECONDS
    session.disconnect_player_id = player_id
    session.disconnect_deadline = deadline
    _cancel_disconnect_task(room_id)
    _disconnect_tasks[room_id] = asyncio.create_task(_disconnect_timeout(room_id, player_id, deadline))


def cancel_disconnect_countdown(room_id: str):
    """玩家重连成功 → 取消弃赛倒计时并清除断线标记"""
    session = room_manager.get_room(room_id)
    if session:
        session.disconnect_player_id = None
        session.disconnect_deadline = None
    _cancel_disconnect_task(room_id)


async def _disconnect_timeout(room_id: str, player_id: int, deadline: float):
    delay = max(0.0, deadline - time.time())
    await asyncio.sleep(delay)
    # 本任务已触发，先从登记中移除，避免 _handle_abandon 里的 cancel 取消当前任务
    _disconnect_tasks.pop(room_id, None)
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return
    if session.disconnect_deadline != deadline or session.disconnect_player_id != player_id:
        return
    await _handle_abandon(room_id, player_id)


async def _handle_abandon(room_id: str, player_id: int, message: str = '对手断线超时，已判定弃赛'):
    """弃赛结算：判在线方获胜、广播结果、清理会话资源"""
    session = room_manager.get_room(room_id)
    if not session or session.status != 'playing':
        return

    # 判在线方获胜（弃赛方判负）
    winner = 'evil' if player_id == session.good_player_id else 'good'
    session.status = 'finished'
    session.winner = winner

    # 清理回合倒计时与弃赛倒计时任务
    stop_turn(room_id)
    cancel_disconnect_countdown(room_id)

    # 通知在线方：对手弃赛，你获胜
    await sio.emit('game:opponent_left',
                   {'message': message, 'abandoned': True},
                   room=room_id)
    await sio.emit('game:result', {
        'winner': winner,
        'detail': session.get_record_detail(),
    }, room=room_id)

    # 清理会话资源（移除房间 + 双方映射）
    room_manager.remove_room(room_id)
    print(f'[Socket] 弃赛结算: room={room_id} 弃赛方={player_id} 胜者={winner}')


# ==================== Socket Events ====================

@sio.event
async def connect(sid, environ, auth):
    token = auth.get('token') if auth else None
    user_data = {'id': 0, 'account': 'guest', 'nickname': '游客'}
    if token:
        try:
            decoded = verify_token(token)
            user_data = decoded
        except Exception:
            pass
    async with sio.session(sid) as session:
        session['user'] = user_data
    print(f'[Socket] {user_data.get("account")} connected ({sid})')


@sio.event
async def disconnect(sid):
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
        if player_id and player_id != 0:
            sess = room_manager.get_player_room(player_id)
            if sess and sess.mode != 'single':
                # 对局未开始（waiting）→ 销毁房间；对局中 → 保留房间供重连
                if sess.status == 'waiting':
                    room_manager.leave_room(player_id)
                    await sio.emit('game:opponent_left',
                                   {'message': '对手已离开房间'}, room=sess.room_id)
                else:
                    # 断线：暂停回合倒计时 + 启动 60 秒重连倒计时 + 广播
                    pause_turn(sess.room_id)
                    start_disconnect_countdown(sess.room_id, player_id)
                    await broadcast_game_state(sess.room_id)
                    await sio.emit('game:opponent_left',
                                   {'message': f'对手已断开连接，{DISCONNECT_WAIT_SECONDS} 秒内未重连将判定弃赛',
                                    'disconnectDeadline': int(sess.disconnect_deadline * 1000) if sess.disconnect_deadline else None},
                                   room=sess.room_id, skip_sid=sid)


@sio.on('game:quit')
async def game_quit(sid, data):
    """联机对局中主动退出：等同弃赛（对方获胜，不录制训练数据）"""
    room_id = data.get('roomId') if isinstance(data, dict) else None
    if not room_id:
        return
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
    sess = room_manager.get_room(room_id)
    if not sess or sess.status != 'playing' or sess.mode == 'single':
        return
    if player_id not in (sess.good_player_id, sess.evil_player_id):
        return
    await _handle_abandon(room_id, player_id, message='对手已退出对局，你获胜')


@sio.on('game:surrender')
async def game_surrender(sid, data):
    """联机对局中主动投降：对方获胜，正常结算并录制训练数据"""
    room_id = data.get('roomId') if isinstance(data, dict) else None
    if not room_id:
        return
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
    sess = room_manager.get_room(room_id)
    if not sess or sess.status != 'playing' or sess.mode == 'single':
        return
    if player_id not in (sess.good_player_id, sess.evil_player_id):
        return
    winner = 'evil' if player_id == sess.good_player_id else 'good'
    sess.ended_by = 'surrender'   # 认输局标记：录制数据含此字段，审计时豁免胜负一致性检查
    sess.status = 'finished'
    sess.winner = winner
    stop_turn(room_id)
    cancel_disconnect_countdown(room_id)
    _maybe_record(sess)
    await sio.emit('game:result', {
        'winner': winner,
        'detail': sess.get_record_detail(),
    }, room=room_id)
    room_manager.remove_room(room_id)
    print(f'[Socket] 投降结算: room={room_id} 投降方={player_id} 胜者={winner}')


@sio.on('game:abandon')
async def game_abandon(sid, data):
    """单机对局放弃：本局作废，不结算，直接清理房间"""
    room_id = data.get('roomId') if isinstance(data, dict) else None
    if not room_id:
        return
    sess = room_manager.get_room(room_id)
    if not sess or sess.mode != 'single':
        return
    if sess.status == 'finished':
        return
    stop_turn(room_id)
    room_manager.remove_room(room_id)
    print(f'[Socket] 单机放弃: room={room_id}')


@sio.on('game:single_start')
async def game_single_start(sid, data):
    print(f'[Socket] game:single_start received: {data}')
    print(f'[Socket] data type: {type(data).__name__}')
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    room_id = data.get('roomId') if isinstance(data, dict) else None
    role = data.get('role') if isinstance(data, dict) else None
    print(f'[Socket] room_id={room_id!r} role={role!r} player_id={player_id!r}')
    print(f'[Socket] room_manager id={id(room_manager)}, active rooms: {list(room_manager.rooms.keys())}')
    sess = room_manager.get_room(room_id)
    print(f'[Socket] room={room_id} sess={sess is not None} mode={sess.mode if sess else "N/A"}')
    if not sess or sess.mode != 'single':
        print(f'[Socket] REJECT: room invalid')
        await sio.emit('game:error', {'code': 2001, 'message': '房间无效'}, to=sid)
        return

    await sio.enter_room(sid, room_id)
    sess.status = 'playing'

    state = sess.get_state('good' if role == 'good' else 'evil')
    state['yourRole'] = role
    await sio.emit('game:state', state, to=sid)

    if sess.status == 'playing':
        await asyncio.sleep(0.5)
        await auto_advance_loop(room_id)


@sio.on('game:ready')
async def game_ready(sid, data):
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    room_id = data.get('roomId')
    sess = room_manager.get_room(room_id)
    if not sess:
        return

    if sess.good_player_id == player_id:
        sess.good_player_ready = True
    if sess.evil_player_id == player_id:
        sess.evil_player_ready = True

    await sio.enter_room(sid, room_id)
    await broadcast_room_info(room_id)

    if sess.mode != 'single' and sess.good_player_ready and sess.evil_player_ready:
        await start_game(room_id)
        return

    my_role = 'good' if sess.good_player_id == player_id else 'evil'
    state = sess.get_state(my_role)
    state['yourRole'] = my_role
    await sio.emit('game:state', state, to=sid)


@sio.on('game:match_start')
async def game_match_start(sid, data):
    """进入匹配队列，尝试撮合；成功则通知双方"""
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    # 清空旧匹配
    room_manager.remove_from_match_queue(player_id)
    # 若已在房间中，先离开
    existing = room_manager.get_player_room(player_id)
    if existing and existing.mode != 'single':
        room_manager.leave_room(player_id)
        await sio.leave_room(sid, existing.room_id)

    room_manager.add_to_match_queue(player_id, sid)
    match_result = room_manager.try_match()

    if match_result:
        room_id = match_result['roomId']
        for p in match_result['players']:
            p_sid = p.get('sid')
            await sio.emit('game:match_found', {
                'roomId': room_id,
                'role': p['role'],
                'opponent': '玩家',
            }, to=p_sid)
    else:
        await sio.emit('game:match_waiting', {'message': '正在寻找对手...'}, to=sid)


@sio.on('game:match_cancel')
async def game_match_cancel(sid, data):
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
    room_manager.remove_from_match_queue(player_id)
    await sio.emit('game:match_cancelled', {}, to=sid)


@sio.on('game:create_invite')
async def game_create_invite(sid, data):
    """创建邀请房间（双人，建房者可指定或随机分配阵营），返回邀请码（房间号）"""
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    # 若已有房间先离开
    existing = room_manager.get_player_room(player_id)
    if existing and existing.mode != 'single':
        room_manager.leave_room(player_id)
        await sio.leave_room(sid, existing.room_id)

    room_id = room_manager.generate_invite_code()
    room_manager.create_room({
        'mode': 'invite',
        'goodPlayerId': None,   # 等待加入后分配
        'evilPlayerId': None,
    }, room_id=room_id)
    # 建房者阵营：data.role 支持 good/evil/random（默认 random）
    import random as _random
    host_role = data.get('role') if isinstance(data, dict) else None
    if host_role not in ('good', 'evil'):
        host_role = _random.choice(['good', 'evil'])
    sess = room_manager.get_room(room_id)
    user_account = user.get('account', '')
    if host_role == 'good':
        sess.good_player_id = player_id
        sess.good_player_account = user_account
    else:
        sess.evil_player_id = player_id
        sess.evil_player_account = user_account
    room_manager.player_rooms[str(player_id)] = room_id
    sess.status = 'waiting'
    await sio.enter_room(sid, room_id)

    await sio.emit('game:invite_created', {
        'roomId': room_id,
        'myRole': host_role,
        'inviteCode': room_id,
    }, to=sid)


@sio.on('game:invite_enter')
async def game_invite_enter(sid, data):
    """房主点击「进入房间」：邀请码立即销毁，之后任何人无法再用该码加入"""
    room_id = data.get('roomId') if isinstance(data, dict) else None
    if not room_id:
        return
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
    sess = room_manager.get_room(room_id)
    if not sess or sess.mode != 'invite':
        return
    # 仅房主可销毁邀请码
    if player_id not in (sess.good_player_id, sess.evil_player_id):
        return
    sess.invite_consumed = True
    print(f'[Socket] 邀请码销毁: room={room_id}')


@sio.on('game:leave_room')
async def game_leave_room(sid, data):
    """等待阶段主动离开房间：房间只剩一人时销毁房间，双方都可重新走创建/加入流程"""
    room_id = data.get('roomId') if isinstance(data, dict) else None
    if not room_id:
        return
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')
    sess = room_manager.get_room(room_id)
    if not sess or sess.status != 'waiting':
        return
    if player_id not in (sess.good_player_id, sess.evil_player_id):
        return
    room_manager.leave_room(player_id)
    await sio.leave_room(sid, room_id)

    other_id = sess.evil_player_id if player_id == sess.good_player_id else sess.good_player_id
    if other_id is None:
        # 只剩离开者一人 → 房间销毁
        room_manager.remove_room(room_id)
        print(f'[Socket] 等待阶段离开并销毁房间: room={room_id}')
    else:
        # 通知留守方
        await sio.emit('game:opponent_left',
                       {'message': '对手已离开房间'}, room=room_id)


@sio.on('game:join_by_invite')
async def game_join_by_invite(sid, data):
    """好友凭邀请码（房间号）加入邀请房间"""
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    invite_code = data.get('inviteCode', '').strip()
    sess = room_manager.get_room(invite_code)
    if not sess or sess.mode != 'invite':
        await sio.emit('game:error', {'code': 2001, 'message': '邀请码无效'}, to=sid)
        return
    if getattr(sess, 'invite_consumed', False):
        await sio.emit('game:error', {'code': 2005, 'message': '邀请码已失效（房主已进入房间）'}, to=sid)
        return
    if sess.status != 'waiting':
        await sio.emit('game:error', {'code': 2004, 'message': '房间已满或已开始'}, to=sid)
        return
    if sess.good_player_id == player_id or sess.evil_player_id == player_id:
        await sio.emit('game:error', {'code': 2004, 'message': '你已在房间中'}, to=sid)
        return

    # 加入空余阵营
    user_account = user.get('account', '')
    if sess.good_player_id is None:
        sess.good_player_id = player_id
        sess.good_player_account = user_account
        my_role = 'good'
    else:
        sess.evil_player_id = player_id
        sess.evil_player_account = user_account
        my_role = 'evil'
    room_manager.player_rooms[str(player_id)] = invite_code
    await sio.enter_room(sid, invite_code)

    await sio.emit('game:joined', {
        'roomId': invite_code, 'myRole': my_role,
    }, to=sid)

    # 通知房间内所有玩家 presence 变化（双方点准备后才由 start_game 开局）
    await broadcast_room_info(invite_code)


@sio.on('game:place_surveillance')
async def game_place_surveillance(sid, data):
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    room_id = data.get('roomId')
    targets = data.get('targets', [])
    sess = room_manager.get_room(room_id)
    if not sess:
        return

    result = sess.place_surveillance_action(player_id, targets)
    if not result.get('success'):
        await sio.emit('game:error', {'code': 2004, 'message': result['error']}, to=sid)
        return

    # 正派完成操作 → 结束倒计时，广播结果 + 阶段结束倒计时（展示缓冲）
    stop_turn(room_id)
    await broadcast_game_state(room_id, {'countdown': PHASE_WAIT_SECONDS})
    await asyncio.sleep(PHASE_WAIT_SECONDS)
    await auto_advance_loop(room_id)


@sio.on('game:play_action_card')
async def game_play_action_card(sid, data):
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    room_id = data.get('roomId')
    card_index = data.get('cardIndex')
    actions = data.get('actions', [])
    sess = room_manager.get_room(room_id)
    if not sess:
        return

    result = sess.play_action_card(player_id, card_index, actions)
    if not result.get('success'):
        await sio.emit('game:error', {'code': 2004, 'message': result['error']}, to=sid)
        return

    # 反派完成行动 → 结束倒计时，广播公示数据（行动卡 + 死亡标记）
    stop_turn(room_id)
    await broadcast_game_state(room_id, {'countdown': PHASE_WAIT_SECONDS})
    await asyncio.sleep(PHASE_WAIT_SECONDS)
    await auto_advance_loop(room_id)


@sio.on('game:skip_action')
async def game_skip_action(sid, data):
    """真人反派跳过本回合行动（无可用卡/无可行动反派）"""
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    room_id = data.get('roomId')
    sess = room_manager.get_room(room_id)
    if not sess:
        return

    result = sess.evil_skip_action(player_id)
    if not result.get('success'):
        await sio.emit('game:error', {'code': 2004, 'message': result['error']}, to=sid)
        return

    stop_turn(room_id)
    await broadcast_game_state(room_id, {'countdown': PHASE_WAIT_SECONDS})
    await asyncio.sleep(PHASE_WAIT_SECONDS)
    await auto_advance_loop(room_id)


@sio.on('game:sync')
async def game_sync(sid, data):
    """断线重连 / 同步：凭 roomId 重新进入房间并下发最新可见视图"""
    async with sio.session(sid) as session:
        user = session.get('user', {})
        player_id = user.get('id')

    # 优先按 roomId 重连（断线重连场景）；否则按玩家房间映射
    room_id = data.get('roomId') if isinstance(data, dict) else None
    sess = room_manager.get_room(room_id) if room_id else None
    if not sess:
        sess = room_manager.get_player_room(player_id)
    if not sess:
        # 房间已不存在（弃赛清理/对局结束）→ 告知玩家对局已结束
        await sio.emit('game:abandoned', {
            'message': '对局已结束（你可能已因断线超时被判弃赛）',
        }, to=sid)
        return

    # 重新进入房间
    await sio.enter_room(sid, sess.room_id)
    room_manager.player_rooms[str(player_id)] = sess.room_id

    # 重连的正是断线等待重连的玩家 → 取消弃赛倒计时
    if sess.disconnect_player_id is not None and sess.disconnect_player_id == player_id:
        cancel_disconnect_countdown(sess.room_id)

    # 断线暂停后，双方都回房则恢复倒计时
    if sess.paused and len(await _room_sids(sess.room_id)) >= 2:
        resume_turn(sess.room_id)
        await broadcast_game_state(sess.room_id)

    my_role = ('good' if sess.good_player_id == player_id else
               'evil' if sess.evil_player_id == player_id else 'good')
    state = sess.get_state(my_role)
    state['yourRole'] = my_role
    state['reconnected'] = True
    await sio.emit('game:state', state, to=sid)
    # 同步房间 presence（等待界面）
    await sio.emit('game:room_update', sess.get_room_info(), to=sid)


@sio.on('game:rematch')
async def game_rematch(sid, data):
    await sio.emit('game:rematch_ready', {'roomId': None}, to=sid)


# ==================== 数据库初始化 ====================

def init_db():
    import pymysql
    conn = pymysql.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=int(os.getenv('DB_PORT', 3306)),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        db_name = os.getenv('DB_NAME', 'happy_threads')
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cur.execute(f"USE `{db_name}`")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    account VARCHAR(16) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    nickname VARCHAR(20) DEFAULT '',
                    avatar_type VARCHAR(16) DEFAULT NULL,
                    avatar_value VARCHAR(255) DEFAULT NULL,
                    play_intro TINYINT(1) NOT NULL DEFAULT 1,
                    illust_version VARCHAR(16) NOT NULL DEFAULT 'v1',
                    background_pref VARCHAR(32) NOT NULL DEFAULT 'random',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_account (account)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            # 幂等迁移：为已存在的 users 表补齐账号设置列
            for col, ddl in [
                ('avatar_type', "ALTER TABLE users ADD COLUMN avatar_type VARCHAR(16) DEFAULT NULL"),
                ('avatar_value', "ALTER TABLE users ADD COLUMN avatar_value VARCHAR(255) DEFAULT NULL"),
                ('play_intro', "ALTER TABLE users ADD COLUMN play_intro TINYINT(1) NOT NULL DEFAULT 1"),
                ('illust_version', "ALTER TABLE users ADD COLUMN illust_version VARCHAR(16) NOT NULL DEFAULT 'v1'"),
                ('background_pref', "ALTER TABLE users ADD COLUMN background_pref VARCHAR(32) NOT NULL DEFAULT 'random'"),
            ]:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA=%s AND TABLE_NAME='users' AND COLUMN_NAME=%s",
                    (db_name, col),
                )
                if cur.fetchone()['c'] == 0:
                    cur.execute(ddl)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS game_records (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(36) NOT NULL,
                    mode ENUM('single','match','invite') NOT NULL,
                    good_player_id BIGINT UNSIGNED,
                    evil_player_id BIGINT UNSIGNED,
                    ai_difficulty ENUM('easy','normal','hard'),
                    winner ENUM('good','evil'),
                    total_rounds TINYINT UNSIGNED,
                    detail_json JSON,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_good_player (good_player_id),
                    INDEX idx_evil_player (evil_player_id),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
        conn.commit()
        print('[DB] Database initialized')
    finally:
        conn.close()


# ==================== 启动 ====================

# 将 Socket.IO 与 FastAPI 合并为同一个 ASGI 应用
app = socketio.ASGIApp(sio, app)

PORT = int(os.getenv('PORT', 3000))


if __name__ == '__main__':
    init_db()
    print(f'[Server] REST API + Socket.IO → http://0.0.0.0:{PORT}')
    uvicorn.run(app, host='0.0.0.0', port=PORT, log_level='info')