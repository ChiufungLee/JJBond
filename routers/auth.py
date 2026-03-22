from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Tuple

import schemas
from crud import user as user_crud
from utils.jwt import create_access_token, revoke_token, ACCESS_TOKEN_EXPIRE_MINUTES
from core.database import get_db
from core.limiter import limiter
from core.dependencies import get_current_user_with_token
from models.user import User

router = APIRouter(prefix="/auth", tags=["authentication"])

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
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "created_at": user.created_at,
    }


@router.post("/logout", response_model=schemas.LogoutResponse)
def logout(
    current_user_and_token: Tuple[User, str] = Depends(get_current_user_with_token),
):
    """
    用户登出，立即吊销当前 token。
    token 被加入 Redis 黑名单，TTL = token 剩余有效期，到期自动清除。
    Redis 不可用时降级处理：接口正常返回，token 将在过期时间后自然失效。
    """
    _, token = current_user_and_token
    revoke_token(token)
    return {"message": "登出成功"}