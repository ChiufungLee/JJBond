# schemas/announcement.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    display_position: int = 0
    is_pinned: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
