"""
基金涨跌幅排行榜工具
使用 Redis 缓存排行榜数据，支持日/周/月/年/今年以来五个维度
"""
import asyncio
import json
import logging
from typing import List, Dict, Optional, Literal
from datetime import datetime, time
from zoneinfo import ZoneInfo
import aiohttp
from core.database import get_redis
from core.http_client import get_http_session
from utils.http_headers import UA_DESKTOP, REFERER_EASTMONEY
from utils.helpers import safe_float

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")

logger = logging.getLogger(__name__)

# 排行榜类型
RankingType = Literal["day", "week", "month", "year", "ytd"]

# 排行榜类型与接口字段的映射
RANKING_FIELD_MAP = {
    "day": "daySyl",      # 日涨跌幅
    "week": "weekSyl",    # 周涨跌幅
    "month": "monthSyl",  # 月涨跌幅
    "year": "yearSyl",    # 近1年
    "ytd": "sySyl",       # 今年来
}

# 排行榜类型与 API orderField 参数的映射
ORDER_FIELD_MAP = {
    "day": "5_1_-1",      # 日涨幅
    "week": "5_2_-1",     # 周涨幅
    "month": "5_3_-1",    # 月涨幅
    "year": "5_6_-1",     # 近1年
    "ytd": "5_10_-1",     # 今年来
}

# Redis Key 前缀
RANKING_KEY_PREFIX = "ranking:"
FUND_DETAIL_KEY_PREFIX = "fund:ranking:"
META_KEY = "ranking:meta"


class FundRankingManager:
    """基金排行榜管理器"""

    def __init__(self):
        self._auto_syncing = False

    def _is_redis_available(self) -> bool:
        """检查 Redis 是否可用"""
        return get_redis() is not None

    def _maybe_auto_sync(self):
        """检测缓存是否过时，过时则在后台触发同步（非阻塞）"""
        if self._auto_syncing:
            return

        redis = get_redis()
        if redis is None:
            return

        async def _do_auto_sync():
            try:
                meta = await redis.hgetall(META_KEY)
                last_update = meta.get("lastUpdate", "")
                if not last_update:
                    logger.info("排行榜无缓存元数据，触发自动同步")
                    await self.sync_ranking_data()
                    return

                last_date = datetime.strptime(last_update, "%Y-%m-%d %H:%M:%S").date()
                now = datetime.now(SHANGHAI_TZ)
                today = now.date()

                # 工作日 + lastUpdate 早于今天 + 已过同步时间（21:05 后才有当日新数据）
                after_sync = now.time() >= time(21, 5)
                if last_date < today and today.weekday() < 5 and after_sync:
                    logger.info(f"排行榜数据过时（lastUpdate={last_update}），触发自动同步")
                    await self.sync_ranking_data()
            except Exception as e:
                logger.error(f"自动同步排行榜数据失败: {e}")
            finally:
                self._auto_syncing = False

        self._auto_syncing = True
        asyncio.create_task(_do_auto_sync())

    def _get_ranking_key(self, ranking_type: RankingType) -> str:
        """获取排行榜的 Redis Key"""
        return f"{RANKING_KEY_PREFIX}{ranking_type}"

    def _get_fund_detail_key(self, fund_code: str) -> str:
        """获取基金详情的 Redis Key"""
        return f"{FUND_DETAIL_KEY_PREFIX}{fund_code}"

    async def fetch_ranking_data_from_api(
        self, ranking_type: RankingType = "day",
        page_index: int = None, page_num: int = None,
    ) -> Optional[List[Dict]]:
        """
        从天天基金 API 获取排行榜数据
        API: POST https://condition.tiantianfunds.com/condition/conditionFund/fundSelect

        Args:
            ranking_type: 排行榜类型，决定 orderField 参数值
            page_index: 指定单页页码（降级模式，仅取一页）
            page_num: 指定单页数量（降级模式）
        """
        url = "https://condition.tiantianfunds.com/condition/conditionFund/fundSelect"
        headers = {
            "User-Agent": UA_DESKTOP,
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": REFERER_EASTMONEY,
            "Origin": "https://fund.eastmoney.com",
        }

        # 根据排行榜类型获取对应的 orderField
        order_field = ORDER_FIELD_MAP.get(ranking_type, "5_1_-1")

        all_funds = []
        single_page_mode = page_index is not None
        current_page = page_index if single_page_mode else 1
        current_size = page_num if single_page_mode else 500

        try:
            session = get_http_session()
            while True:
                    # 构建请求体
                    form_data = aiohttp.FormData()
                    form_data.add_field("orderField", order_field)
                    form_data.add_field("pageIndex", str(current_page))
                    form_data.add_field("pageNum", str(current_size))
                    form_data.add_field("pageType", "5")
                    form_data.add_field("deviceid", "Wap")
                    form_data.add_field("plat", "Wap")
                    form_data.add_field("product", "EFund")
                    form_data.add_field("version", "2.0.0")
                    form_data.add_field("abnormal", "3")
                    form_data.add_field("rankSy", "1")

                    async with session.post(
                        url,
                        data=form_data,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as resp:
                        resp.raise_for_status()
                        data = await resp.json()

                        # 解析返回数据
                        funds = data.get("Data", [])
                        if not funds:
                            break

                        all_funds.extend(funds)

                        # 单页模式只取一页
                        if single_page_mode:
                            break

                        # 检查是否还有更多数据
                        if len(funds) < current_size:
                            break

                        current_page += 1

            logger.info(f"从天天基金获取了 {len(all_funds)} 只基金数据 (类型: {ranking_type})")
            return self._parse_ranking_data(all_funds)

        except Exception as e:
            logger.error(f"获取排行榜数据失败 (类型: {ranking_type}): {e}")
            return None

    def _parse_ranking_data(self, raw_data: List) -> List[Dict]:
        """
        解析天天基金返回的排行榜数据
        数据格式为 JSON，每个基金包含 fundCode, fundName, daySyl 等字段
        """
        result = []
        for item in raw_data:
            if not isinstance(item, dict):
                continue

            result.append({
                "fundCode": item.get("fundCode"),
                "fundName": item.get("fundName", ""),
                "ftype": item.get("ftype", ""),
                "company": item.get("company", ""),
                # 涨跌幅字段
                "daySyl": self._safe_float(item.get("daySyl")),      # 日涨跌幅
                "weekSyl": self._safe_float(item.get("weekSyl")),    # 周涨跌幅
                "monthSyl": self._safe_float(item.get("monthSyl")),  # 月涨跌幅
                "yearSyl": self._safe_float(item.get("yearSyl")),    # 年涨跌幅
                "sySyl": self._safe_float(item.get("sySyl")),        # 今年以来
                "lnSyl": self._safe_float(item.get("lnSyl")),        # 成立以来
                # 其他信息
                "perNav": self._safe_float(item.get("perNav")),
                "accPerNav": self._safe_float(item.get("accPerNav")),
                "fundSize": self._safe_float(item.get("fundSize")),
                "riskLevel": item.get("riskLevel"),
                "establishDate": item.get("establishDate"),
            })
        return result

    # 兼容旧调用，委托给共享函数
    def _safe_float(self, value) -> Optional[float]:
        return safe_float(value)

    async def sync_ranking_data(self, data: List[Dict] = None) -> bool:
        """
        并发同步所有排行榜数据到 Redis。

        优化点：
        - asyncio.gather + Semaphore(3) 并发拉取 5 种排行榜，
          总耗时从 5×串行 降为 约 2×批次（3+2），节省约 60% 时间
        - Redis pipeline 批量写入，几万条 zadd/hset 合并为一次网络往返
        """
        if not self._is_redis_available():
            logger.warning("Redis 不可用，无法同步排行榜数据")
            return False

        # 最多同时并发 3 个类型，避免触发天天基金接口限流
        semaphore = asyncio.Semaphore(3)

        async def fetch_with_limit(ranking_type: RankingType):
            async with semaphore:
                logger.info(f"正在同步 {ranking_type} 排行榜...")
                result = await self.fetch_ranking_data_from_api(ranking_type)
                if result:
                    logger.info(f"{ranking_type} 排行榜获取完成，共 {len(result)} 条")
                else:
                    logger.warning(f"获取 {ranking_type} 排行榜数据失败")
                return ranking_type, result

        try:
            # 并发拉取所有类型
            fetch_results = await asyncio.gather(
                *[fetch_with_limit(t) for t in RANKING_FIELD_MAP.keys()]
            )

            # 整理数据：排行榜得分表 + 基金详情去重表
            ranking_scores: Dict[str, Dict[str, float]] = {}  # {ranking_type: {fund_code: score}}
            all_fund_details: Dict[str, Dict] = {}

            for ranking_type, funds_data in fetch_results:
                if not funds_data:
                    continue
                score_field = RANKING_FIELD_MAP[ranking_type]
                scores: Dict[str, float] = {}
                for fund in funds_data:
                    fund_code = fund.get("fundCode")
                    if not fund_code:
                        continue
                    score = fund.get(score_field)
                    if score is not None:
                        scores[fund_code] = score
                    if fund_code not in all_fund_details:
                        all_fund_details[fund_code] = fund
                ranking_scores[ranking_type] = scores

            if not all_fund_details:
                logger.warning("所有排行榜数据均获取失败，放弃写入")
                return False

            # Redis pipeline 批量写入，将几万次往返合并为一次
            redis = get_redis()
            pipe = redis.pipeline()

            # 清除旧排行榜 key
            for ranking_type in RANKING_FIELD_MAP.keys():
                pipe.delete(self._get_ranking_key(ranking_type))

            # 批量写入各排行榜得分（zadd）
            for ranking_type, scores in ranking_scores.items():
                if scores:
                    pipe.zadd(self._get_ranking_key(ranking_type), scores)

            # 批量写入基金详情（hset）
            for fund_code, fund in all_fund_details.items():
                pipe.hset(self._get_fund_detail_key(fund_code), mapping={
                    "fundCode": fund_code,
                    "fundName": fund.get("fundName", ""),
                    "ftype": fund.get("ftype", ""),
                    "company": fund.get("company", ""),
                    "daySyl": "" if fund.get("daySyl") is None else str(fund.get("daySyl")),
                    "weekSyl": "" if fund.get("weekSyl") is None else str(fund.get("weekSyl")),
                    "monthSyl": "" if fund.get("monthSyl") is None else str(fund.get("monthSyl")),
                    "yearSyl": "" if fund.get("yearSyl") is None else str(fund.get("yearSyl")),
                    "sySyl": "" if fund.get("sySyl") is None else str(fund.get("sySyl")),
                    "lnSyl": "" if fund.get("lnSyl") is None else str(fund.get("lnSyl")),
                    "perNav": "" if fund.get("perNav") is None else str(fund.get("perNav")),
                    "fundSize": "" if fund.get("fundSize") is None else str(fund.get("fundSize")),
                    "riskLevel": "" if fund.get("riskLevel") is None else str(fund.get("riskLevel")),
                })

            # 更新元数据
            pipe.hset(META_KEY, mapping={
                "lastUpdate": datetime.now(SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M:%S"),
                "totalCount": str(len(all_fund_details)),
            })

            # 设置 25 小时过期，覆盖一个完整自然日 + 余量
            expire_seconds = 25 * 3600
            for ranking_type in RANKING_FIELD_MAP.keys():
                pipe.expire(self._get_ranking_key(ranking_type), expire_seconds)
            pipe.expire(META_KEY, expire_seconds)

            # 基金详情也设置过期时间，避免旧数据残留
            for fund_code in all_fund_details:
                pipe.expire(self._get_fund_detail_key(fund_code), expire_seconds)

            await pipe.execute()  # 一次性提交所有命令

            logger.info(f"排行榜数据同步成功，共 {len(all_fund_details)} 只基金")
            return True

        except Exception as e:
            logger.error(f"同步排行榜数据失败: {e}")
            return False

    async def get_ranking(
        self,
        ranking_type: RankingType,
        page: int = 1,
        page_size: int = 20,
        descending: bool = True
    ) -> Dict:
        """
        获取排行榜

        Args:
            ranking_type: 排行榜类型 (day/week/month/year/ytd)
            page: 页码（从1开始）
            page_size: 每页数量
            descending: 是否降序（涨幅从高到低）

        Returns:
            排行榜数据
        """
        redis = get_redis()
        if redis is None:
            return None

        # 检测缓存是否过时，过时则后台触发同步（非阻塞）
        self._maybe_auto_sync()

        try:
            key = self._get_ranking_key(ranking_type)

            # 获取总数
            total = await redis.zcard(key)

            # 计算分页偏移
            start = (page - 1) * page_size
            end = start + page_size - 1

            # 获取排行榜（Sorted Set）
            if descending:
                fund_codes = await redis.zrevrange(key, start, end, withscores=True)
            else:
                fund_codes = await redis.zrange(key, start, end, withscores=True)

            # 获取基金详情（pipeline 批量查询，1 次 Redis 往返）
            result = []
            rank_start = start + 1
            if fund_codes:
                pipe = redis.pipeline()
                for fund_code, _ in fund_codes:
                    pipe.hgetall(self._get_fund_detail_key(fund_code))
                details = await pipe.execute()

                for i, ((fund_code, score), detail) in enumerate(zip(fund_codes, details)):
                    if detail:
                        result.append({
                            "rank": rank_start + i,
                            "fundCode": detail.get("fundCode", fund_code),
                            "fundName": detail.get("fundName", ""),
                            "ftype": detail.get("ftype", ""),
                            "company": detail.get("company", ""),
                            "change": round(float(score), 2) if score is not None else 0,
                            "perNav": self._safe_float(detail.get("perNav")),
                            "riskLevel": detail.get("riskLevel"),
                        })

            # 获取元数据
            meta = await redis.hgetall(META_KEY)

            return {
                "rankingType": ranking_type,
                "page": page,
                "pageSize": page_size,
                "total": total,
                "lastUpdate": meta.get("lastUpdate", ""),
                "data": result,
            }

        except Exception as e:
            logger.error(f"获取排行榜失败: {e}")
            return {"error": str(e), "data": []}

    async def get_fund_ranking_info(self, fund_code: str) -> Optional[Dict]:
        """
        获取单个基金在各排行榜中的排名和涨跌幅

        Args:
            fund_code: 基金代码

        Returns:
            基金排名信息和各阶段涨跌幅
        """
        redis = get_redis()
        if redis is None:
            return None

        try:
            detail = await redis.hgetall(self._get_fund_detail_key(fund_code))
            if not detail:
                return None

            # 涨跌幅字段映射
            return_field_map = [
                ("daySyl", "日涨跌"),
                ("weekSyl", "近一周"),
                ("monthSyl", "近一月"),
                ("yearSyl", "近1年"),
                ("sySyl", "今年来"),
                ("lnSyl", "成立来"),
            ]

            result = {
                "fundCode": fund_code,
                "fundName": detail.get("fundName", ""),
                "ftype": detail.get("ftype", ""),
                "company": detail.get("company", ""),
                "returns": [],
                "rankings": {},
            }

            # 构建涨跌幅列表
            for field, label in return_field_map:
                value = self._safe_float(detail.get(field))
                result["returns"].append({
                    "period": field,
                    "label": label,
                    "value": value,
                    "value_str": f"{value}%" if value is not None else "--",
                })

            # 获取各维度的排名（pipeline 批量查询，1 次 Redis 往返）
            pipe = redis.pipeline()
            keys = []
            for ranking_type in RANKING_FIELD_MAP:
                key = self._get_ranking_key(ranking_type)
                keys.append((ranking_type, key))
                pipe.zscore(key, fund_code)
                pipe.zrevrank(key, fund_code)
                pipe.zcard(key)
            pipeline_results = await pipe.execute()

            for idx, (ranking_type, key) in enumerate(keys):
                score = pipeline_results[idx * 3]
                rank = pipeline_results[idx * 3 + 1]
                total = pipeline_results[idx * 3 + 2]

                result["rankings"][ranking_type] = {
                    "change": round(float(score), 2) if score is not None else None,
                    "rank": rank + 1 if rank is not None else None,
                    "total": total,
                }

            return result

        except Exception as e:
            logger.error(f"获取基金排名信息失败: {fund_code}, {e}")
            return None

    async def get_cache_status(self) -> Dict:
        """获取缓存状态"""
        redis = get_redis()
        if redis is None:
            return {"available": False, "message": "Redis 不可用"}

        try:
            meta = await redis.hgetall(META_KEY)
            counts = {}
            for ranking_type in RANKING_FIELD_MAP.keys():
                counts[ranking_type] = await redis.zcard(self._get_ranking_key(ranking_type))

            return {
                "available": True,
                "lastUpdate": meta.get("lastUpdate", ""),
                "totalCount": meta.get("totalCount", 0),
                "rankingCounts": counts,
            }
        except Exception as e:
            return {"available": False, "message": str(e)}


# 全局单例
fund_ranking_manager = FundRankingManager()