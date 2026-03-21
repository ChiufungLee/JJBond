"""
基金涨跌幅排行榜工具
使用 Redis 缓存排行榜数据，支持日/周/月/年/今年以来五个维度
"""
import asyncio
import json
import logging
from typing import List, Dict, Optional, Literal
from datetime import datetime, time
import aiohttp
from core.database import redis_client

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
        self.redis = redis_client

    def _is_redis_available(self) -> bool:
        """检查 Redis 是否可用"""
        return self.redis is not None

    def _get_ranking_key(self, ranking_type: RankingType) -> str:
        """获取排行榜的 Redis Key"""
        return f"{RANKING_KEY_PREFIX}{ranking_type}"

    def _get_fund_detail_key(self, fund_code: str) -> str:
        """获取基金详情的 Redis Key"""
        return f"{FUND_DETAIL_KEY_PREFIX}{fund_code}"

    async def fetch_ranking_data_from_api(self, ranking_type: RankingType = "day") -> Optional[List[Dict]]:
        """
        从天天基金 API 获取排行榜数据
        API: POST https://condition.tiantianfunds.com/condition/conditionFund/fundSelect

        Args:
            ranking_type: 排行榜类型，决定 orderField 参数值
        """
        url = "https://condition.tiantianfunds.com/condition/conditionFund/fundSelect"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://fund.eastmoney.com/",
            "Origin": "https://fund.eastmoney.com",
        }

        # 根据排行榜类型获取对应的 orderField
        order_field = ORDER_FIELD_MAP.get(ranking_type, "5_1_-1")

        all_funds = []
        page_index = 1
        page_size = 500  # 每页获取500条，减少请求次数

        try:
            async with aiohttp.ClientSession() as session:
                while True:
                    # 构建请求体
                    form_data = aiohttp.FormData()
                    form_data.add_field("orderField", order_field)
                    form_data.add_field("pageIndex", str(page_index))
                    form_data.add_field("pageNum", str(page_size))
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

                        # 检查是否还有更多数据
                        # 注意：API返回的TotalCount可能为0，所以用返回数据量来判断
                        if len(funds) < page_size:
                            break

                        page_index += 1
                        # 避免请求过快
                        await asyncio.sleep(0.5)

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

    def _safe_float(self, value) -> Optional[float]:
        """安全转换为浮点数"""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    async def sync_ranking_data(self, data: List[Dict] = None) -> bool:
        """
        同步排行榜数据到 Redis
        为每种排行榜类型分别调用API获取数据，确保排序正确

        Args:
            data: 排行榜数据（已废弃，现在会忽略此参数，始终从API获取）

        Returns:
            是否同步成功
        """
        if not self._is_redis_available():
            logger.warning("Redis 不可用，无法同步排行榜数据")
            return False

        try:
            # 清除旧的排行榜数据
            for ranking_type in RANKING_FIELD_MAP.keys():
                self.redis.delete(self._get_ranking_key(ranking_type))

            all_fund_details = {}  # 用于收集所有基金详情

            # 为每种排行榜类型分别获取数据
            for ranking_type in RANKING_FIELD_MAP.keys():
                logger.info(f"正在同步 {ranking_type} 排行榜...")
                funds_data = await self.fetch_ranking_data_from_api(ranking_type)

                if not funds_data:
                    logger.warning(f"获取 {ranking_type} 排行榜数据失败")
                    continue

                # 写入该类型的排行榜（按API返回的顺序，score为排名顺序）
                # 使用排名作为score，这样可以保持API返回的排序
                for rank, fund in enumerate(funds_data, 1):
                    fund_code = fund.get("fundCode")
                    if not fund_code:
                        continue

                    # 获取该类型的涨幅值作为score
                    score_field = RANKING_FIELD_MAP[ranking_type]
                    score = fund.get(score_field)
                    if score is not None:
                        self.redis.zadd(
                            self._get_ranking_key(ranking_type),
                            {fund_code: score}
                        )

                    # 收集基金详情（避免重复）
                    if fund_code not in all_fund_details:
                        all_fund_details[fund_code] = fund

                logger.info(f"{ranking_type} 排行榜同步完成，共 {len(funds_data)} 条")

                # 避免请求过快
                await asyncio.sleep(1)

            # 写入所有基金详情
            for fund_code, fund in all_fund_details.items():
                detail_key = self._get_fund_detail_key(fund_code)
                self.redis.hset(detail_key, mapping={
                    "fundCode": fund_code,
                    "fundName": fund.get("fundName", ""),
                    "ftype": fund.get("ftype", ""),
                    "company": fund.get("company", ""),
                    "daySyl": str(fund.get("daySyl") or ""),
                    "weekSyl": str(fund.get("weekSyl") or ""),
                    "monthSyl": str(fund.get("monthSyl") or ""),
                    "yearSyl": str(fund.get("yearSyl") or ""),
                    "sySyl": str(fund.get("sySyl") or ""),
                    "lnSyl": str(fund.get("lnSyl") or ""),
                    "perNav": str(fund.get("perNav") or ""),
                    "fundSize": str(fund.get("fundSize") or ""),
                    "riskLevel": str(fund.get("riskLevel") or ""),
                })

            # 更新元数据
            self.redis.hset(META_KEY, mapping={
                "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "totalCount": str(len(all_fund_details)),
            })

            logger.info(f"排行榜数据同步成功，共 {len(all_fund_details)} 只基金")
            return True

        except Exception as e:
            logger.error(f"同步排行榜数据失败: {e}")
            return False

    def get_ranking(
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
        if not self._is_redis_available():
            return {"error": "Redis 不可用", "data": []}

        try:
            key = self._get_ranking_key(ranking_type)

            # 获取总数
            total = self.redis.zcard(key)

            # 计算分页偏移
            start = (page - 1) * page_size
            end = start + page_size - 1

            # 获取排行榜（Sorted Set）
            if descending:
                # 降序：涨幅从高到低
                fund_codes = self.redis.zrevrange(key, start, end, withscores=True)
            else:
                # 升序：涨幅从低到高
                fund_codes = self.redis.zrange(key, start, end, withscores=True)

            # 获取基金详情
            result = []
            rank_start = start + 1
            for i, (fund_code, score) in enumerate(fund_codes):
                detail = self.redis.hgetall(self._get_fund_detail_key(fund_code))
                if detail:
                    result.append({
                        "rank": rank_start + i,
                        "fundCode": detail.get("fundCode", fund_code),
                        "fundName": detail.get("fundName", ""),
                        "ftype": detail.get("ftype", ""),
                        "company": detail.get("company", ""),
                        "change": round(float(score), 2) if score else 0,
                        "perNav": self._safe_float(detail.get("perNav")),
                        "riskLevel": detail.get("riskLevel"),
                    })

            # 获取元数据
            meta = self.redis.hgetall(META_KEY)

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

    def get_fund_ranking_info(self, fund_code: str) -> Optional[Dict]:
        """
        获取单个基金在各排行榜中的排名

        Args:
            fund_code: 基金代码

        Returns:
            基金排名信息
        """
        if not self._is_redis_available():
            return None

        try:
            detail = self.redis.hgetall(self._get_fund_detail_key(fund_code))
            if not detail:
                return None

            result = {
                "fundCode": fund_code,
                "fundName": detail.get("fundName", ""),
                "ftype": detail.get("ftype", ""),
                "company": detail.get("company", ""),
                "rankings": {},
            }

            # 获取各维度的排名
            for ranking_type, field in RANKING_FIELD_MAP.items():
                key = self._get_ranking_key(ranking_type)
                score = self.redis.zscore(key, fund_code)
                # 获取排名（降序，分数越高排名越靠前）
                rank = self.redis.zrevrank(key, fund_code)
                total = self.redis.zcard(key)

                result["rankings"][ranking_type] = {
                    "change": round(float(score), 2) if score else None,
                    "rank": rank + 1 if rank is not None else None,
                    "total": total,
                }

            return result

        except Exception as e:
            logger.error(f"获取基金排名信息失败: {fund_code}, {e}")
            return None

    def get_cache_status(self) -> Dict:
        """获取缓存状态"""
        if not self._is_redis_available():
            return {"available": False, "message": "Redis 不可用"}

        try:
            meta = self.redis.hgetall(META_KEY)
            counts = {}
            for ranking_type in RANKING_FIELD_MAP.keys():
                counts[ranking_type] = self.redis.zcard(self._get_ranking_key(ranking_type))

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
