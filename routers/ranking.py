"""
基金涨跌幅排行榜 API
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from typing import Optional
from core.dependencies import require_ranking_sync_token
from core.config import settings
from core.limiter import limiter
from utils.fund_ranking import fund_ranking_manager, RankingType, RANKING_FIELD_MAP

router = APIRouter(prefix="/ranking", tags=["排行榜"])


async def _get_ranking_with_fallback(
    ranking_type: RankingType, page: int, page_size: int, desc: bool
):
    """优先从 Redis 读取，不可用时降级直接调 API"""
    result = await fund_ranking_manager.get_ranking(
        ranking_type=ranking_type,
        page=page,
        page_size=page_size,
        descending=desc,
    )

    if result is not None:
        if "error" in result and result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        return result

    # Redis 不可用，降级：直接从 API 获取单页数据
    raw = await fund_ranking_manager.fetch_ranking_data_from_api(
        ranking_type, page_index=page, page_num=page_size
    )
    if not raw:
        raise HTTPException(status_code=502, detail="获取排行榜数据失败")

    change_field = RANKING_FIELD_MAP.get(ranking_type, "daySyl")
    sorted_data = sorted(raw, key=lambda x: x.get(change_field, 0) or 0, reverse=desc)

    items = []
    for i, item in enumerate(sorted_data):
        items.append({
            "rank": (page - 1) * page_size + i + 1,
            "fundCode": item.get("fundCode", ""),
            "fundName": item.get("fundName", ""),
            "ftype": item.get("ftype", ""),
            "company": item.get("company", ""),
            "change": item.get(change_field, 0) or 0,
            "perNav": item.get("perNav"),
            "riskLevel": item.get("riskLevel"),
        })

    return {
        "rankingType": ranking_type,
        "page": page,
        "pageSize": page_size,
        "total": None,
        "lastUpdate": "",
        "data": items,
    }


@router.get("/")
@limiter.limit("20/minute")
async def get_ranking(
    request: Request,
    type: RankingType = Query("day", description="排行榜类型: day/week/month/year/ytd"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    desc: bool = Query(True, description="是否降序（涨幅从高到低）"),
):
    """获取基金涨跌幅排行榜（分页）
    数据源: 天天基金 conditionFund/fundSelect 接口
    """
    if not settings.RANKING_FEATURE_ENABLED:
        return {"rankingType": type, "page": page, "pageSize": page_size, "total": 0, "lastUpdate": "", "data": []}

    return await _get_ranking_with_fallback(type, page, page_size, desc)


@router.get("/{fund_code}")
async def get_fund_ranking(fund_code: str):
    """获取单只基金在排行榜中的信息（含各阶段涨幅）"""
    if not settings.RANKING_FEATURE_ENABLED:
        raise HTTPException(status_code=404, detail="基金未在排行榜中找到")
    result = await fund_ranking_manager.get_fund_ranking_info(fund_code)
    if result is None:
        raise HTTPException(status_code=404, detail="基金未在排行榜中找到")
    return result


@router.get("/status/cache")
async def get_cache_status():
    """获取排行榜 Redis 缓存状态"""
    return await fund_ranking_manager.get_cache_status()


@router.post("/sync")
async def sync_ranking(
    _: None = Depends(require_ranking_sync_token),
):
    """手动同步排行榜数据（需 sync_token 鉴权）"""
    success = await fund_ranking_manager.sync_ranking_data()
    if success:
        return {"message": "排行榜数据同步成功"}
    else:
        raise HTTPException(status_code=500, detail="排行榜数据同步失败")
