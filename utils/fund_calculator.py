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
from utils.http_headers import UA_DESKTOP, UA_MOBILE, REFERER_EASTMONEY
from utils.helpers import safe_float

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
            # 先尝试普通基金接口
            fund_info = await self._get_common_fund_info(fund_code)
            # 如果普通接口失败，尝试 LOF 接口
            if not fund_info:
                fund_info = await self._get_lof_fund_info(fund_code)

            if fund_info:
                self._set_cached_fund_info(fund_code, fund_info)
            return fund_info
        except Exception as e:
            logger.error(f"获取基金信息失败: {fund_code}, 错误: {str(e)}")
            return None

    async def _get_common_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取普通基金信息（异步，复用 ClientSession 重试）"""
        url = f"http://fundgz.1234567.com.cn/js/{fund_code}.js"
        headers = {'User-Agent': UA_DESKTOP, 'Referer': REFERER_EASTMONEY}
        session = get_http_session()
        for i in range(2):
            try:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    resp.raise_for_status()
                    text = await resp.text()
                    matched = re.findall(r'^jsonpgz\((.*)\)', text)
                    if matched:
                        return json.loads(matched[0])
            except Exception as e:
                logger.warning(f"获取基金信息失败 {fund_code}, 重试 {i+1}/2: {str(e)}")
                if i < 1:
                    await asyncio.sleep(0.5)

        # 常规接口失败，尝试备用接口（使用同一个 session）
        logger.info(f"常规接口获取失败，尝试备用接口: {fund_code}")
        return await self._get_fund_info_backup(session, fund_code)

    async def _get_fund_info_backup(self, session, fund_code: str) -> Optional[Dict]:
        """备用接口获取基金信息（天天基金 API）"""
        url = "https://fundcomapi.tiantianfunds.com/mm/newCore/FundCoreDiyNew"
        headers = {
            'User-Agent': UA_MOBILE,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': REFERER_EASTMONEY,
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
                    gsz = item.get('DWJZ')  # 估算值使用单位净值
                    lastday = gsz/ (1 + item.get('RZDF', 0) / 100) if item.get('RZDF', 0) != 0 else gsz  # 昨日净值
                    fund_info = {
                        'fundcode': item.get('FCODE', fund_code),
                        'name': item.get('SHORTNAME', ''),
                        'jzrq': item.get('FSRQ', ''),  # 净值日期
                        'dwjz': str(lastday),
                        'gsz': str(item.get('DWJZ', '0')),  # 使用单位净值作为估算值
                        'gszzl': str(item.get('RZDF', '0')),  # 日涨跌幅
                        'gztime': item.get('FSRQ', ''),
                        # 'ftype': item.get('FTYPE', ''),  # 基金类型
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
            'User-Agent': UA_DESKTOP,
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
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

                    date_element = soup.find('dl', {'class': "dataItem01"}).find('p')
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
            'User-Agent': UA_DESKTOP,
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
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

    async def get_fund_period_returns(self, fund_code: str) -> Optional[Dict[str, Any]]:
        """
        获取基金各阶段涨跌幅（近一周、近一月、近三月、近六月、近1年、近2年、近3年、今年来、成立来）
        使用天天基金 /fundMNPeriodIncrease 接口
        """
        cache_key = f"fund_returns:{fund_code}"
        cached_data = self._cache_get(cache_key)
        if cached_data:
            try:
                return json.loads(cached_data)
            except json.JSONDecodeError:
                pass

        # 各阶段代码映射
        period_codes = ['Z', 'Y', '3Y', '6Y', '1N', '2N', '3N', '5N', 'JN', 'LN']
        period_names = {
            'Z': '近一周',
            'Y': '近一月',
            '3Y': '近三月',
            '6Y': '近六月',
            '1N': '近1年',
            '2N': '近2年',
            '3N': '近3年',
            '5N': '近5年',
            'JN': '今年来',
            'LN': '成立来'
        }

        url = "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNPeriodIncrease"
        headers = {
            'User-Agent': UA_MOBILE,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': REFERER_EASTMONEY,
        }

        result = {
            'fund_code': fund_code,
            'periods': []
        }

        session = get_http_session()
        try:
            # 一次性请求所有阶段数据
            data = {
                'FCODE': fund_code,
                'RANGE': ','.join(period_codes),
                'deviceid': '1234567.py.service',
                'version': '6.5.5',
                'product': 'EFund',
                'plat': 'Iphone',
            }

            async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                response = await resp.json()

                if response.get('Datas'):
                    for item in response['Datas']:
                        period_code = item.get('title', '')
                        if period_code in period_names:
                            syl = item.get('syl')
                            try:
                                syl_value = float(syl) if syl else None
                            except (ValueError, TypeError):
                                syl_value = None

                            result['periods'].append({
                                'period_code': period_code,
                                'period_name': period_names[period_code],
                                'return_rate': syl_value,
                                'return_rate_str': f"{syl_value}%" if syl_value is not None else '--',
                                'avg': item.get('avg'),  # 同类平均
                                'rank': item.get('rank'),  # 同类排名
                                'sc': item.get('sc'),  # 同类数量
                            })

                    # 按预定义顺序排序
                    order_map = {code: i for i, code in enumerate(period_codes)}
                    result['periods'].sort(key=lambda x: order_map.get(x['period_code'], 999))

            self._cache_set(cache_key, json.dumps(result, ensure_ascii=False), 900)  # 缓存15分钟
            logger.info(f"获取基金阶段涨幅成功: {fund_code}")
            return result

        except Exception as e:
            logger.error(f"获取基金阶段涨幅失败: {fund_code}, 错误: {str(e)}")
            return result

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

        headers = {
            'User-Agent': UA_DESKTOP,
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
        }
        result = []
        try:
            session = get_http_session()
            page = 1
            seen_dates = set()
            reached_start_date = False

            while True:
                url = (
                    f"http://fund.eastmoney.com/f10/F10DataApi.aspx"
                    f"?type=lsjz&code={fund_code}&page={page}&sdate={sdate}&edate={edate}&per=50"
                )
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    resp.raise_for_status()
                    text = await resp.text()

                match = re.search(r'content:"(.*?)",records:(\d+),pages:(\d+)', text, re.DOTALL)
                if not match:
                    if page == 1:
                        logger.warning(f"未匹配到基金净值数据: {fund_code}")
                    break

                raw_html = match.group(1).replace('\\r\\n', '\n').replace('\\t', '\t')
                total_pages = int(match.group(3))
                html = etree.HTML(raw_html)
                page_rows = 0

                for row in html.xpath('//tr')[1:]:
                    cells = row.xpath('./td')
                    if len(cells) < 4:
                        continue
                    try:
                        nav_date = cells[0].xpath('string(.)').strip()
                        if not nav_date or nav_date in seen_dates:
                            continue

                        nav_date_obj = datetime.strptime(nav_date, "%Y-%m-%d").date()
                        if nav_date_obj < start_date:
                            reached_start_date = True
                            continue

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
                            seen_dates.add(nav_date)
                            result.append({
                                "date": nav_date,
                                "unit_nav": unit_nav,
                                "daily_growth": daily_growth,
                                "daily_growth_value": daily_growth_value
                            })
                            page_rows += 1
                    except Exception as e:
                        logger.warning(f"解析净值行失败: {fund_code}, 错误: {str(e)}")

                if page >= total_pages or page_rows == 0 or reached_start_date:
                    break
                page += 1

            result.sort(key=lambda x: x["date"], reverse=True)
            self._cache_set(cache_key, json.dumps(result, ensure_ascii=False), 900)
            logger.info(f"获取基金净值历史成功: {fund_code}, 记录数: {len(result)}")
            return result

        except Exception as e:
            logger.error(f"获取基金净值历史失败: {fund_code}, 错误: {str(e)}")
            return []


    # 兼容旧调用，委托给共享函数
    def _parse_float(self, value: Any) -> Optional[float]:
        return safe_float(value)

    def _is_nav_updated_today(self, real_nav_info: Dict) -> bool:
        """检查实际净值是否已更新到今天"""
        fsrq = real_nav_info.get('fsrq', '')
        if not fsrq:
            return False
        today = date.today()
        for fmt in ('%Y-%m-%d', '%Y%m%d', '%Y/%m/%d'):
            try:
                nav_date = datetime.strptime(fsrq, fmt).date()
                return nav_date == today
            except ValueError:
                continue
        return False

    async def _get_real_nav_info(self, fund_code: str) -> Optional[Dict]:
        """获取实际净值信息（天天基金 FundCoreDiyNew 接口）"""
        cache_key = f"real_nav:{fund_code}"
        cached_data = self._cache_get(cache_key)
        if cached_data:
            try:
                return json.loads(cached_data)
            except json.JSONDecodeError:
                pass

        url = "https://fundcomapi.tiantianfunds.com/mm/newCore/FundCoreDiyNew"
        headers = {
            'User-Agent': UA_MOBILE,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': REFERER_EASTMONEY,
        }
        fields = 'SHORTNAME,RZDF,DWJZ,LJJZ,FSRQ,FCODE'
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
            session = get_http_session()
            async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                result = await resp.json()
                if result.get('success') and result.get('data'):
                    item = result['data'][0]
                    nav_info = {
                        'dwjz': item.get('DWJZ'),
                        'rzdf': item.get('RZDF'),
                        'fsrq': item.get('FSRQ'),
                    }
                    self._cache_set(cache_key, json.dumps(nav_info), 300)
                    return nav_info
        except Exception as e:
            logger.warning(f"获取实际净值失败: {fund_code}, 错误: {str(e)}")
        return None

    def _resolve_market_values(
        self,
        fund_info: Optional[Dict[str, Any]],
        today_nav: Optional[float],
        prev_nav: Optional[float],
        real_nav_info: Optional[Dict] = None,
    ) -> Optional[Dict[str, float]]:
        estimate_value = self._parse_float(fund_info.get('gsz')) if fund_info else None
        market_prev_nav = self._parse_float(fund_info.get('dwjz')) if fund_info else None
        lof_value = self._parse_float(fund_info.get('value')) if fund_info else None

        shangrijingzhi = prev_nav if prev_nav is not None else market_prev_nav
        if shangrijingzhi is None:
            shangrijingzhi = lof_value

        today_value = estimate_value
        if today_value is None:
            today_value = today_nav
        if today_value is None:
            today_value = market_prev_nav
        if today_value is None:
            today_value = lof_value

        # 3点后使用实际净值覆盖
        nav_updated = False
        if real_nav_info:
            real_dwjz = self._parse_float(real_nav_info.get('dwjz'))
            if real_dwjz is not None:
                today_value = real_dwjz
                nav_updated = True

        if shangrijingzhi is None or today_value is None:
            return None

        return {
            'shangrijingzhi': shangrijingzhi,
            'today_value': today_value,
            'nav_updated': nav_updated,
        }

    async def calculate_single_fund(
        self, fund_code: str, fund_name: str,
        cost_price: float, shares: float, fund_id: int = None,
    ) -> Dict:
        """
        计算单只基金的详情，用于轻量级查询。
        仅发 1 次外部请求（get_fund_info），数据不足时回退到历史净值（共 2 次）。
        """
        count = round(cost_price * shares, 2)

        fund_info = await self.get_fund_info(fund_code)

        # 3点后获取实际净值
        real_nav_info = None
        nav_updated = False
        if datetime.now().hour >= 15:
            real_nav_info = await self._get_real_nav_info(fund_code)
            if real_nav_info and self._is_nav_updated_today(real_nav_info):
                nav_updated = True

        resolved = self._resolve_market_values(fund_info, None, None, real_nav_info)

        if not resolved:
            # fund_info 不足，回退到历史净值
            nav_history = await self.get_fund_nav_history_simple(fund_code, days=3)
            today_nav = nav_history[0].get('unit_nav') if nav_history and len(nav_history) >= 1 else None
            prev_nav = nav_history[1].get('unit_nav') if nav_history and len(nav_history) >= 2 else None
            resolved = self._resolve_market_values(fund_info, today_nav, prev_nav, real_nav_info)

        if not resolved:
            return {
                'id': fund_id,
                'fund_code': fund_code,
                'fund_name': fund_name,
                'cost': count,
                'cost_price': cost_price,
                'shares': shares,
                'data_unavailable': True,
                'amount': None, 'shangrijingzhi': None, 'today_value': None,
                'change_rate': None, 'today_revenue': None,
                'total_revenue': None, 'profit_loss_ratio': None,
                'recent_changes': [],
                'nav_updated': False,
            }

        shangrijingzhi = resolved['shangrijingzhi']
        today_value = resolved['today_value']
        nav_updated = resolved.get('nav_updated', nav_updated)
        amount = round(shangrijingzhi * shares, 2)
        today_revenue = round((today_value - shangrijingzhi) * shares, 2)
        total_revenue = round((today_value - cost_price) * shares, 2)
        profit_loss_ratio = round((total_revenue / count) * 100, 2) if count > 0 else 0

        name = fund_info.get('name', fund_name) if fund_info else fund_name
        gszzl = self._parse_float(fund_info.get('gszzl')) if fund_info else None
        # 3点后使用实际涨跌幅
        if nav_updated and real_nav_info:
            rzdf = self._parse_float(real_nav_info.get('rzdf'))
            if rzdf is not None:
                gszzl = rzdf
        change_rate = f"{gszzl}%" if gszzl is not None else "--"

        return {
            'id': fund_id,
            'fund_code': fund_code,
            'fund_name': name,
            'cost': count,
            'cost_price': cost_price,
            'shares': shares,
            'data_unavailable': False,
            'amount': amount,
            'shangrijingzhi': shangrijingzhi,
            'today_value': today_value,
            'change_rate': change_rate,
            'today_revenue': today_revenue,
            'total_revenue': total_revenue,
            'profit_loss_ratio': profit_loss_ratio,
            'recent_changes': [],
            'nav_updated': nav_updated,
        }

    def _compute_fund_detail(
        self, fund_data: Dict, fund_info: Optional[Dict],
        nav_history: Optional[List[Dict]] = None,
        recent_changes: Optional[List[Dict]] = None,
        real_nav_info: Optional[Dict] = None,
    ) -> Dict:
        """
        计算单只基金的详情 dict。
        优先用 fund_info 的 dwjz/gsz，不足时回退到 nav_history。
        """
        fund_id    = fund_data.get('id')
        fund_code  = fund_data['fund_code']
        fund_name  = fund_data.get('fund_name', fund_code)
        cost_price = fund_data['cost_price']
        share      = fund_data['shares']
        count      = round(cost_price * share, 2)

        # 先尝试只用 fund_info 计算
        resolved_values = self._resolve_market_values(fund_info, None, None, real_nav_info)

        daily_growth_value = None
        if not resolved_values and nav_history:
            today_nav = nav_history[0].get('unit_nav') if len(nav_history) >= 1 else None
            prev_nav = nav_history[1].get('unit_nav') if len(nav_history) >= 2 else None
            daily_growth_value = nav_history[0].get('daily_growth_value') if len(nav_history) >= 1 else None
            resolved_values = self._resolve_market_values(fund_info, today_nav, prev_nav, real_nav_info)

        if not resolved_values:
            logger.warning(f"基金 {fund_code} 缺少可用估值数据，返回降级记录")
            return {
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
                'recent_changes': recent_changes if recent_changes is not None else [],
                'nav_updated': False,
            }

        shangrijingzhi = resolved_values['shangrijingzhi']
        amount = round(shangrijingzhi * share, 2)
        today_value = resolved_values['today_value']
        nav_updated = resolved_values.get('nav_updated', False)
        today_revenue = round((today_value - shangrijingzhi) * share, 2)
        name = fund_info.get('name', fund_name) if fund_info else fund_name

        total_revenue = round((today_value - cost_price) * share, 2)
        profit_and_loss_ratio = round((total_revenue / count) * 100, 2) if count > 0 else 0

        gszzl_raw = self._parse_float(fund_info.get('gszzl')) if fund_info else None
        # 3点后使用实际涨跌幅
        if nav_updated and real_nav_info:
            rzdf = self._parse_float(real_nav_info.get('rzdf'))
            if rzdf is not None:
                gszzl_raw = rzdf

        if gszzl_raw is not None:
            gszzl = gszzl_raw
            change_rate = f"{gszzl}%"
        elif daily_growth_value is not None:
            gszzl = daily_growth_value
            change_rate = f"{gszzl}%"
        else:
            gszzl = 0
            change_rate = "--"

        return {
            'id': fund_id,
            'fund_code': fund_code,
            'fund_name': name,
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
            'recent_changes': recent_changes if recent_changes is not None else [],
            'nav_updated': nav_updated,
        }

    def _aggregate_portfolio(self, fund_details: List[Dict]) -> Dict:
        """汇总基金列表，计算组合级数据"""
        full_cost = 0
        full_today_revenue = 0
        yesterday_holding_income = 0
        yesterday_holding_amount = 0
        full_today_holding_amount = 0
        low_fund_list = []
        high_fund_list = []

        for d in fund_details:
            if d.get('data_unavailable'):
                continue
            gszzl = d.pop('change_rate_value')
            full_cost += d['cost']
            yesterday_holding_amount += d['amount']
            total_revenue = d['total_revenue']
            today_revenue = d['today_revenue']
            yesterday_holding_income += total_revenue - today_revenue
            full_today_revenue = round(full_today_revenue + today_revenue, 2)
            full_today_holding_amount = yesterday_holding_amount + full_today_revenue
            if gszzl <= -3:
                low_fund_list.append(f"{d['fund_name']} 跌幅为: {gszzl}%")
            if gszzl >= 3:
                high_fund_list.append(f"{d['fund_name']} 涨幅为: +{gszzl}%")

        # 降级记录的临时字段也清除
        for d in fund_details:
            d.pop('change_rate_value', None)

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

    async def calculate_portfolio_simple(self, funds_data: List[Dict]) -> Dict:
        """
        计算投资组合（轻量版）。
        优先使用 get_fund_info 的 dwjz/gsz，数据不足时才回退到历史净值。
        3点后获取实际净值。
        """
        if not funds_data:
            return {
                'fund_count': 0, 'total_cost': 0,
                'yesterday_holding_amount': 0, 'yesterday_holding_income': 0,
                'today_revenue': 0, 'today_holding_amount': 0,
                'low_fund_list': [], 'high_fund_list': [], 'fund_details': [],
            }

        fund_codes = [f['fund_code'] for f in funds_data]

        # 第一步：只并发获取 fund_info（N 个请求，通常有 Redis 缓存）
        fund_infos = await asyncio.gather(
            *[self.get_fund_info(code) for code in fund_codes]
        )

        # 3点后并发获取实际净值
        real_nav_map: Dict[str, Optional[Dict]] = {}
        if datetime.now().hour >= 15:
            real_nav_results = await asyncio.gather(
                *[self._get_real_nav_info(code) for code in fund_codes]
            )
            for code, real_nav in zip(fund_codes, real_nav_results):
                if real_nav and self._is_nav_updated_today(real_nav):
                    real_nav_map[code] = real_nav

        # 第二步：检查哪些基金需要 nav_history 回退
        fallback_indices = []
        for i, (fund_data, fund_info) in enumerate(zip(funds_data, fund_infos)):
            real_nav = real_nav_map.get(fund_data['fund_code'])
            resolved = self._resolve_market_values(fund_info, None, None, real_nav)
            if not resolved:
                fallback_indices.append(i)

        # 第三步：仅为数据不足的基金获取历史净值
        nav_histories: Dict[int, List] = {}
        if fallback_indices:
            nav_results = await asyncio.gather(
                *[self.get_fund_nav_history_simple(fund_codes[i], days=3) for i in fallback_indices]
            )
            for idx, nav_list in zip(fallback_indices, nav_results):
                nav_histories[idx] = nav_list

        # 第四步：计算每只基金的详情
        fund_details = []
        for i, (fund_data, fund_info) in enumerate(zip(funds_data, fund_infos)):
            nav = nav_histories.get(i)
            real_nav = real_nav_map.get(fund_data['fund_code'])
            fund_details.append(self._compute_fund_detail(fund_data, fund_info, nav, None, real_nav))

        fund_details.sort(key=lambda x: x.get('change_rate_value', 0), reverse=True)
        return self._aggregate_portfolio(fund_details)

    async def calculate_portfolio(self, funds_data: List[Dict]) -> Dict:
        """
        计算投资组合（完整版）。
        包含 30 天历史净值用于图表展示。
        3点后获取实际净值。
        """
        if not funds_data:
            return {
                'fund_count': 0, 'total_cost': 0,
                'yesterday_holding_amount': 0, 'yesterday_holding_income': 0,
                'today_revenue': 0, 'today_holding_amount': 0,
                'low_fund_list': [], 'high_fund_list': [], 'fund_details': [],
            }

        fund_codes = [f['fund_code'] for f in funds_data]

        # 第一步：只并发获取 fund_info（N 个请求，通常有 Redis 缓存）
        fund_infos = await asyncio.gather(
            *[self.get_fund_info(code) for code in fund_codes]
        )

        # 3点后并发获取实际净值
        real_nav_map: Dict[str, Optional[Dict]] = {}
        if datetime.now().hour >= 15:
            real_nav_results = await asyncio.gather(
                *[self._get_real_nav_info(code) for code in fund_codes]
            )
            for code, real_nav in zip(fund_codes, real_nav_results):
                if real_nav and self._is_nav_updated_today(real_nav):
                    real_nav_map[code] = real_nav

        # 第二步：检查哪些基金需要 nav_history 回退（仅需 3 天数据）
        fallback_indices = []
        for i, (fund_data, fund_info) in enumerate(zip(funds_data, fund_infos)):
            real_nav = real_nav_map.get(fund_data['fund_code'])
            resolved = self._resolve_market_values(fund_info, None, None, real_nav)
            if not resolved:
                fallback_indices.append(i)

        nav_histories: Dict[int, List] = {}
        if fallback_indices:
            nav_results = await asyncio.gather(
                *[self.get_fund_nav_history_simple(fund_codes[i], days=3) for i in fallback_indices]
            )
            for idx, nav_list in zip(fallback_indices, nav_results):
                nav_histories[idx] = nav_list

        # 第三步：计算每只基金的详情
        fund_details = []
        for i, (fund_data, fund_info) in enumerate(zip(funds_data, fund_infos)):
            nav = nav_histories.get(i)
            real_nav = real_nav_map.get(fund_data['fund_code'])
            fund_details.append(self._compute_fund_detail(fund_data, fund_info, nav, None, real_nav))

        # 第四步：并发获取所有基金的 30 天历史净值（用于 recent_changes 图表）
        recent_navs = await asyncio.gather(
            *[self.get_fund_nav_history_simple(code, days=30) for code in fund_codes]
        )
        for i, recent in enumerate(recent_navs):
            fund_details[i]['recent_changes'] = recent if recent else []

        fund_details.sort(key=lambda x: x.get('change_rate_value', 0), reverse=True)
        return self._aggregate_portfolio(fund_details)

    async def get_fund_nav_history_by_month(
        self, fund_code: str, year: int, month: int, include_prev_trading_day: bool = False
    ) -> List[Dict[str, Any]]:
        """获取指定月份的基金历史净值数据"""
        start_date = date(year, month, 1)
        if include_prev_trading_day:
            start_date = start_date - timedelta(days=7)
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
            'User-Agent': UA_DESKTOP,
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
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

            for nav_date in sorted(nav_dict.keys()):
                if nav_date < f"{year:04d}-{month:02d}-01":
                    last_known_nav = nav_dict[nav_date]

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
            *[
                self.get_fund_nav_history_by_month(code, year, month, include_prev_trading_day=True)
                for code in fund_codes
            ]
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