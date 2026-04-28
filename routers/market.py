"""
股市指数行情 API
代理东方财富指数接口，Redis 缓存 60 秒
"""
import re
import json
import logging
import time

from fastapi import APIRouter, HTTPException

from core.database import get_redis
from core.http_client import get_http_session
from utils.http_headers import UA_DESKTOP

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["股市行情"])

BASE_URL = "https://push2.eastmoney.com/api/qt/clist/get"
CACHE_KEY = "market:indices"
CACHE_TTL = 60  # 1 分钟

COMMON_PARAMS = {
    "np": "1",
    "fltt": "1",
    "invt": "2",
    "fields": "f12,f13,f14,f292,f1,f2,f4,f3,f152",
    "fid": "",
    "pn": "1",
    "pz": "100",
    "po": "1",
    "ut": "fa5fd1943c7b386f172d6893dbfba10b",
    "dect": "1",
    "wbp2u": "|0|0|0|web",
}

# 亚太指数（含 A 股、港股及其他亚太市场）
ASIA_FS = (
    "i:1.000001,i:0.399001,i:0.399005,i:0.399006,i:1.000300,"
    "i:100.HSI,i:100.HSCEI,i:124.HSCCI,"
    "i:100.TWII,i:100.N225,i:100.KOSPI200,i:100.KS11,"
    "i:100.STI,i:100.SENSEX,i:100.KLSE,i:100.SET,i:100.PSI,"
    "i:100.KSE100,i:100.VNINDEX,i:100.JKSE,i:100.CSEALL"
)

# 美洲指数
AMERICA_FS = "i:100.DJIA,i:100.SPX,i:100.NDX,i:100.TSX,i:100.BVSP,i:100.MXX"

# 展示分组定义
INDEX_GROUPS = [
    {
        "name": "A股指数",
        "codes": ["000001", "399001", "399006"],
    },
    {
        "name": "港股指数",
        "codes": ["HSI", "HSCEI", "HSCCI"],
    },
    {
        "name": "全球指数",
        "codes": ["DJIA", "SPX", "NDX"],
    },
]


def _parse_index(raw: dict) -> dict:
    f152 = raw.get("f152", 2)
    divisor = 10 ** f152
    return {
        "code": raw.get("f12", ""),
        "name": raw.get("f14", ""),
        "price": raw.get("f2", 0) / divisor,
        "change": raw.get("f4", 0) / divisor,
        "change_pct": raw.get("f3", 0) / 100,
    }


async def _fetch_indices(fs: str) -> list:
    session = get_http_session()
    params = {**COMMON_PARAMS, "fs": fs, "cb": "jQuerycb", "_": str(int(time.time() * 1000))}
    try:
        async with session.get(
            BASE_URL, params=params,
            headers={"User-Agent": UA_DESKTOP, "Referer": "https://quote.eastmoney.com/"},
        ) as resp:
            text = await resp.text()
    except Exception as e:
        logger.error(f"请求指数数据失败: {e}")
        raise HTTPException(status_code=502, detail="获取指数数据失败")

    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        raise HTTPException(status_code=502, detail="指数数据格式异常")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="指数数据解析失败")

    diffs = data.get("data", {}).get("diff", [])
    return [_parse_index(d) for d in diffs]


@router.get("/indices")
async def get_market_indices():
    """获取股市指数行情（A股、港股、全球指数）
    数据源: 东方财富 push2 指数接口
    响应字段: price(最新价), change(涨跌额), change_pct(涨跌幅)
    """
    # 尝试 Redis 缓存
    redis = get_redis()
    if redis is not None:
        try:
            cached = await redis.get(CACHE_KEY)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # 并发请求两个接口
    import asyncio
    asia_task = asyncio.create_task(_fetch_indices(ASIA_FS))
    america_task = asyncio.create_task(_fetch_indices(AMERICA_FS))
    asia_indices, america_indices = await asyncio.gather(asia_task, america_task)

    # 合并所有指数，按 code 建索引
    all_by_code = {}
    for idx in asia_indices + america_indices:
        all_by_code[idx["code"]] = idx

    # 按分组输出
    groups = []
    for group_def in INDEX_GROUPS:
        items = []
        for code in group_def["codes"]:
            if code in all_by_code:
                items.append(all_by_code[code])
        groups.append({"name": group_def["name"], "items": items})

    result = {"groups": groups}

    # 写入缓存
    if redis is not None:
        try:
            await redis.setex(CACHE_KEY, CACHE_TTL, json.dumps(result, ensure_ascii=False))
        except Exception:
            pass

    return result
