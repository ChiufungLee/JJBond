"""
基金板块详情 API
代理天天基金行业/概念板块接口，Redis 缓存 5 分钟
"""
import re
import json
import logging
import time

from fastapi import APIRouter, Query, HTTPException

from core.database import get_redis
from core.http_client import get_http_session
from utils.http_headers import eastmoney_fund_headers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sector", tags=["板块详情"])

EASTMONEY_SECTOR_URL = "https://api.fund.eastmoney.com/ztjj/GetZTJJListNew"
CACHE_PREFIX = "sector:"
CACHE_TTL = 300  # 5 分钟

SECTOR_TYPE_MAP = {"industry": "001002", "concept": "001003"}
SORT_FIELD_MAP = {"change": "syl", "flow": "zjlr"}

CHANGE_TIME_RANGES = ["D", "W", "M"]
FLOW_TIME_RANGES = ["FLOW", "FLOW_W", "FLOW_M"]


@router.get("/")
async def get_sector_list(
    type: str = Query("industry", description="板块类型: industry=行业板块, concept=概念板块"),
    sort: str = Query("change", description="排序字段: change=涨跌幅, flow=资金流入"),
    st: str = Query("D", description="时间范围: 涨跌幅时 D/W/M, 资金流入时 FLOW/FLOW_W/FLOW_M"),
):
    if type not in SECTOR_TYPE_MAP:
        raise HTTPException(status_code=400, detail=f"无效的板块类型，可选值: {list(SECTOR_TYPE_MAP.keys())}")
    if sort not in SORT_FIELD_MAP:
        raise HTTPException(status_code=400, detail=f"无效的排序字段，可选值: {list(SORT_FIELD_MAP.keys())}")

    valid_ranges = CHANGE_TIME_RANGES if sort == "change" else FLOW_TIME_RANGES
    if st not in valid_ranges:
        raise HTTPException(status_code=400, detail=f"无效的时间范围，可选值: {valid_ranges}")

    # 尝试从 Redis 缓存读取
    cache_key = f"{CACHE_PREFIX}{type}:{sort}:{st}"
    redis = get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass  # Redis 异常降级

    # 缓存未命中，请求外部 API
    session = get_http_session()
    params = {
        "callback": "jQuerycb",
        "tt": SECTOR_TYPE_MAP[type],
        "dt": SORT_FIELD_MAP[sort],
        "st": st,
        "_": str(int(time.time() * 1000)),
    }
    try:
        async with session.get(EASTMONEY_SECTOR_URL, params=params, headers=eastmoney_fund_headers()) as resp:
            text = await resp.text()
    except Exception as e:
        logger.error(f"请求板块数据失败: {e}")
        raise HTTPException(status_code=502, detail="获取板块数据失败")

    # 解析 JSONP: jQuerycb({...})
    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        raise HTTPException(status_code=502, detail="板块数据格式异常")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="板块数据解析失败")

    items = data.get("Data") or []
    result = []
    for item in items:
        value = item.get(st)
        if value is not None:
            value = float(value)
        result.append({
            "code": item.get("INDEXCODE", ""),
            "name": item.get("INDEXNAME", ""),
            "value": value,
        })

    response = {
        "type": type,
        "sort": sort,
        "time_range": st,
        "total": len(result),
        "data": result,
    }

    # 写入 Redis 缓存
    if redis is not None:
        try:
            await redis.setex(cache_key, CACHE_TTL, json.dumps(response, ensure_ascii=False))
        except Exception:
            pass

    return response
