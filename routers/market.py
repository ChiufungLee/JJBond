"""
股市指数行情 API
主数据源: 腾讯财经 qt.gtimg.cn
备用数据源: 东方财富 push2（需 cookie）
Redis 缓存 60 秒
"""
import json
import logging
import re
import time

from fastapi import APIRouter

from core.config import settings
from core.database import get_redis
from core.http_client import get_http_session
from utils.http_headers import UA_DESKTOP

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["股市行情"])

CACHE_KEY = "market:indices"
CACHE_TTL = 300

# 展示分组定义：(腾讯代码, 东方财富 fs 代码, 输出代码)
INDEX_GROUPS = [
    {
        "name": "A股指数",
        "indices": [
            ("sh000001", "1.000001", "000001"),
            ("sz399001", "0.399001", "399001"),
            ("sz399006", "0.399006", "399006"),
        ],
    },
    {
        "name": "港股指数",
        "indices": [
            ("hkHSI", "100.HSI", "HSI"),
            ("hkHSCEI", "100.HSCEI", "HSCEI"),
            ("hkHSCCI", "124.HSCCI", "HSCCI"),
        ],
    },
    {
        "name": "全球指数",
        "indices": [
            ("us.DJI", "100.DJIA", "DJIA"),
            ("usINX", "100.SPX", "SPX"),
            ("usNDX", "100.NDX", "NDX"),
        ],
    },
]

ALL_QT_CODES = [qt for g in INDEX_GROUPS for qt, _, _ in g["indices"]]
ALL_EM_SECIDS = [secid for g in INDEX_GROUPS for _, secid, _ in g["indices"]]


# ====== 腾讯财经数据源 ======

def _parse_qt_line(line: str) -> dict | None:
    line = line.strip().rstrip(";")
    if not line:
        return None
    key, _, val = line.partition("=")
    val = val.strip('"')
    if not val:
        return None
    parts = val.split("~")
    if len(parts) < 33:
        return None
    qt_code = key.removeprefix("v_")
    return {
        "qt_code": qt_code,
        "name": parts[1],
        "price": float(parts[3]),
        "change": float(parts[31]),
        "change_pct": float(parts[32]),
    }


async def _fetch_from_tencent(session) -> dict:
    url = "https://qt.gtimg.cn/q=" + ",".join(ALL_QT_CODES)
    async with session.get(url, headers={"User-Agent": UA_DESKTOP}) as resp:
        text = await resp.text()

    qt_map = {}
    for line in text.split(";"):
        parsed = _parse_qt_line(line)
        if parsed:
            qt_map[parsed["qt_code"]] = parsed

    groups = []
    for group_def in INDEX_GROUPS:
        items = []
        for qt_code, _, out_code in group_def["indices"]:
            matched = qt_map.get(qt_code)
            if matched:
                items.append({
                    "code": out_code,
                    "name": matched["name"],
                    "price": matched["price"],
                    "change": matched["change"],
                    "change_pct": matched["change_pct"],
                })
        groups.append({"name": group_def["name"], "items": items})

    return {"groups": groups}


# ====== 东方财富备用数据源 ======

EM_URL = "https://push2.eastmoney.com/api/qt/clist/get"
EM_PARAMS = {
    "np": "1", "fltt": "1", "invt": "2",
    "fields": "f12,f13,f14,f292,f1,f2,f4,f3,f152",
    "fid": "", "pn": "1", "pz": "100", "po": "1",
    "ut": "fa5fd1943c7b386f172d6893dbfba10b",
    "dect": "1", "wbp2u": "|0|0|0|web",
}
EM_HEADERS = {
    "User-Agent": UA_DESKTOP,
    "Referer": "https://quote.eastmoney.com/center/qqzs.html",
}


def _parse_em_index(raw: dict) -> dict:
    divisor = 10 ** raw.get("f152", 2)
    return {
        "code": raw.get("f12", ""),
        "name": raw.get("f14", ""),
        "price": raw.get("f2", 0) / divisor,
        "change": raw.get("f4", 0) / divisor,
        "change_pct": raw.get("f3", 0) / 100,
    }


async def _fetch_from_eastmoney(session) -> dict | None:
    cookie = settings.EASTMONEY_COOKIE
    if not cookie:
        return None

    headers = {**EM_HEADERS, "Cookie": cookie}
    fs = ",".join(f"i:{s}" for s in ALL_EM_SECIDS)
    params = {**EM_PARAMS, "fs": fs, "cb": "jQuerycb", "_": str(int(time.time() * 1000))}

    try:
        async with session.get(EM_URL, params=params, headers=headers) as resp:
            text = await resp.text()
    except Exception as e:
        logger.warning(f"东方财富备用接口失败: {e}")
        return None

    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        return None

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None

    diffs = data.get("data", {}).get("diff", [])
    em_map = {}
    for d in diffs:
        parsed = _parse_em_index(d)
        em_map[parsed["code"]] = parsed

    groups = []
    for group_def in INDEX_GROUPS:
        items = []
        for _, _, out_code in group_def["indices"]:
            matched = em_map.get(out_code)
            if matched:
                items.append(matched)
        groups.append({"name": group_def["name"], "items": items})

    return {"groups": groups}


# ====== 主接口 ======

@router.get("/indices")
async def get_market_indices():
    """获取股市指数行情（A股、港股、全球指数）
    主数据源: 腾讯财经 | 备用: 东方财富（需配置 cookie）
    """
    redis = get_redis()
    if redis is not None:
        try:
            cached = await redis.get(CACHE_KEY)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    session = get_http_session()

    # 主：腾讯财经
    try:
        result = await _fetch_from_tencent(session)
        total = sum(len(g["items"]) for g in result["groups"])
        if total > 0:
            logger.info(f"腾讯财经获取成功，{total} 个指数")
            _save_cache(redis, result)
            return result
    except Exception as e:
        logger.warning(f"腾讯财经失败: {e}")

    # 备：东方财富
    try:
        result = await _fetch_from_eastmoney(session)
        if result:
            total = sum(len(g["items"]) for g in result["groups"])
            if total > 0:
                logger.info(f"东方财富备用获取成功，{total} 个指数")
                _save_cache(redis, result)
                return result
    except Exception as e:
        logger.warning(f"东方财富备用失败: {e}")

    return {"groups": []}


def _save_cache(redis, result):
    if redis is None:
        return
    try:
        redis.setex(CACHE_KEY, CACHE_TTL, json.dumps(result, ensure_ascii=False))
    except Exception:
        pass
