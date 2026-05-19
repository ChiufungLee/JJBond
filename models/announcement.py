# models/announcement.py
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from .base import Base


class Announcement(Base):
    __tablename__ = 'announcements'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    display_position = Column(Integer, default=0)  # 0=首页滚动, 1=关于我们页
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(ZoneInfo("Asia/Shanghai")))
