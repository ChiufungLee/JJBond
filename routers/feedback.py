from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from core.database import get_db
from core.dependencies import get_current_user
from core.limiter import limiter
from models.user import User
from models.feedback import FeedbackSuggestion
from schemas.feedback import FeedbackCreate, Feedback

router = APIRouter(prefix="/feedback", tags=["建议反馈"])


@router.post("/", response_model=Feedback)
@limiter.limit("5/minute")
async def create_feedback(
    request: Request,
    feedback: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """提交功能建议"""
    db_feedback = FeedbackSuggestion(
        user_id=current_user.id,
        content=feedback.content
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback
