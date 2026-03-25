from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
import os
import uuid
from datetime import datetime, timezone

from core.database import get_db
from schemas.user import User, UsernameUpdate, UserInfoUpdate
from crud.user import get_user_by_username, update_username, update_user_info
from core.dependencies import get_current_user
from core.config import settings

router = APIRouter(prefix="/users", tags=["用户"])

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return current_user


@router.put("/me/username", response_model=User)
async def update_user_username(
    username_update: UsernameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """修改当前用户名"""
    updated_user = update_username(db, current_user, username_update.username)
    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被使用"
        )
    return updated_user


@router.put("/me/info", response_model=User)
async def update_user_info_endpoint(
    info_update: UserInfoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新当前用户信息（昵称、用户名）"""
    updated_user = update_user_info(
        db,
        current_user,
        username=info_update.username,
        nickname=info_update.nickname
    )
    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被使用"
        )
    return updated_user


@router.post("/me/avatar")
async def upload_avatar(
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """上传用户头像"""
    # 验证文件类型
    if not avatar.content_type or not avatar.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传图片文件"
        )

    # 创建上传目录
    upload_dir = "uploads/avatars"
    os.makedirs(upload_dir, exist_ok=True)

    # 生成文件名
    file_ext = os.path.splitext(avatar.filename or "image.jpg")[1] or ".jpg"
    filename = f"{current_user.id}_{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(upload_dir, filename)

    # 保存文件
    content = await avatar.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 生成访问URL
    avatar_url = f"/static/avatars/{filename}"

    # 更新用户头像
    update_user_info(db, current_user, avatar_url=avatar_url)

    return {"avatar_url": avatar_url}


@router.get("/{username}", response_model=User)
async def read_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户信息"""
    user = get_user_by_username(db, username=username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return user