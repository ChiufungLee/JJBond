"""
基金涨跌幅排行榜 API
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from utils.fund_ranking import fund_ranking_manager, RankingType

router = APIRouter(prefix="/ranking", tags=["排行榜"])


@router.get("/")
async def get_ranking(
    type: RankingType = Query("day", description="排行榜类型: day/week/month/year/ytd"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    desc: bool = Query(True, description="是否降序（涨幅从高到低）"),
):
    """
    获取基金涨跌幅排行榜

    - **type**: 排行榜类型
        - day: 日涨跌幅
        - week: 周涨跌幅
        - month: 月涨跌幅
        - year: 近1年
        - ytd: 今年来
    - **page**: 页码（从1开始）
    - **page_size**: 每页数量（1-100）
    - **desc**: 是否降序排列
    """
    result = fund_ranking_manager.get_ranking(
        ranking_type=type,
        page=page,
        page_size=page_size,
        descending=desc,
    )

    if "error" in result and result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return result


@router.get("/{fund_code}")
async def get_fund_ranking(fund_code: str):
    """
    获取单个基金在各排行榜中的排名

    - **fund_code**: 基金代码
    """
    result = fund_ranking_manager.get_fund_ranking_info(fund_code)

    if result is None:
        raise HTTPException(status_code=404, detail="基金未在排行榜中找到")

    return result


@router.get("/status/cache")
async def get_cache_status():
    """获取排行榜缓存状态"""
    return fund_ranking_manager.get_cache_status()


@router.post("/sync")
async def sync_ranking():
    """
    手动同步排行榜数据（从天天基金 API 获取最新数据）

    注意：此接口应该由定时任务调用，或在交易日后手动触发
    """
    success = await fund_ranking_manager.sync_ranking_data()

    if success:
        return {"message": "排行榜数据同步成功"}
    else:
        raise HTTPException(status_code=500, detail="排行榜数据同步失败")