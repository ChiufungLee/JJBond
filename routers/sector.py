"""
基金板块详情 API
代理天天基金行业/概念板块接口，Redis 缓存 5 分钟
"""
import re
import json
import logging
import time
import asyncio

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from core.database import get_redis
from core.database import get_db
from models.fund import FundSector
from schemas.user import FundSectorResponse, FundSectorItem
from utils.fund_sector_sync import sync_fund_sectors, REDIS_CACHE_PREFIX
from core.http_client import get_http_session
from utils.http_headers import eastmoney_fund_headers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sector", tags=["板块详情"])

EASTMONEY_SECTOR_URL = "https://api.fund.eastmoney.com/ztjj/GetZTJJListNew"
EASTMONEY_SECTOR_DETAIL_URL = "https://api.fund.eastmoney.com/ZTJJ/GetBKDetailInfoNew"
EASTMONEY_SECTOR_FUNDS_URL = "https://api.fund.eastmoney.com/ZTJJ/GetBKRelTopicFundNew"
CACHE_PREFIX = "sector:"
CACHE_TTL = 300  # 5 分钟
SECTOR_FUNDS_CACHE_TTL = 300

SECTOR_TYPE_MAP = {"industry": "001002", "concept": "001003", "all": "0"}
SORT_FIELD_MAP = {"change": "syl", "flow": "zjlr"}

CHANGE_TIME_RANGES = ["D", "W", "M"]
FLOW_TIME_RANGES = ["FLOW", "FLOW_W", "FLOW_M"]


@router.get("/")
async def get_sector_list(
    type: str = Query("industry", description="板块类型: industry=行业板块, concept=概念板块, all=全部"),
    sort: str = Query("change", description="排序字段: change=涨跌幅, flow=资金流入"),
    st: str = Query("D", description="时间范围: 涨跌幅时 D/W/M, 资金流入时 FLOW/FLOW_W/FLOW_M"),
):
    """获取板块列表
    数据源: 东方财富 GetZTJJListNew 接口
    参数说明:
      - type: 板块分类（all=全部, industry=行业板块, concept=概念板块）
      - sort: 排序类别（change=按涨幅排序, flow=按资金流入排序）
      - st: 时间范围（按涨幅时 D=日/W=周/M=月；按资金流入时 FLOW=实时/FLOW_W=周/FLOW_M=月）
    """
    if not settings.SECTOR_FEATURE_ENABLED:
        return {"type": type, "sort": sort, "time_range": st, "total": 0, "data": []}

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

    # 当按资金流入排序时，需要额外请求涨跌幅数据
    # 因为东方财富 API 在资金流入模式下不返回 CHANGE_RATE 字段
    change_rate_map = {}
    if sort == "flow":
        change_st = "D" if st == "FLOW" else ("W" if st == "FLOW_W" else "M")
        change_params = {
            "callback": "jQuerycb",
            "tt": SECTOR_TYPE_MAP[type],
            "dt": "syl",
            "st": change_st,
            "_": str(int(time.time() * 1000)),
        }
        try:
            async with session.get(EASTMONEY_SECTOR_URL, params=change_params, headers=eastmoney_fund_headers()) as resp:
                change_text = await resp.text()
            change_match = re.match(r"jQuerycb\((.*)\);?$", change_text, re.DOTALL)
            if change_match:
                change_data = json.loads(change_match.group(1))
                for item in (change_data.get("Data") or []):
                    code = item.get("INDEXCODE", "")
                    value = item.get(change_st)
                    if code and value is not None:
                        change_rate_map[code] = float(value)
        except Exception as e:
            logger.warning(f"请求涨跌幅数据失败（降级处理）: {e}")

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
        code = item.get("INDEXCODE", "")
        # 优先使用 API 返回的 CHANGE_RATE，否则从涨跌幅映射中获取
        change_rate = item.get("CHANGE_RATE")
        if change_rate is not None:
            change_rate = float(change_rate)
        elif code in change_rate_map:
            change_rate = change_rate_map[code]
        result.append({
            "code": code,
            "name": item.get("INDEXNAME", ""),
            "value": value,
            "change_rate": change_rate,
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


@router.get("/{code}/detail")
async def get_sector_detail(code: str):
    """获取单个板块的涨跌详情（日/周/月/季/年/今年来涨幅）"""
    if not settings.SECTOR_FEATURE_ENABLED:
        return {"code": code, "name": "", "change_d": None, "change_w": None,
                "change_m": None, "change_q": None, "change_y": None, "change_ytd": None}

    cache_key = f"{CACHE_PREFIX}detail:v2:{code}"
    redis = get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    session = get_http_session()
    params = {
        "callback": "jQuerycb",
        "tp": code,
        "_": str(int(time.time() * 1000)),
    }
    try:
        async with session.get(
            EASTMONEY_SECTOR_DETAIL_URL, params=params, headers=eastmoney_fund_headers()
        ) as resp:
            text = await resp.text()
    except Exception as e:
        logger.error(f"请求板块详情失败: {e}")
        raise HTTPException(status_code=502, detail="获取板块详情失败")

    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        raise HTTPException(status_code=502, detail="板块详情数据格式异常")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="板块详情数据解析失败")

    d = data.get("Data") or {}
    response = {
        "code": d.get("INDEXCODE", code),
        "name": d.get("INDEXNAME", d.get("SEC_NAME", "")),
        "change_d": d.get("D"),
        "change_w": d.get("W"),
        "change_m": d.get("M"),
        "change_q": d.get("Q"),
        "change_y": d.get("Y"),
        "change_ytd": d.get("SY"),
    }

    if redis is not None:
        try:
            await redis.setex(cache_key, CACHE_TTL, json.dumps(response, ensure_ascii=False))
        except Exception:
            pass

    return response


@router.get("/{code}/funds")
async def get_sector_funds(
    code: str,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=50, description="每页数量"),
    sort: str = Query("RZDF", description="排序字段"),
    sorttype: str = Query("DESC", description="排序方向: ASC/DESC"),
):
    """获取板块对应的基金列表"""
    if not settings.SECTOR_FEATURE_ENABLED:
        return {"sector_code": code, "total": 0, "page": page, "page_size": page_size, "data": []}

    cache_key = f"{CACHE_PREFIX}funds:{code}:{page}:{page_size}:{sort}:{sorttype}"
    redis = get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    session = get_http_session()
    params = {
        "callback": "jQuerycb",
        "tp": code,
        "pageindex": str(page),
        "pagesize": str(page_size),
        "sort": sort,
        "sorttype": sorttype,
        "isbuy": "1",
        "_": str(int(time.time() * 1000)),
    }
    try:
        async with session.get(
            EASTMONEY_SECTOR_FUNDS_URL, params=params, headers=eastmoney_fund_headers()
        ) as resp:
            text = await resp.text()
    except Exception as e:
        logger.error(f"请求板块基金数据失败: {e}")
        raise HTTPException(status_code=502, detail="获取板块基金数据失败")

    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        raise HTTPException(status_code=502, detail="板块基金数据格式异常")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="板块基金数据解析失败")

    items = data.get("Data") or []
    funds = []
    for item in items:
        funds.append({
            "fundCode": item.get("FCODE", ""),
            "fundName": item.get("SHORTNAME", ""),
            "fundType": item.get("FTYPE", ""),
            "nav": item.get("DWJZ"),
            "navDate": item.get("SYRQ", ""),
            "change": item.get("RZDF"),
            "changeWeek": item.get("SYL_Z"),
            "changeMonth": item.get("SYL_Y"),
            "change3Month": item.get("SYL_3Y"),
            "change6Month": item.get("SYL_6Y"),
            "change1Year": item.get("SYL_1N"),
            "change2Year": item.get("SYL_2N"),
            "change3Year": item.get("SYL_3N"),
            "changeYtd": item.get("SYL_JN"),
            "changeTotal": item.get("SYL_LN"),
            "sourceRate": item.get("SOURCERATE", ""),
            "rate": item.get("RATE", ""),
            "relation": item.get("RELATION"),
            "isBuy": item.get("ISBUY", "0"),
            "minPurchase": item.get("MINSG"),
        })

    response = {
        "sector_code": code,
        "total": data.get("TotalCount", 0),
        "page": page,
        "page_size": page_size,
        "data": funds,
    }

    if redis is not None:
        try:
            await redis.setex(cache_key, SECTOR_FUNDS_CACHE_TTL, json.dumps(response, ensure_ascii=False))
        except Exception:
            pass

    return response


@router.get("/fund/{fund_code}", response_model=FundSectorResponse)
async def get_fund_sectors(fund_code: str, db: Session = Depends(get_db)):
    """查询基金所属板块"""
    cache_key = f"{REDIS_CACHE_PREFIX}{fund_code}"
    redis = get_redis()

    # 尝试 Redis 缓存
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # 查询数据库
    rows = (
        db.query(FundSector)
        .filter(FundSector.fund_code == fund_code)
        .order_by(FundSector.relation.desc())
        .all()
    )

    response = FundSectorResponse(
        fund_code=fund_code,
        sectors=[
            FundSectorItem(
                sector_code=r.sector_code,
                sector_name=r.sector_name,
                relation=r.relation,
            )
            for r in rows
        ],
    )

    # 写入 Redis 缓存
    if redis is not None:
        try:
            await redis.setex(
                cache_key,
                300,
                response.model_dump_json(),
            )
        except Exception:
            pass

    return response


@router.post("/sync")
async def trigger_sector_sync():
    """手动触发基金-板块关联同步"""
    from core.database import SessionLocal
    asyncio.create_task(_run_sector_sync())
    return {"message": "板块同步任务已启动", "status": "started"}


async def _run_sector_sync():
    """后台执行板块同步"""
    from core.database import SessionLocal
    db = SessionLocal()
    try:
        result = await sync_fund_sectors(db)
        logger.info(f"手动板块同步完成: {result}")
    except Exception as e:
        logger.error(f"手动板块同步失败: {e}")
    finally:
        db.close()
