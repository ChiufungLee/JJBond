# routers/announcement.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from core.database import get_db
from models.announcement import Announcement
from schemas.announcement import AnnouncementOut

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("/", response_model=list[AnnouncementOut])
def get_announcements(
    position: Optional[int] = Query(None, description="显示位置过滤: 0=首页, 1=关于我们"),
    pinned: Optional[bool] = Query(None, description="只返回置顶公告"),
    db: Session = Depends(get_db),
):
    query = db.query(Announcement)
    if position is not None:
        query = query.filter(Announcement.display_position == position)
    if pinned is not None:
        query = query.filter(Announcement.is_pinned == pinned)
    query = query.order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    return query.all()
