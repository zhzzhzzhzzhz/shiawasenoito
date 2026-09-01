"""
房间管理器 — 管理所有活跃游戏房间
"""
import uuid
import random
from services.game_session import GameSession


class RoomManager:
    def __init__(self):
        self.rooms = {}
        self.player_rooms = {}
        self.match_queue = []
        print(f'[RoomManager] Instance created: id={id(self)}')

    def generate_invite_code(self) -> str:
        """生成 6 位纯数字邀请码，保证与现有活跃房间不冲突"""
        while True:
            code = str(random.randint(100000, 999999))
            if code not in self.rooms:
                return code

    def create_room(self, options: dict = None, room_id: str = None) -> str:
        if options is None:
            options = {}
        if room_id is None:
            room_id = str(uuid.uuid4())[:6]
        session = GameSession(room_id, options)

        if options.get('mode') == 'single':
            session.status = 'playing'

        self.rooms[room_id] = session
        if options.get('goodPlayerId') is not None:
            self.player_rooms[str(options['goodPlayerId'])] = room_id
        if options.get('evilPlayerId') is not None:
            self.player_rooms[str(options['evilPlayerId'])] = room_id

        print(f'[RoomManager] Created room {room_id} mode={options.get("mode")} '
              f'good={options.get("goodPlayerId")} evil={options.get("evilPlayerId")} '
              f'total_rooms={len(self.rooms)}')
        return room_id

    def join_room(self, player_id, room_id: str) -> dict:
        session = self.rooms.get(room_id)
        if not session:
            return {'success': False, 'error': '房间不存在', 'code': 2001}
        if session.mode == 'single':
            return {'success': False, 'error': '单机模式不能加入', 'code': 2004}

        if session.evil_player_id is None:
            session.evil_player_id = player_id
            self.player_rooms[str(player_id)] = room_id
            return {'success': True, 'role': 'evil'}
        if session.good_player_id is None:
            session.good_player_id = player_id
            self.player_rooms[str(player_id)] = room_id
            return {'success': True, 'role': 'good'}

        return {'success': False, 'error': '房间已满', 'code': 2002}

    def leave_room(self, player_id) -> dict:
        room_id = self.player_rooms.pop(str(player_id), None)
        if not room_id:
            return {'success': False, 'error': '你不在任何房间', 'code': 2001}

        session = self.rooms.get(room_id)
        if not session:
            return {'success': False, 'error': '房间不存在', 'code': 2001}

        if session.mode == 'single':
            self.rooms.pop(room_id, None)
            return {'success': True}

        session.status = 'finished'
        session.winner = 'evil' if session.good_player_id == player_id else 'good'
        return {'success': True, 'roomId': room_id}

    def remove_room(self, room_id: str):
        """弃赛/对局结束清理：移除房间并清理双方 player_rooms 映射，返回被移除的会话"""
        session = self.rooms.pop(room_id, None)
        if not session:
            return None
        if session.good_player_id is not None:
            self.player_rooms.pop(str(session.good_player_id), None)
        if session.evil_player_id is not None:
            self.player_rooms.pop(str(session.evil_player_id), None)
        print(f'[RoomManager] Removed room {room_id} (abandon/finish), '
              f'total_rooms={len(self.rooms)}')
        return session

    def get_player_room(self, player_id):
        room_id = self.player_rooms.get(str(player_id))
        if not room_id:
            return None
        return self.rooms.get(room_id)

    def get_room(self, room_id: str):
        result = self.rooms.get(room_id)
        if result is None:
            print(f'[RoomManager] get_room({room_id!r}) -> MISS (have: {list(self.rooms.keys())})')
        return result

    def add_to_match_queue(self, player_id, sid=None):
        self.match_queue = [m for m in self.match_queue if m['playerId'] != player_id]
        self.match_queue.append({'playerId': player_id, 'sid': sid})

    def remove_from_match_queue(self, player_id):
        self.match_queue = [m for m in self.match_queue if m['playerId'] != player_id]

    def try_match(self):
        if len(self.match_queue) < 2:
            return None
        p1 = self.match_queue.pop(0)
        p2 = self.match_queue.pop(0)
        room_id = self.create_room({
            'mode': 'match',
            'goodPlayerId': p1['playerId'],
            'evilPlayerId': p2['playerId'],
        })
        session = self.rooms[room_id]
        session.status = 'waiting'
        return {
            'roomId': room_id,
            'players': [
                {'playerId': p1['playerId'], 'sid': p1.get('sid'), 'role': 'good'},
                {'playerId': p2['playerId'], 'sid': p2.get('sid'), 'role': 'evil'},
            ],
        }


room_manager = RoomManager()