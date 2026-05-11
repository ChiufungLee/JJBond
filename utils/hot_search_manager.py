"""
热搜基金管理器
从东方财富 fundhot8 页面抓取混合型热搜基金数据
Redis 缓存，定时更新
"""
import json
import logging
import re

from core.database import get_redis
from core.http_client import get_http_session
from utils.http_headers import UA_DESKTOP, REFERER_EASTMONEY

logger = logging.getLogger(__name__)

CACHE_KEY = "hot_search:funds"
CACHE_TTL = 900  # 15 分钟


class HotSearchManager:

    async def get_hot_funds(self) -> list[dict]:
        """获取热搜基金列表，Redis 缓存优先"""
        redis = get_redis()
        if redis is not None:
            try:
                cached = await redis.get(CACHE_KEY)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        data = await self.fetch_hot_funds()
        if data:
            await self._save_cache(redis, data)
        return data

    async def fetch_hot_funds(self) -> list[dict]:
        """从东方财富 fundhot8 页面抓取混合型热搜基金数据"""
        session = get_http_session()

        try:
            data = await self._fetch_from_page(session)
            if data:
                logger.info(f"热搜基金：解析成功，{len(data)} 只基金")
                return data
            else:
                logger.warning("热搜基金：未解析到数据")
                return []
        except Exception as e:
            logger.error(f"热搜基金：抓取失败: {e}")
            return []

    # ====== 策略1: 解析 fundhot8 页面 HTML ======

    async def _fetch_from_page(self, session) -> list[dict]:
        from bs4 import BeautifulSoup

        url = "https://fund.eastmoney.com/fundhot8.html"
        headers = {
            "User-Agent": UA_DESKTOP,
            "Host": "fund.eastmoney.com",
            "Referer": REFERER_EASTMONEY,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }

        async with session.get(url, headers=headers) as resp:
            raw = await resp.read()
            for encoding in ("utf-8", "gbk", "gb2312"):
                try:
                    html = raw.decode(encoding)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            else:
                html = raw.decode("utf-8", errors="ignore")

        soup = BeautifulSoup(html, "lxml")
        results = []

        # 查找"混合型"标题下的表格
        for h2 in soup.find_all("h2"):
            b_tag = h2.find("b")
            if not b_tag or "混合型" not in b_tag.get_text():
                continue

            # 找到同级的 table
            parent = h2.parent
            table = parent.find("table", class_="tb") if parent else None
            if not table:
                continue

            for row in table.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) < 3:
                    continue

                # 提取基金代码：从链接 href 中提取6位数字
                fname_td = row.find("td", class_="fname")
                if not fname_td:
                    continue
                link = fname_td.find("a")
                if not link:
                    continue

                href = link.get("href", "")
                code_match = re.search(r'/(\d{6})\.html', href)
                if not code_match:
                    continue

                fund_code = code_match.group(1)
                fund_name = link.get_text(strip=True)

                # 提取近1年收益率（第一列 num）
                rate = ""
                num_tds = row.find_all("td", class_="num")
                if num_tds:
                    span = num_tds[0].find("span")
                    if span:
                        rate = span.get_text(strip=True)

                formatted_rate = self._format_rate(rate) if rate else "--"
                results.append({
                    "fund_code": fund_code,
                    "fund_name": fund_name,
                    "return_rate": formatted_rate,
                    "rate_class": "up" if formatted_rate.startswith("+") else "down",
                })

            if results:
                logger.info(f"热搜基金：从混合型表格解析到 {len(results)} 条数据")
                return results[:30]

        logger.warning("热搜基金：未找到混合型表格")
        return []

    @staticmethod
    def _format_rate(rate: str) -> str:
        """格式化收益率显示"""
        rate = rate.strip().replace("%", "")
        if not rate or rate == "---" or rate == "--":
            return "--"
        try:
            val = float(rate)
            return f"{val:+.2f}%"
        except ValueError:
            return rate if "%" in rate else f"{rate}%"

    @staticmethod
    async def _save_cache(redis, data: list[dict]):
        if redis is None:
            return
        try:
            await redis.setex(CACHE_KEY, CACHE_TTL, json.dumps(data, ensure_ascii=False))
        except Exception:
            pass


# 模块级单例
hot_search_manager = HotSearchManager()
