import jwt
import os
from dotenv import load_dotenv
from fastapi import Request, HTTPException

load_dotenv()
JWT_SECRET = os.getenv('JWT_SECRET', 'dev-secret')


def create_token(user_id: int, account: str) -> str:
    return jwt.encode({'id': user_id, 'account': account}, JWT_SECRET, algorithm='HS256')


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail='未登录或Token过期')


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='未登录或Token过期')
    return verify_token(auth[7:])
