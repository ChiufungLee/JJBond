from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from core.config import settings
from core.database import get_db
from utils.jwt import verify_token
from crud.user import get_user_by_username, get_user_by_openid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    获取当前用户。
    支持两种 token：
    - 普通用户：sub = username
    - 微信用户：sub = username, openid = openid（优先用 openid 查找）
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    username = payload.get("sub")
    openid = payload.get("openid")  # 微信用户 token 中包含 openid

    if not username:
        raise credentials_exception

    # 优先用 openid 查找微信用户（避免 username 冲突）
    if openid:
        user = get_user_by_openid(db, openid)
        if user:
            return user

    # 降级用 username 查找（普通用户或兼容旧 token）
    user = get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception

    return user


async def get_current_user_with_token(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    与 get_current_user 相同，但额外返回原始 token 字符串。
    专供需要操作 token 本身的接口（如 /logout）使用。
    返回值：(user_orm_object, token_str)
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    username = payload.get("sub")
    openid = payload.get("openid")

    if not username:
        raise credentials_exception

    # 优先用 openid 查找微信用户
    if openid:
        user = get_user_by_openid(db, openid)
        if user:
            return user, token

    user = get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception

    return user, token


async def require_ranking_sync_token(
    x_ranking_sync_token: str | None = Header(default=None),
):
    if not settings.RANKING_SYNC_TOKEN or x_ranking_sync_token != settings.RANKING_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )