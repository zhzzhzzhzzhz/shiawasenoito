from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from middleware.auth import get_current_user, verify_token
from services.room_manager import room_manager

router = APIRouter(prefix='/api/room', tags=['room'])


async def get_optional_user(request: Request) -> dict:
    """可选认证：有token则解析，无则返回游客"""
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            return verify_token(auth[7:])
        except Exception:
            pass
    return {'id': 0, 'account': 'guest'}


class CreateRoomBody(BaseModel):
    mode: str
    aiDifficulty: str = 'normal'
    role: str = 'good'  # 'good' | 'evil' | 'random'


class JoinRoomBody(BaseModel):
    roomId: str


@router.post('/create')
async def create_room(body: CreateRoomBody, user: dict = Depends(get_optional_user)):
    if body.mode not in ('single', 'match', 'invite'):
        return {'code': 4001, 'message': '无效的游戏模式', 'data': None}

    # 随机阵营分配：建房者随机成为正派或反派
    import random as _random
    assigned_role = body.role
    if body.role == 'random':
        assigned_role = _random.choice(['good', 'evil'])

    room_id = room_manager.create_room({
        'mode': body.mode,
        'aiDifficulty': body.aiDifficulty,
        'goodPlayerId': user['id'] if assigned_role == 'good' else None,
        'evilPlayerId': user['id'] if assigned_role == 'evil' else None,
    })

    session = room_manager.get_room(room_id)
    state = session.get_state('good' if assigned_role == 'good' else 'evil')

    return {
        'code': 0, 'message': '房间创建成功',
        'data': {'roomId': room_id, 'myRole': assigned_role, 'state': state},
    }


@router.post('/join')
async def join_room(body: JoinRoomBody, user: dict = Depends(get_current_user)):
    if not body.roomId:
        return {'code': 4001, 'message': '缺少roomId参数', 'data': None}

    result = room_manager.join_room(user['id'], body.roomId)
    if not result['success']:
        return {'code': result.get('code', 5000), 'message': result['error'], 'data': None}

    return {
        'code': 0, 'message': '加入房间成功',
        'data': {'roomId': body.roomId, 'role': result['role']},
    }


@router.post('/leave')
async def leave_room(user: dict = Depends(get_current_user)):
    result = room_manager.leave_room(user['id'])
    if not result['success']:
        return {'code': 2001, 'message': result['error'], 'data': None}
    return {'code': 0, 'message': '已离开房间', 'data': None}


@router.get('/{room_id}')
async def get_room(room_id: str):
    session = room_manager.get_room(room_id)
    if not session:
        return {'code': 2001, 'message': '房间不存在', 'data': None}

    return {
        'code': 0, 'message': 'ok',
        'data': {
            'roomId': room_id, 'mode': session.mode,
            'status': session.status, 'round': session.round,
            'phase': session.phase, 'winner': session.winner,
            'playerCount': (1 if session.good_player_id else 0) +
                           (1 if session.evil_player_id else 0),
        },
    }


@router.post('/match/start')
async def match_start(user: dict = Depends(get_current_user)):
    room_manager.add_to_match_queue(user['id'])
    match_result = room_manager.try_match()
    if match_result:
        pass  # 匹配成功，后续通过Socket通知
    return {'code': 0, 'message': '已加入匹配队列', 'data': None}


@router.post('/match/cancel')
async def match_cancel(user: dict = Depends(get_current_user)):
    room_manager.remove_from_match_queue(user['id'])
    return {'code': 0, 'message': '已取消匹配', 'data': None}
