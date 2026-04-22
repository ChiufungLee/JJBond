from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
from typing import Tuple
import logging
import json
import aiohttp

import schemas
from crud import user as user_crud
from utils.jwt import (
    create_access_token,
    create_refresh_token,
    revoke_token,
    verify_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_TYPE,
)
from core.database import get_db
from core.limiter import limiter
from core.dependencies import get_current_user_with_token
from core.config import settings
from core.http_client import get_http_session
from models.user import User

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


def _should_remember_login(request: Request) -> bool:
    remember_me = request.headers.get("x-remember-me", "")
    return remember_me.lower() in {"1", "true", "yes", "on"}


def _build_token_payload(user: User, openid: str | None = None) -> dict:
    token_sub = user.username or (f"wx_{openid}" if openid else "")
    payload = {"sub": token_sub}
    if openid:
        payload["openid"] = openid
    return payload


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
    )


@router.post("/register", response_model=schemas.User)
@limiter.limit("3/minute")
def register(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    用户注册。
    限流：同一 IP 每分钟最多 3 次，防止批量注册。
    """
    db_user = user_crud.get_user_by_username(db, username=user.username)
    db_user_email = user_crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="该用户名已存在！")
    if db_user_email:
        raise HTTPException(status_code=400, detail="该邮箱已被使用！")
    return user_crud.create_user(db=db, user=user)


@router.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    用户登录，返回 JWT Token。
    限流：同一 IP 每分钟最多 5 次，防止暴力破解。
    """
    user = user_crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_payload = _build_token_payload(user)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data=token_payload, expires_delta=access_token_expires)

    if _should_remember_login(request):
        refresh_token = create_refresh_token(data=token_payload)
        _set_refresh_cookie(response, refresh_token)
    else:
        _clear_refresh_cookie(response)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


@router.post("/logout", response_model=schemas.LogoutResponse)
async def logout(
    request: Request,
    response: Response,
    current_user_and_token: Tuple[User, str] = Depends(get_current_user_with_token),
):
    """
    用户登出，立即吊销当前 token。
    token 被加入 Redis 黑名单，TTL = token 剩余有效期，到期自动清除。
    Redis 不可用时降级处理：接口正常返回，token 将在过期时间后自然失效。
    """
    _, token = current_user_and_token
    await revoke_token(token)

    refresh_token = request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if refresh_token:
        await revoke_token(refresh_token)

    _clear_refresh_cookie(response)
    return {"message": "登出成功"}


@router.post("/refresh", response_model=schemas.RefreshTokenResponse)
async def refresh_token(request: Request, response: Response):
    refresh_token_value = request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    payload = await verify_token(refresh_token_value, token_type=REFRESH_TOKEN_TYPE)
    if payload is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid",
        )

    if not payload.get("sub"):
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid",
        )

    access_payload = {"sub": payload.get("sub")}
    if payload.get("openid"):
        access_payload["openid"] = payload.get("openid")

    access_token = create_access_token(
        data=access_payload,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


async def _get_wechat_session_info(code: str) -> dict:
    """
    调用微信 API 获取 openid 和 session_key
    文档: https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
    """
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信小程序未配置，请联系管理员"
        )

    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APPID,
        "secret": settings.WECHAT_SECRET,
        "js_code": code,
        "grant_type": "authorization_code"
    }

    try:
        session = get_http_session()
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            resp.raise_for_status()
            # 微信 API 返回 Content-Type 是 text/plain，需要手动解析 JSON
            text = await resp.text()
            data = json.loads(text)

            if data.get("errcode"):
                logger.error(f"微信登录失败: {data}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"微信登录失败: {data.get('errmsg', '未知错误')}"
                )

            return {
                "openid": data.get("openid"),
                "session_key": data.get("session_key"),
                "unionid": data.get("unionid")
            }
    except json.JSONDecodeError as e:
        logger.error(f"解析微信响应失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信服务响应异常，请稍后重试"
        )
    except aiohttp.ClientError as e:
        logger.error(f"调用微信 API 失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信服务暂不可用，请稍后重试"
        )


@router.post("/wechat-login", response_model=schemas.WechatLoginResponse)
@limiter.limit("10/minute")
async def wechat_login(
    request: Request,
    data: schemas.WechatLoginRequest,
    db: Session = Depends(get_db)
):
    """
    微信授权登录
    1. 用 code 换取 openid
    2. 根据 openid 查找或创建用户
    3. 更新用户昵称和头像（如果有）
    4. 返回 JWT token
    """
    # 1. 调用微信 API 获取 openid
    wechat_info = await _get_wechat_session_info(data.code)
    openid = wechat_info["openid"]
    unionid = wechat_info.get("unionid")

    if not openid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="获取微信用户信息失败"
        )

    # 2. 查找或创建用户
    user = user_crud.get_user_by_openid(db, openid)
    is_new_user = False

    if not user:
        # 创建新用户
        user = user_crud.create_wechat_user(
            db=db,
            openid=openid,
            nickname=data.nickname,
            avatar_url=data.avatar_url,
            unionid=unionid
        )
        is_new_user = True
        logger.info(f"新用户注册: openid={openid}, nickname={data.nickname}")
    else:
        # 更新用户信息（如果有新值）
        if data.nickname or data.avatar_url:
            user = user_crud.update_wechat_user_info(
                db=db,
                user=user,
                nickname=data.nickname,
                avatar_url=data.avatar_url
            )

    # 3. 生成 JWT token
    token_payload = _build_token_payload(user, openid)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data=token_payload,
        expires_delta=access_token_expires
    )

    if not is_new_user:
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "is_new_user": is_new_user,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }