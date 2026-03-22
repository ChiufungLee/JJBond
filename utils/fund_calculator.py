import asyncio
import aiohttp
import json
import re
from datetime import datetime, date, timedelta
from calendar import monthrange
from lxml import etree
from bs4 import BeautifulSoup
import logging
from typing import Dict, Optional, List, Any
from core.database import redis_client
from core.http_client import get_http_session

logger = logging.getLogger(__name__)

class FundCalculator:
    """
    基金计算器，所有方法均为无状态操作（无实例变量）。
    通过模块级单例 `calculator` 在整个应用中共享，无需每次 new。
    """

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
        session = get_http_session()
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

        # 常规接口失败，尝试备用接口（使用同一个 session）
        logger.info(f"常规接口获取失败，尝试备用接口: {fund_code}")
        return await self._get_fund_info_backup(session, fund_code)

    async def _get_fund_info_backup(self, session, fund_code: str) -> Optional[Dict]:
        """备用接口获取基金信息（天天基金 API）"""
        url = "https://fundcomapi.tiantianfunds.com/mm/newCore/FundCoreDiyNew"
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        # 请求参数
        fields = 'SHORTNAME,RZDF,DWJZ,LJJZ,SYL_1N,SYL_LN,FSRQ,ISBUY,DTZT,FTYPE,FCODE,ISSALES,ISSBDATE,ISSEDATE,TSRQ,BACKCODE,MINSG,MINSBSG,SHZT,SGZT,SOURCERATE,RATE,REALSGCODE,FEATURE,SYL,MINRG,SYL_Z,BFUNDTYPE,QDCODE,MINDT,BAGTYPE,FUNDTYPE,BENCH,ESTABDATE,SELLSTATE,ESTDIFF,SYSDATE,PTYPE,FUNDTYPE,ISEXCHG,ISNEW,BTYPE'
        data = {
            'deviceid': '1234567.py.service',
            'version': '6.5.5',
            'appVersion': '6.5.5',
            'product': 'EFund',
            'plat': 'Iphone',
            'FCODES': fund_code,
            'FIELDS': fields
        }
        try:
            async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                result = await resp.json()

                if result.get('success') and result.get('data'):
                    item = result['data'][0]
                    # 转换为统一格式
                    fund_info = {
                        'fundcode': item.get('FCODE', fund_code),
                        'name': item.get('SHORTNAME', ''),
                        'dwjz': str(item.get('DWJZ', '0')),
                        'gsz': str(item.get('DWJZ', '0')),  # 使用单位净值作为估算值
                        'gszzl': str(item.get('RZDF', '0')),  # 日涨跌幅
                        'jzrq': item.get('FSRQ', ''),  # 净值日期
                        'ftype': item.get('FTYPE', ''),  # 基金类型
                    }
                    logger.info(f"备用接口获取成功: {fund_code}")
                    return fund_info
        except Exception as e:
            logger.error(f"备用接口获取失败: {fund_code}, 错误: {str(e)}")

        return None

    async def _get_lof_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取LOF基金信息（异步，复用 ClientSession 重试）"""
        url = f'http://fund.eastmoney.com/{fund_code}.html'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        session = get_http_session()
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

        yesterday = str(date.today() + timedelta(days=-1))
        six_days_ago = str(date.today() + timedelta(days=-11))
        url = (f"http://fund.eastmoney.com/f10/F10DataApi.aspx"
               f"?type=lsjz&code={fund_code}&page=1"
               f"&sdate={six_days_ago}&edate={yesterday}&per=20")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        try:
            session = get_http_session()
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
            session = get_http_session()
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


    async def calculate_portfolio_simple(self, funds_data: List[Dict]) -> Dict:
        """
        计算投资组合（轻量版，仅获取行情，不获取历史净值）。
        用于首页和"我的"页面快速加载。
        """
        if not funds_data:
            return {
                'fund_count': 0, 'total_cost': 0,
                'yesterday_holding_amount': 0, 'yesterday_holding_income': 0,
                'today_revenue': 0, 'today_holding_amount': 0,
                'low_fund_list': [], 'high_fund_list': [], 'fund_details': [],
            }

        fund_codes = [f['fund_code'] for f in funds_data]

        # 只并发抓取行情数据
        fund_infos = await asyncio.gather(*[self.get_fund_info(code) for code in fund_codes])

        low_fund_list = []
        high_fund_list = []
        fund_details = []

        full_cost = 0
        full_today_revenue = 0
        yesterday_holding_income = 0
        yesterday_holding_amount = 0
        full_today_holding_amount = 0

        for fund_data, fund_info in zip(funds_data, fund_infos):
            fund_id    = fund_data.get('id')
            fund_code  = fund_data['fund_code']
            fund_name  = fund_data.get('fund_name', fund_code)
            cost_price = fund_data['cost_price']
            share      = fund_data['shares']
            count      = round(cost_price * share, 2)

            if not fund_info:
                logger.warning(f"基金 {fund_code} 行情获取失败，返回降级记录")
                fund_details.append({
                    'id': fund_id,
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
                    'change_rate_value': -999,
                    'today_revenue': None,
                    'total_revenue': None,
                    'profit_loss_ratio': None,
                    'recent_changes': [],
                })
                continue

            if 'dwjz' in fund_info:
                amount        = round(float(fund_info['dwjz']) * share, 2)
                today_value   = float(fund_info.get('gsz', fund_info['dwjz']))
                fund_name     = fund_info['name']
                shangrijingzhi = float(fund_info['dwjz'])
            else:
                amount        = round(float(fund_info['value']) * share, 2)
                today_value   = float(fund_info['value'])
                fund_name     = fund_info['name']
                shangrijingzhi = today_value

            if 'dwjz' in fund_info:
                today_revenue = round((today_value - float(fund_info['dwjz'])) * share, 2)
            else:
                today_revenue = 0

            total_revenue = round((today_value - cost_price) * share, 2)
            profit_and_loss_ratio = round((total_revenue / count) * 100, 2) if count > 0 else 0

            if 'gszzl' in fund_info:
                gszzl       = float(fund_info['gszzl'])
                change_rate = f"{gszzl}%"
            else:
                gszzl       = 0
                change_rate = "--"

            full_cost += count
            yesterday_holding_amount += amount
            yesterday_holding_income += total_revenue - today_revenue
            full_today_revenue        = round(full_today_revenue + today_revenue, 2)
            full_today_holding_amount = yesterday_holding_amount + full_today_revenue

            if gszzl <= -3:
                low_fund_list.append(f"{fund_name} 跌幅为: {gszzl}%")
            if gszzl >= 3:
                high_fund_list.append(f"{fund_name} 涨幅为: +{gszzl}%")

            fund_details.append({
                'id': fund_id,
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
                'change_rate_value': gszzl,
                'today_revenue': today_revenue,
                'total_revenue': total_revenue,
                'profit_loss_ratio': profit_and_loss_ratio,
                'recent_changes': [],
            })

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

    async def get_fund_nav_history_by_month(self, fund_code: str, year: int, month: int) -> List[Dict[str, Any]]:
        """获取指定月份的基金历史净值数据"""
        start_date = date(year, month, 1)
        # 获取该月最后一天
        _, last_day = monthrange(year, month)
        end_date = date(year, month, last_day)

        sdate = start_date.strftime("%Y-%m-%d")
        edate = end_date.strftime("%Y-%m-%d")

        cache_key = f"fund_nav_month:{fund_code}:{sdate}:{edate}"
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
            session = get_http_session()
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
                    unit_nav = float(unit_nav_str) if unit_nav_str and unit_nav_str != '-' else None
                    if unit_nav is not None:
                        result.append({
                            "date": nav_date,
                            "unit_nav": unit_nav,
                        })
                except Exception as e:
                    logger.warning(f"解析净值行失败: {fund_code}, 错误: {str(e)}")

            result.sort(key=lambda x: x["date"])
            self._cache_set(cache_key, json.dumps(result, ensure_ascii=False), 900)
            return result

        except Exception as e:
            logger.error(f"获取基金净值历史失败: {fund_code}, 错误: {str(e)}")
            return []

    def _build_daily_shares_snapshot(
        self, transactions: List, fund_codes: set, year: int, month: int
    ) -> Dict[str, Dict[str, float]]:
        """
        预计算每只基金在指定月份每一天的持仓份额快照。

        原 _calculate_shares_at_date 在日历循环中对每天每只基金都遍历全量
        transactions，复杂度为 O(days × funds × transactions)。
        本方法改为：按基金分组后对每只基金的 transactions 排序并做一次前缀
        扫描，整体复杂度降为 O(transactions × log + days × funds)。

        返回: {fund_code: {date_str: shares}}
        """
        from collections import defaultdict

        _, days_in_month = monthrange(year, month)

        # 按基金分组并按日期排序，只扫描一次
        tx_by_fund: Dict[str, list] = defaultdict(list)
        for tx in transactions:
            tx_date = (
                tx.transaction_date.date()
                if isinstance(tx.transaction_date, datetime)
                else tx.transaction_date
            )
            tx_by_fund[tx.fund_code].append((tx_date, tx.transaction_type, tx.shares))

        for fund_code in tx_by_fund:
            tx_by_fund[fund_code].sort(key=lambda x: x[0])

        # 对每只基金生成当月每天的份额快照（前缀累加）
        snapshot: Dict[str, Dict[str, float]] = {}
        for fund_code in fund_codes:
            txs = tx_by_fund.get(fund_code, [])
            tx_idx = 0
            running_shares = 0.0
            daily: Dict[str, float] = {}

            for day in range(1, days_in_month + 1):
                current_date = date(year, month, day)
                # 消费所有 <= current_date 的 transactions
                while tx_idx < len(txs) and txs[tx_idx][0] <= current_date:
                    _, tx_type, tx_shares = txs[tx_idx]
                    if tx_type == 'buy':
                        running_shares += tx_shares
                    elif tx_type == 'sell':
                        running_shares -= tx_shares
                    tx_idx += 1
                daily[current_date.strftime("%Y-%m-%d")] = max(running_shares, 0.0)

            snapshot[fund_code] = daily

        return snapshot

    def _build_prev_nav_index(
        self, nav_data: Dict[str, Dict[str, float]], year: int, month: int
    ) -> Dict[str, Dict[str, float]]:
        """
        预计算每只基金当月每个交易日"前一个有净值的交易日"的净值。

        原实现在日历循环内逐天往前线性查找，复杂度 O(days² × funds)。
        本方法提前构建索引，查找时 O(1)。

        返回: {fund_code: {date_str: prev_trading_day_nav}}
        """
        _, days_in_month = monthrange(year, month)
        prev_nav_index: Dict[str, Dict[str, float]] = {}

        for fund_code, nav_dict in nav_data.items():
            index: Dict[str, float] = {}
            last_known_nav = None  # 顺序扫描，记录上一个有净值的交易日净值

            for day in range(1, days_in_month + 1):
                current_date = date(year, month, day)
                date_str = current_date.strftime("%Y-%m-%d")

                if current_date.weekday() < 5:  # 只处理交易日
                    # 当天的"前一日净值"= 上一次见到的交易日净值
                    if last_known_nav is not None:
                        index[date_str] = last_known_nav
                    # 更新 last_known_nav（若当天有净值数据）
                    if date_str in nav_dict:
                        last_known_nav = nav_dict[date_str]

            prev_nav_index[fund_code] = index

        return prev_nav_index

    async def calculate_revenue_calendar(self, transactions: List, year: int, month: int) -> Dict:
        """
        计算收益日历，根据交易记录和历史净值计算每天的收益。

        性能优化：
        - _build_daily_shares_snapshot 将份额查询从 O(days×funds×tx) 降为 O(tx×log + days×funds)
        - _build_prev_nav_index 将前一日净值查询从 O(days²×funds) 降为 O(1)
        """
        # 获取该月的天数
        _, days_in_month = monthrange(year, month)

        # 获取所有涉及的基金代码
        fund_codes = set(tx.fund_code for tx in transactions)

        if not fund_codes:
            return {
                'year': year,
                'month': month,
                'total_revenue': 0,
                'trading_days': 0,
                'positive_days': 0,
                'negative_days': 0,
                'calendar': []
            }

        # 并发获取所有基金的历史净值
        nav_data = {}
        nav_results = await asyncio.gather(
            *[self.get_fund_nav_history_by_month(code, year, month) for code in fund_codes]
        )
        for code, nav_list in zip(fund_codes, nav_results):
            nav_data[code] = {item['date']: item['unit_nav'] for item in nav_list}

        # 预计算：每只基金当月每天的持仓份额快照（O(tx×log + days×funds)）
        shares_snapshot = self._build_daily_shares_snapshot(transactions, fund_codes, year, month)

        # 预计算：每只基金当月每个交易日的前一日净值索引（O(days×funds)）
        prev_nav_index = self._build_prev_nav_index(nav_data, year, month)

        # 构建日历数据（每次查询均 O(1)）
        calendar = []
        total_revenue = 0.0
        trading_days = 0
        positive_days = 0
        negative_days = 0
        accumulated = 0.0

        # 用于根据 fund_code 快速查基金名称（交易记录里有 fund_name）
        fund_name_map: Dict[str, str] = {}
        for tx in transactions:
            if tx.fund_code not in fund_name_map and tx.fund_name:
                fund_name_map[tx.fund_code] = tx.fund_name

        for day in range(1, days_in_month + 1):
            current_date = date(year, month, day)
            date_str = current_date.strftime("%Y-%m-%d")
            weekday = current_date.weekday()  # 0=周一, 6=周日

            is_trading_day = weekday < 5
            day_revenue = None
            day_fund_details: List[Dict] = []

            if is_trading_day:
                day_revenue = 0.0
                has_nav_data = False

                for fund_code in fund_codes:
                    shares = shares_snapshot.get(fund_code, {}).get(date_str, 0.0)
                    if shares <= 0:
                        continue

                    today_nav = nav_data.get(fund_code, {}).get(date_str)
                    yesterday_nav = prev_nav_index.get(fund_code, {}).get(date_str)

                    if today_nav and yesterday_nav:
                        has_nav_data = True
                        fund_revenue = round((today_nav - yesterday_nav) * shares, 2)
                        day_revenue += fund_revenue
                        day_fund_details.append({
                            'fund_code': fund_code,
                            'fund_name': fund_name_map.get(fund_code, fund_code),
                            'shares': shares,
                            'prev_nav': yesterday_nav,
                            'today_nav': today_nav,
                            'revenue': fund_revenue,
                        })

                if has_nav_data:
                    day_revenue = round(day_revenue, 2)
                    total_revenue += day_revenue
                    accumulated += day_revenue
                    trading_days += 1
                    if day_revenue > 0:
                        positive_days += 1
                    elif day_revenue < 0:
                        negative_days += 1
                    # 按收益额降序排列明细
                    day_fund_details.sort(key=lambda x: x['revenue'], reverse=True)
                else:
                    day_revenue = None
                    day_fund_details = []

            calendar.append({
                'date': date_str,
                'day': day,
                'weekday': weekday,
                'is_trading_day': is_trading_day,
                'revenue': day_revenue,
                'accumulated': round(accumulated, 2) if is_trading_day and day_revenue is not None else None,
                'fund_details': day_fund_details,
            })

        return {
            'year': year,
            'month': month,
            'total_revenue': round(total_revenue, 2),
            'trading_days': trading_days,
            'positive_days': positive_days,
            'negative_days': negative_days,
            'calendar': calendar
        }


# 模块级单例：无状态类无需多次实例化，所有路由共享同一个对象
calculator = FundCalculator()