from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class FeedbackCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=300, description="建议内容")


class Feedback(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    content: str
    status: str
    created_at: datetime
