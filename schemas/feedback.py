from pydantic import BaseModel, Field
from datetime import datetime


class FeedbackCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=300, description="建议内容")


class Feedback(BaseModel):
    id: int
    user_id: int
    content: str
    created_at: datetime

    from_attributes = True
