"""
热搜基金 API
从东方财富 fundhot8 抓取混合型热搜基金，Redis 缓存
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter

from core.config import settings
from utils.hot_search_manager import hot_search_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hot-search", tags=["热搜基金"])


@router.get("/funds")
async def get_hot_search_funds():
    """获取热搜基金列表（混合型，含近一年收益率）"""
    if not settings.HOT_SEARCH_FEATURE_ENABLED:
        return {"data": [], "feature_enabled": False}

    data = await hot_search_manager.get_hot_funds()
    return {
        "data": data,
        "last_update": datetime.now(timezone.utc).isoformat(),
    }
