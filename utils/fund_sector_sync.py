"""
基金-板块关联同步
遍历东方财富所有板块，拉取关联基金列表，写入 fund_sectors 表。
"""
import asyncio
import json
import logging
import re
import time

from sqlalchemy.orm import Session
from sqlalchemy import delete

from core.http_client import get_http_session
from core.database import get_redis
from models.fund import FundSector
from utils.http_headers import eastmoney_fund_headers

logger = logging.getLogger(__name__)

EASTMONEY_SECTOR_URL = "https://api.fund.eastmoney.com/ztjj/GetZTJJListNew"
EASTMONEY_SECTOR_FUNDS_URL = "https://api.fund.eastmoney.com/ZTJJ/GetBKRelTopicFundNew"

RELATION_THRESHOLD = 50  # 关联度低于此值不存储
CONCURRENCY = 10  # 并发数
PAGE_SIZE = 50
REQUEST_TIMEOUT = 15  # 单次请求超时（秒）
REDIS_CACHE_PREFIX = "sector:reverse:"


async def _parse_jsonp(text: str) -> dict | None:
    """解析 jQuerycb(...) 格式的 JSONP 响应"""
    match = re.match(r"jQuerycb\((.*)\);?$", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


async def _fetch_all_sectors() -> list[dict]:
    """获取全部板块列表（行业 + 概念），返回 [{"code": "BK...", "name": "..."}]"""
    session = get_http_session()
    params = {
        "callback": "jQuerycb",
        "tt": "0",  # 0 = 全部
        "dt": "syl",
        "st": "D",
        "_": str(int(time.time() * 1000)),
    }
    try:
        async with session.get(
            EASTMONEY_SECTOR_URL, params=params, headers=eastmoney_fund_headers()
        ) as resp:
            text = await resp.text()
    except Exception as e:
        logger.error(f"获取板块列表失败: {e}")
        return []

    data = await _parse_jsonp(text)
    if not data:
        logger.error("板块列表 JSONP 解析失败")
        return []

    sectors = []
    for item in data.get("Data") or []:
        code = item.get("INDEXCODE", "")
        name = item.get("INDEXNAME", "")
        if code and name:
            sectors.append({"code": code, "name": name})

    logger.info(f"获取到 {len(sectors)} 个板块")
    return sectors


async def _fetch_sector_funds(sector_code: str, sem: asyncio.Semaphore) -> list[dict]:
    """拉取单个板块的全部基金列表，返回 [{"fund_code": "...", "relation": 98.5}]"""
    async with sem:
        session = get_http_session()
        all_funds = []
        page = 1

        while True:
            params = {
                "callback": "jQuerycb",
                "tp": sector_code,
                "pageindex": str(page),
                "pagesize": str(PAGE_SIZE),
                "sort": "RZDF",
                "sorttype": "DESC",
                "isbuy": "0",
                "_": str(int(time.time() * 1000)),
            }
            try:
                async with session.get(
                    EASTMONEY_SECTOR_FUNDS_URL,
                    params=params,
                    headers=eastmoney_fund_headers(),
                ) as resp:
                    text = await resp.text()
            except Exception as e:
                logger.warning(f"板块 {sector_code} 第 {page} 页请求失败: {e}")
                break

            data = await _parse_jsonp(text)
            if not data:
                break

            items = data.get("Data") or []
            total = data.get("TotalCount", 0)

            for item in items:
                relation = item.get("RELATION")
                if relation is None or relation == "":
                    continue
                try:
                    relation = float(relation)
                except (ValueError, TypeError):
                    continue
                if relation < RELATION_THRESHOLD:
                    continue
                all_funds.append({
                    "fund_code": item.get("FCODE", ""),
                    "relation": round(relation, 2),
                })

            # 如果已经拿完或本页不足一页，停止翻页
            if page * PAGE_SIZE >= total or len(items) < PAGE_SIZE:
                break
            page += 1

        return all_funds


async def sync_fund_sectors(db: Session) -> dict:
    """同步基金-板块关联数据到数据库

    Returns:
        {"sectors": int, "mappings": int, "elapsed": float}
    """
    start_time = time.time()

    # 1. 获取全部板块
    sectors = await _fetch_all_sectors()
    if not sectors:
        return {"sectors": 0, "mappings": 0, "elapsed": 0, "error": "获取板块列表失败"}

    # 2. 并发拉取每个板块的基金列表
    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [
        _fetch_sector_funds(s["code"], sem)
        for s in sectors
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 3. 汇总映射关系，用 dict 去重（同一基金在同一板块只保留最高关联度）
    dedup = {}  # (fund_code, sector_code) -> (sector_name, relation)
    for sector, result in zip(sectors, results):
        if isinstance(result, Exception):
            logger.warning(f"板块 {sector['code']} 拉取异常: {result}")
            continue
        for fund in result:
            fc = fund["fund_code"]
            if not fc:
                continue
            key = (fc, sector["code"])
            rel = fund["relation"]
            if key not in dedup or rel > dedup[key][1]:
                dedup[key] = (sector["name"], rel)

    mappings = [(fc, sc, sn, rel) for (fc, sc), (sn, rel) in dedup.items()]
    logger.info(f"共收集到 {len(mappings)} 条基金-板块映射")

    # 4. 写入数据库：先清空旧数据，再批量插入
    try:
        db.execute(delete(FundSector))
        db.flush()

        # 批量插入，每 500 条一批
        batch_size = 500
        for i in range(0, len(mappings), batch_size):
            batch = mappings[i : i + batch_size]
            db.bulk_save_objects([
                FundSector(
                    fund_code=fc,
                    sector_code=sc,
                    sector_name=sn,
                    relation=rel,
                )
                for fc, sc, sn, rel in batch
            ])
            db.flush()

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"写入 fund_sectors 失败: {e}")
        return {"sectors": len(sectors), "mappings": 0, "elapsed": 0, "error": str(e)}

    # 5. 清理 Redis 中的反向查询缓存
    redis = get_redis()
    if redis is not None:
        try:
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=f"{REDIS_CACHE_PREFIX}*", count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning(f"清理 Redis 板块缓存失败: {e}")

    elapsed = round(time.time() - start_time, 2)
    logger.info(f"板块同步完成: {len(sectors)} 个板块, {len(mappings)} 条映射, 耗时 {elapsed}s")
    return {"sectors": len(sectors), "mappings": len(mappings), "elapsed": elapsed}
