from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
import imghdr
import os
import uuid

from core.database import get_db
from schemas.user import User, UsernameUpdate, UserInfoUpdate
from crud.user import get_user_by_username, update_username, update_user_info
from core.dependencies import get_current_user
from core.config import settings

MAX_AVATAR_SIZE = 2 * 1024 * 1024
IMAGE_EXTENSIONS = {
    "jpeg": ".jpg",
    "png": ".png",
    "gif": ".gif",
    "bmp": ".bmp",
    "webp": ".webp",
}

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
    if not avatar.content_type or not avatar.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传图片文件"
        )

    content = await avatar.read(MAX_AVATAR_SIZE + 1)
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像文件不能超过2MB"
        )

    image_type = imghdr.what(None, h=content)
    file_ext = IMAGE_EXTENSIONS.get(image_type)
    if not file_ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 JPG、PNG、GIF、BMP、WEBP 图片"
        )

    os.makedirs(settings.AVATAR_UPLOAD_DIR, exist_ok=True)

    filename = f"{current_user.id}_{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(settings.AVATAR_UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as f:
            f.write(content)

        avatar_url = f"/static/avatars/{filename}"
        update_user_info(db, current_user, avatar_url=avatar_url)
        return {"avatar_url": avatar_url}
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    finally:
        await avatar.close()


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