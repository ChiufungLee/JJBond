# utils/fund_data_manager.py
import json
import logging
import os
from typing import List, Dict, Optional

from sqlalchemy.orm import Session

from models.fund import FundLib

logger = logging.getLogger(__name__)

# Redis key 常量
_CACHE_KEY = "fund_lib:all"           # 全量基金列表（JSON 字符串）
_CACHE_TTL = 86400                     # 缓存 24 小时（基金库基本不变）

# 初始基金数据，用于首次建库时写入
INITIAL_FUNDS = [
    {"fund_code": "000001", "fund_name": "华夏成长混合", "fund_type": "混合型"},
    {"fund_code": "000002", "fund_name": "华夏大盘精选", "fund_type": "股票型"},
    {"fund_code": "000003", "fund_name": "华夏现金增利货币A", "fund_type": "货币型"},
    {"fund_code": "000004", "fund_name": "华夏稳健增长", "fund_type": "混合型"},
    {"fund_code": "000005", "fund_name": "华夏沪深300ETF联接A", "fund_type": "指数型"},
    {"fund_code": "110011", "fund_name": "易方达中小盘混合", "fund_type": "混合型"},
    {"fund_code": "110022", "fund_name": "易方达消费行业股票", "fund_type": "股票型"},
    {"fund_code": "161725", "fund_name": "招商中证白酒指数(LOF)A", "fund_type": "指数型"},
    {"fund_code": "163402", "fund_name": "兴全趋势投资混合(LOF)", "fund_type": "混合型"},
    {"fund_code": "519674", "fund_name": "银河创新成长混合", "fund_type": "混合型"},
    {"fund_code": "320007", "fund_name": "诺安成长混合", "fund_type": "混合型"},
    {"fund_code": "001714", "fund_name": "工银文体产业股票A", "fund_type": "股票型"},
    {"fund_code": "005827", "fund_name": "易方达蓝筹精选混合", "fund_type": "混合型"},
    {"fund_code": "006327", "fund_name": "易方达中证海外中国互联网50(QDII-ETF)", "fund_type": "QDII"},
    {"fund_code": "003095", "fund_name": "中欧医疗健康混合A", "fund_type": "混合型"},
    {"fund_code": "002190", "fund_name": "农银新能源主题", "fund_type": "主题型"},
    {"fund_code": "001875", "fund_name": "前海开源沪港深优势精选混合", "fund_type": "混合型"},
    {"fund_code": "260108", "fund_name": "景顺长城新兴成长混合", "fund_type": "混合型"},
    {"fund_code": "519736", "fund_name": "交银新成长混合", "fund_type": "混合型"},
    {"fund_code": "002001", "fund_name": "华夏回报混合A", "fund_type": "混合型"},
]


# ---------- 初始化 ----------

def init_fund_lib(db: Session) -> None:
    """
    启动时初始化基金库：
    - 优先从 data/funds.json 加载完整数据（约 25000+ 条）
    - funds.json 不存在时降级使用 INITIAL_FUNDS（20 条兜底数据）
    - 数据库已有 100 条以上则认为已初始化，跳过
    """
    if db.query(FundLib).count() > 100:
        logger.info("基金库已初始化，跳过")
        _warm_up_search_cache(db)  # 数据库已有数据，预热搜索缓存
        return

    funds_to_insert = _load_funds_json()
    if not funds_to_insert:
        logger.warning("funds.json 未找到或为空，使用内置兜底数据")
        funds_to_insert = INITIAL_FUNDS

    db.query(FundLib).delete()
    db.bulk_insert_mappings(FundLib, funds_to_insert)
    db.commit()
    logger.info(f"初始化基金库完成，写入 {len(funds_to_insert)} 条记录")

    _warm_up_search_cache(db)


def _warm_up_search_cache(db: Session) -> None:
    """
    将全量基金库写入 Redis，后续搜索直接走缓存，不再扫描数据库。
    Redis 不可用时静默跳过，搜索自动降级到数据库 LIKE 查询。
    """
    try:
        from core.database import redis_client
        if redis_client is None:
            return

        rows = db.query(FundLib).all()
        fund_list = [_to_dict(r) for r in rows]
        redis_client.setex(_CACHE_KEY, _CACHE_TTL, json.dumps(fund_list, ensure_ascii=False))
        logger.info(f"基金搜索缓存预热完成，共 {len(fund_list)} 条写入 Redis")
    except Exception as e:
        logger.warning(f"搜索缓存预热失败，将使用数据库查询: {e}")


# ---------- 搜索 ----------

def search_funds(db: Session, keyword: str, limit: int = 20) -> List[Dict]:
    """
    搜索基金。

    优先从 Redis 缓存中搜索（纯内存操作，无 SQL 全表扫描）；
    Redis 不可用时降级为数据库 LIKE 查询，行为与原实现一致。
    """
    # 优先走缓存
    result = _search_from_cache(keyword, limit)
    if result is not None:
        return result

    # 降级：数据库查询
    logger.debug("搜索缓存未命中，降级到数据库查询")
    return _search_from_db(db, keyword, limit)


def _search_from_cache(keyword: str, limit: int) -> Optional[List[Dict]]:
    """
    从 Redis 缓存搜索基金。
    返回 None 表示缓存不可用（调用方应降级到数据库）。
    返回列表（可能为空）表示缓存命中。
    """
    try:
        from core.database import redis_client
        if redis_client is None:
            return None

        raw = redis_client.get(_CACHE_KEY)
        if not raw:
            return None

        fund_list: List[Dict] = json.loads(raw)

        if not keyword:
            return fund_list[:limit]

        kw = keyword.strip().lower()
        results: List[Dict] = []

        # 第一优先级：基金代码精确匹配
        exact = [f for f in fund_list if f["fund_code"] == keyword]
        results.extend(exact)

        # 第二优先级：基金代码前缀匹配（用户输入 "000" 时）
        if len(results) < limit:
            seen = {f["fund_code"] for f in results}
            prefix = [
                f for f in fund_list
                if f["fund_code"].startswith(keyword) and f["fund_code"] not in seen
            ]
            results.extend(prefix[:limit - len(results)])

        # 第三优先级：基金名称包含关键词
        if len(results) < limit:
            seen = {f["fund_code"] for f in results}
            name_match = [
                f for f in fund_list
                if kw in f["fund_name"].lower() and f["fund_code"] not in seen
            ]
            results.extend(name_match[:limit - len(results)])

        # 第四优先级：基金类型包含关键词
        if len(results) < limit:
            seen = {f["fund_code"] for f in results}
            type_match = [
                f for f in fund_list
                if kw in f.get("fund_type", "").lower() and f["fund_code"] not in seen
            ]
            results.extend(type_match[:limit - len(results)])

        return results[:limit]

    except Exception as e:
        logger.warning(f"缓存搜索失败，降级到数据库: {e}")
        return None


def _search_from_db(db: Session, keyword: str, limit: int) -> List[Dict]:
    """数据库 LIKE 查询（降级路径，行为与原实现一致）"""
    if not keyword:
        rows = db.query(FundLib).limit(limit).all()
        return _to_dict_list(rows)

    exact = db.query(FundLib).filter(FundLib.fund_code == keyword).first()
    results = [exact] if exact else []

    remaining = limit - len(results)
    if remaining > 0:
        fuzzy = (
            db.query(FundLib)
            .filter(
                FundLib.fund_name.contains(keyword) |
                FundLib.fund_type.contains(keyword),
                FundLib.fund_code != keyword
            )
            .limit(remaining)
            .all()
        )
        results.extend(fuzzy)

    return _to_dict_list(results)


# ---------- 写操作 ----------

def get_fund_by_code(db: Session, fund_code: str) -> Optional[Dict]:
    """根据基金代码精确查询"""
    row = db.query(FundLib).filter(FundLib.fund_code == fund_code).first()
    return _to_dict(row) if row else None


def upsert_fund(db: Session, fund_code: str, fund_name: str, fund_type: str = "其他") -> None:
    """新增或更新基金库记录，同时使缓存失效（下次搜索时重建）"""
    row = db.query(FundLib).filter(FundLib.fund_code == fund_code).first()
    if row:
        row.fund_name = fund_name
        row.fund_type = fund_type
    else:
        db.add(FundLib(fund_code=fund_code, fund_name=fund_name, fund_type=fund_type))
    db.commit()

    # 使缓存失效，下次搜索时触发重建
    _invalidate_search_cache()


def _invalidate_search_cache() -> None:
    """删除 Redis 中的全量缓存，下次搜索时重新预热"""
    try:
        from core.database import redis_client
        if redis_client:
            redis_client.delete(_CACHE_KEY)
    except Exception as e:
        logger.warning(f"缓存失效操作失败: {e}")


# ---------- 内部工具 ----------

def _load_funds_json() -> List[Dict]:
    """从 data/funds.json 加载基金数据，过滤掉 FundLib 不认识的字段"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, 'data', 'funds.json')
    if not os.path.exists(json_path):
        return []
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        allowed = {'fund_code', 'fund_name', 'fund_type'}
        return [{k: v for k, v in item.items() if k in allowed} for item in raw]
    except Exception as e:
        logger.error(f"读取 funds.json 失败: {e}")
        return []


def _to_dict(row: FundLib) -> Dict:
    return {"fund_code": row.fund_code, "fund_name": row.fund_name, "fund_type": row.fund_type}


def _to_dict_list(rows: List[FundLib]) -> List[Dict]:
    return [_to_dict(r) for r in rows]