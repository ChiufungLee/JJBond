import asyncio
import aiohttp
import json
import re
from datetime import datetime, date, timedelta
from lxml import etree
from bs4 import BeautifulSoup
import logging
from typing import Dict, Optional, List, Any
from core.database import redis_client

logger = logging.getLogger(__name__)

class FundCalculator:
    """基金计算器类，封装所有基金计算功能"""

    def __init__(self):
        # 日期相关
        self.yesterday = str(date.today() + timedelta(days=-1))
        self.six_days_ago = str(date.today() + timedelta(days=-11))

    def _reset_state(self):
        """重置累计状态"""
        self.total_revenue = 0
        self.full_today_revenue = 0
        self.yesterday_holding_income = 0
        self.full_cost = 0
        self.full_today_holding_amount = 0
        self.yesterday_holding_amount = 0

    def _cache_get(self, key: str) -> Optional[str]:
        """从 Redis 读取缓存，Redis 不可用时返回 None"""
        if redis_client is None:
            return None
        try:
            return redis_client.get(key)
        except Exception as e:
            logger.warning(f"Redis 读取失败: {e}")
            return None

    def _cache_set(self, key: str, value: str, expire: int) -> None:
        """写入 Redis 缓存，Redis 不可用时静默跳过"""
        if redis_client is None:
            return
        try:
            redis_client.setex(key, expire, value)
        except Exception as e:
            logger.warning(f"Redis 写入失败: {e}")

    def _get_cached_fund_info(self, fund_code: str) -> Optional[Dict]:
        """从缓存获取基金信息"""
        cached_data = self._cache_get(f"fund_info:{fund_code}")
        if cached_data:
            return json.loads(cached_data)
        return None

    def _set_cached_fund_info(self, fund_code: str, data: Dict, expire: int = 300):
        """缓存基金信息（5分钟）"""
        self._cache_set(f"fund_info:{fund_code}", json.dumps(data), expire)

    async def get_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取基金信息（异步，优先读缓存）"""
        cached_info = self._get_cached_fund_info(fund_code)
        if cached_info:
            return cached_info

        try:
            if fund_code.startswith(('OF', 'F', 'SH', 'SZ')):
                fund_info = await self._get_lof_fund_info(fund_code)
            else:
                fund_info = await self._get_common_fund_info(fund_code)

            if fund_info:
                self._set_cached_fund_info(fund_code, fund_info)
            return fund_info
        except Exception as e:
            logger.error(f"获取基金信息失败: {fund_code}, 错误: {str(e)}")
            return None

    async def _get_common_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取普通基金信息（异步，复用 ClientSession 重试）"""
        url = f"http://fundgz.1234567.com.cn/js/{fund_code}.js"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        async with aiohttp.ClientSession() as session:
            for i in range(3):
                try:
                    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        resp.raise_for_status()
                        text = await resp.text()
                        matched = re.findall(r'^jsonpgz\((.*)\)', text)
                        if matched:
                            return json.loads(matched[0])
                except Exception as e:
                    logger.warning(f"获取基金信息失败 {fund_code}, 重试 {i+1}/3: {str(e)}")
                    if i < 2:
                        await asyncio.sleep(1)
        return None

    async def _get_lof_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取LOF基金信息（异步，复用 ClientSession 重试）"""
        url = f'http://fund.eastmoney.com/{fund_code}.html'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        async with aiohttp.ClientSession() as session:
            for i in range(3):
                try:
                    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        resp.raise_for_status()
                        body = await resp.read()
                        soup = BeautifulSoup(body, 'html.parser')

                        name_element = soup.find('a', href=url, target="_self")
                        name = name_element.getText() if name_element else "未知基金"

                        value_element = soup.find_all('dd', {'class': 'dataNums'})[1].find('span')
                        value = value_element.getText() if value_element else "0.00"

                        date_element = soup.find('dl', {'class': "dataItem02"}).find('p')
                        date_str = date_element.getText() if date_element else "未知日期"

                        return {'name': name, 'value': value, 'data': date_str}
                except Exception as e:
                    logger.warning(f"获取LOF基金信息失败 {fund_code}, 重试 {i+1}/3: {str(e)}")
                    if i < 2:
                        await asyncio.sleep(1)
        return None

    async def get_change_recent_days(self, fund_code: str) -> str:
        """获取基金最近涨跌情况（异步）"""
        cache_key = f"fund_recent:{fund_code}"
        cached_data = self._cache_get(cache_key)
        if cached_data:
            return cached_data

        url = (f"http://fund.eastmoney.com/f10/F10DataApi.aspx"
               f"?type=lsjz&code={fund_code}&page=1"
               f"&sdate={self.six_days_ago}&edate={self.yesterday}&per=20")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    resp.raise_for_status()
                    text = await resp.text()

            matched = re.findall(r'content:"(.*?)",records:', text)
            if not matched:
                return "无数据"

            html = etree.HTML(matched[0])
            html_data = html.xpath('//tr/td/text()')
            rise_fall_list = [num for num in html_data if num.endswith('%')]
            rise_fall_list.reverse()
            result = ' , '.join(rise_fall_list)
            self._cache_set(cache_key, result, 600)
            return result
        except Exception as e:
            logger.error(f"获取近期涨跌失败: {fund_code}, 错误: {str(e)}")
            return "获取失败"

    async def get_fund_nav_history_simple(self, fund_code: str, days: int = 30) -> List[Dict[str, Any]]:
        """获取基金历史净值数据（异步，仅提取日期、单位净值、增长率）"""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        sdate = start_date.strftime("%Y-%m-%d")
        edate = end_date.strftime("%Y-%m-%d")

        cache_key = f"fund_nav_simple:{fund_code}:{sdate}:{edate}"
        cached_data = self._cache_get(cache_key)
        if cached_data:
            try:
                return json.loads(cached_data)
            except json.JSONDecodeError:
                pass

        url = (f"http://fund.eastmoney.com/f10/F10DataApi.aspx"
               f"?type=lsjz&code={fund_code}&page=1&sdate={sdate}&edate={edate}&per=50")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
            'Connection': 'close'
        }
        result = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    resp.raise_for_status()
                    text = await resp.text()

            match = re.search(r'content:"(.*?)",records:', text, re.DOTALL)
            if not match:
                logger.warning(f"未匹配到基金净值数据: {fund_code}")
                return result

            raw_html = match.group(1).replace('\\r\\n', '\n').replace('\\t', '\t')
            html = etree.HTML(raw_html)
            for row in html.xpath('//tr')[1:]:
                cells = row.xpath('./td')
                if len(cells) < 4:
                    continue
                try:
                    nav_date = cells[0].xpath('string(.)').strip()
                    unit_nav_str = cells[1].xpath('string(.)').strip()
                    daily_growth = cells[3].xpath('string(.)').strip()
                    unit_nav = float(unit_nav_str) if unit_nav_str and unit_nav_str != '-' else None
                    daily_growth_value = None
                    if daily_growth and daily_growth != '-':
                        try:
                            daily_growth_value = float(daily_growth.rstrip('%'))
                        except ValueError:
                            pass
                    if unit_nav is not None:
                        result.append({
                            "date": nav_date,
                            "unit_nav": unit_nav,
                            "daily_growth": daily_growth,
                            "daily_growth_value": daily_growth_value
                        })
                except Exception as e:
                    logger.warning(f"解析净值行失败: {fund_code}, 错误: {str(e)}")

            result.sort(key=lambda x: x["date"], reverse=True)
            self._cache_set(cache_key, json.dumps(result, ensure_ascii=False), 900)
            logger.info(f"获取基金净值历史成功: {fund_code}, 记录数: {len(result)}")
            return result

        except Exception as e:
            logger.error(f"获取基金净值历史失败: {fund_code}, 错误: {str(e)}")
            return []


    async def calculate_portfolio(self, funds_data: List[Dict]) -> Dict:
        """
        计算投资组合（异步并发版）。
        用 asyncio.gather 同时抓取所有基金的行情和历史净值，
        耗时从 N×单次延迟 降为约 1×单次延迟。
        """
        if not funds_data:
            return {
                'fund_count': 0, 'total_cost': 0,
                'yesterday_holding_amount': 0, 'yesterday_holding_income': 0,
                'today_revenue': 0, 'today_holding_amount': 0,
                'low_fund_list': [], 'high_fund_list': [], 'fund_details': [],
            }

        fund_codes = [f['fund_code'] for f in funds_data]

        # 并发抓取：行情数据 + 历史净值同时发起
        fund_infos, nav_histories = await asyncio.gather(
            asyncio.gather(*[self.get_fund_info(code) for code in fund_codes]),
            asyncio.gather(*[self.get_fund_nav_history_simple(code) for code in fund_codes]),
        )

        low_fund_list = []
        high_fund_list = []
        fund_details = []

        # 累加器均为局部变量，避免并发请求间的状态污染
        full_cost = 0
        full_today_revenue = 0
        yesterday_holding_income = 0
        yesterday_holding_amount = 0
        full_today_holding_amount = 0

        for fund_data, fund_info, rise_fall in zip(funds_data, fund_infos, nav_histories):
            fund_code  = fund_data['fund_code']
            fund_name  = fund_data.get('fund_name', fund_code)
            cost_price = fund_data['cost_price']
            share      = fund_data['shares']
            count      = round(cost_price * share, 2)  # 持仓成本

            # 行情获取失败：返回降级记录，行情字段置 None，不参与汇总计算
            if not fund_info:
                logger.warning(f"基金 {fund_code} 行情获取失败，返回降级记录")
                fund_details.append({
                    'fund_code': fund_code,
                    'fund_name': fund_name,
                    'cost': count,
                    'cost_price': cost_price,
                    'shares': share,
                    'data_unavailable': True,
                    'amount': None,
                    'shangrijingzhi': None,
                    'today_value': None,
                    'change_rate': None,
                    'change_rate_value': -999,  # 排序时置于末尾
                    'today_revenue': None,
                    'total_revenue': None,
                    'profit_loss_ratio': None,
                    'recent_changes': [],
                })
                continue

            # 金额计算
            if 'dwjz' in fund_info:  # 普通基金
                amount        = round(float(fund_info['dwjz']) * share, 2)
                today_value   = float(fund_info.get('gsz', fund_info['dwjz']))
                fund_name     = fund_info['name']
                shangrijingzhi = float(fund_info['dwjz'])
            else:  # LOF基金
                amount        = round(float(fund_info['value']) * share, 2)
                today_value   = float(fund_info['value'])
                fund_name     = fund_info['name']
                shangrijingzhi = today_value  # LOF基金无昨日净值字段，用当前净值代替

            # 今日收益
            if 'dwjz' in fund_info:
                today_revenue = round((today_value - float(fund_info['dwjz'])) * share, 2)
            else:
                today_revenue = 0

            # 总收益与盈亏率
            total_revenue        = round((today_value - cost_price) * share, 2)
            profit_and_loss_ratio = round((total_revenue / count) * 100, 2) if count > 0 else 0

            # 涨跌幅度
            if 'gszzl' in fund_info:
                gszzl       = float(fund_info['gszzl'])
                change_rate = f"{gszzl}%"
            else:
                gszzl       = 0
                change_rate = "--"

            # 更新汇总数据（仅行情正常的基金才计入）
            full_cost += count
            yesterday_holding_amount += amount
            yesterday_holding_income += total_revenue - today_revenue
            full_today_revenue        = round(full_today_revenue + today_revenue, 2)
            full_today_holding_amount = yesterday_holding_amount + full_today_revenue

            # 添加到高低基金列表
            if gszzl <= -3:
                low_fund_list.append(f"{fund_name} 跌幅为: {gszzl}%")
            if gszzl >= 3:
                high_fund_list.append(f"{fund_name} 涨幅为: +{gszzl}%")

            fund_details.append({
                'fund_code': fund_code,
                'fund_name': fund_name,
                'cost': count,
                'cost_price': cost_price,
                'shares': share,
                'data_unavailable': False,
                'amount': amount,
                'shangrijingzhi': shangrijingzhi,
                'today_value': today_value,
                'change_rate': change_rate,
                'change_rate_value': gszzl,  # 用于排序的临时字段
                'today_revenue': today_revenue,
                'total_revenue': total_revenue,
                'profit_loss_ratio': profit_and_loss_ratio,
                'recent_changes': rise_fall,
            })

        # 按涨跌幅由大到小排序，排序后删除临时字段
        fund_details.sort(key=lambda x: x['change_rate_value'], reverse=True)
        for detail in fund_details:
            detail.pop('change_rate_value', None)

        return {
            'fund_count': len(fund_details),
            'total_cost': round(full_cost, 2),
            'yesterday_holding_amount': round(yesterday_holding_amount, 2),
            'yesterday_holding_income': round(yesterday_holding_income, 2),
            'today_revenue': round(full_today_revenue, 2),
            'today_holding_amount': round(full_today_holding_amount, 2),
            'low_fund_list': low_fund_list,
            'high_fund_list': high_fund_list,
            'fund_details': fund_details,
        }