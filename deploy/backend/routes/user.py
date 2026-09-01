import os
import re
import uuid
import bcrypt
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from config.database import query, execute
from middleware.auth import create_token, get_current_user

router = APIRouter(prefix='/api/user', tags=['user'])

# 头像上传目录（backend/uploads/avatars）
UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'avatars'
)
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB


def _user_dict(row: dict) -> dict:
    """把数据库行转成 API 用户对象（snake_case → camelCase）"""
    return {
        'id': row['id'],
        'account': row['account'],
        'nickname': row.get('nickname') or '',
        'avatarType': row.get('avatar_type'),
        'avatarValue': row.get('avatar_value'),
        'playIntro': bool(row.get('play_intro', 1)),
        'illustVersion': row.get('illust_version') or 'v1',
    }


class RegisterBody(BaseModel):
    account: str
    password: str
    nickname: str = ''


class LoginBody(BaseModel):
    account: str
    password: str


class UpdateProfileBody(BaseModel):
    nickname: str | None = None
    avatarType: str | None = None
    avatarValue: str | None = None
    playIntro: bool | None = None
    illustVersion: str | None = None


class ChangePasswordBody(BaseModel):
    oldPassword: str
    newPassword: str


@router.post('/register')
async def register(body: RegisterBody):
    if not re.match(r'^[a-zA-Z0-9_\-@.]{1,16}$', body.account):
        return {'code': 4001, 'message': '账号必须为1-16位（字母/数字/_ - @ .）', 'data': None}
    if len(body.password) < 1 or len(body.password) > 16:
        return {'code': 4002, 'message': '密码必须为1-16位字符', 'data': None}

    existing = query('SELECT id FROM users WHERE account = %s', (body.account,))
    if existing:
        return {'code': 1001, 'message': '账号已存在', 'data': None}

    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user_id = execute(
        'INSERT INTO users (account, password, nickname) VALUES (%s, %s, %s)',
        (body.account, hashed, body.nickname)
    )

    token = create_token(user_id, body.account)
    return {
        'code': 0, 'message': '注册成功',
        'data': {
            'token': token,
            'user': {
                'id': user_id, 'account': body.account, 'nickname': body.nickname,
                'avatarType': None, 'avatarValue': None,
                'playIntro': True, 'illustVersion': 'v1',
            },
        },
    }


@router.post('/login')
async def login(body: LoginBody):
    if not body.account or not body.password:
        return {'code': 4001, 'message': '账号和密码不能为空', 'data': None}

    users = query(
        'SELECT id, account, password, nickname, avatar_type, avatar_value, play_intro, illust_version '
        'FROM users WHERE account = %s',
        (body.account,)
    )
    if not users:
        return {'code': 1002, 'message': '账号不存在', 'data': None}

    user = users[0]
    if not bcrypt.checkpw(body.password.encode(), user['password'].encode()):
        return {'code': 1003, 'message': '密码错误', 'data': None}

    token = create_token(user['id'], user['account'])
    return {
        'code': 0, 'message': '登录成功',
        'data': {
            'token': token,
            'user': _user_dict(user),
        },
    }


@router.get('/profile')
async def profile(user: dict = Depends(get_current_user)):
    users = query(
        'SELECT id, account, nickname, avatar_type, avatar_value, play_intro, illust_version, created_at '
        'FROM users WHERE id = %s',
        (user['id'],)
    )
    if not users:
        return {'code': 1002, 'message': '用户不存在', 'data': None}
    return {'code': 0, 'message': 'ok', 'data': _user_dict(users[0])}


@router.put('/profile')
async def update_profile(body: UpdateProfileBody, user: dict = Depends(get_current_user)):
    """更新昵称 / 头像 / 开屏动画开关 / 插画版本（仅更新传入的字段）"""
    sets = []
    params = []

    if body.nickname is not None:
        nickname = body.nickname.strip()
        if not nickname or len(nickname) > 20:
            return {'code': 4001, 'message': '昵称需为1-20个字符', 'data': None}
        sets.append('nickname=%s')
        params.append(nickname)

    if body.avatarType is not None:
        if body.avatarType not in ('char', 'upload'):
            return {'code': 4002, 'message': '头像类型无效', 'data': None}
        sets.append('avatar_type=%s')
        params.append(body.avatarType)
        sets.append('avatar_value=%s')
        params.append(body.avatarValue or None)

    if body.playIntro is not None:
        sets.append('play_intro=%s')
        params.append(1 if body.playIntro else 0)

    if body.illustVersion is not None:
        if body.illustVersion not in ('v1', 'v2'):
            return {'code': 4003, 'message': '插画版本无效', 'data': None}
        sets.append('illust_version=%s')
        params.append(body.illustVersion)

    if not sets:
        return {'code': 0, 'message': '无更新', 'data': None}

    params.append(user['id'])
    execute(f"UPDATE users SET {', '.join(sets)} WHERE id=%s", tuple(params))

    users = query(
        'SELECT id, account, nickname, avatar_type, avatar_value, play_intro, illust_version '
        'FROM users WHERE id = %s',
        (user['id'],)
    )
    return {'code': 0, 'message': '已更新', 'data': _user_dict(users[0])}


@router.post('/password')
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    rows = query('SELECT password FROM users WHERE id = %s', (user['id'],))
    if not rows:
        return {'code': 1002, 'message': '用户不存在', 'data': None}
    if not bcrypt.checkpw(body.oldPassword.encode(), rows[0]['password'].encode()):
        return {'code': 1003, 'message': '原密码错误', 'data': None}
    if len(body.newPassword) < 1 or len(body.newPassword) > 16:
        return {'code': 4002, 'message': '新密码必须为1-16位字符', 'data': None}

    hashed = bcrypt.hashpw(body.newPassword.encode(), bcrypt.gensalt()).decode()
    execute('UPDATE users SET password = %s WHERE id = %s', (hashed, user['id']))
    return {'code': 0, 'message': '密码已更新', 'data': None}


@router.post('/avatar/upload')
async def upload_avatar(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """上传头像图片（本地文件），保存到磁盘并更新账号头像"""
    filename = file.filename or ''
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in ALLOWED_EXT:
        return {'code': 4001, 'message': '仅支持 png/jpg/jpeg/gif/webp 图片', 'data': None}

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        return {'code': 4002, 'message': '图片大小不能超过 2MB', 'data': None}

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved_name = f'avatar_{user["id"]}_{uuid.uuid4().hex}.{ext}'
    with open(os.path.join(UPLOAD_DIR, saved_name), 'wb') as f:
        f.write(content)

    execute(
        "UPDATE users SET avatar_type='upload', avatar_value=%s WHERE id=%s",
        (saved_name, user['id'])
    )
    return {
        'code': 0, 'message': '头像已更新',
        'data': {
            'avatarType': 'upload',
            'avatarValue': saved_name,
            'avatarUrl': f'/api/user/avatar/{saved_name}',
        },
    }


@router.get('/avatar/{filename}')
async def get_avatar(filename: str):
    """返回上传的头像图片（公开，供 <img> 使用）"""
    if not re.match(r'^[a-zA-Z0-9_.-]+$', filename):
        raise HTTPException(status_code=400, detail='非法文件名')
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail='头像不存在')

    ext = filename.rsplit('.', 1)[-1].lower()
    mime = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'webp': 'image/webp',
    }.get(ext, 'application/octet-stream')
    with open(path, 'rb') as f:
        return Response(content=f.read(), media_type=mime)
