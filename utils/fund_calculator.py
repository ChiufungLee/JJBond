import requests
import json
import re
import time
from datetime import datetime, date, timedelta
from lxml import etree
from bs4 import BeautifulSoup
import logging
from typing import Dict, Optional, List, Any
from core.database import redis_client

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FundCalculator:
    """基金计算器类，封装所有基金计算功能"""
    
    def __init__(self):
        self.total_revenue = 0
        self.full_today_revenue = 0
        self.yesterday_holding_income = 0
        self.full_cost = 0
        self.full_today_holding_amount = 0
        self.yesterday_holding_amount = 0
        
        # 日期相关
        self.yesterday = str(date.today() + timedelta(days=-1))
        self.six_days_ago = str(date.today() + timedelta(days=-11))

    def _get_cached_fund_info(self, fund_code: str) -> Optional[Dict]:
        """从缓存获取基金信息"""
        cache_key = f"fund_info:{fund_code}"
        cached_data = redis_client.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
        return None

    def _set_cached_fund_info(self, fund_code: str, data: Dict, expire: int = 300):
        """缓存基金信息（5分钟）"""
        cache_key = f"fund_info:{fund_code}"
        redis_client.setex(cache_key, expire, json.dumps(data))

    def get_fund_info(self, fund_code: str) -> Optional[Dict]:
        """获取基金信息"""
        # 先尝试从缓存获取
        cached_info = self._get_cached_fund_info(fund_code)
        if cached_info:
            return cached_info

        try:
            if fund_code.startswith(('OF', 'F', 'SH', 'SZ')):
                fund_info = self._get_lof_fund_info(fund_code)
            else:
                fund_info = self._get_common_fund_info(fund_code)
            
            # 缓存结果
            if fund_info:
                self._set_cached_fund_info(fund_code, fund_info)
            return fund_info
        except Exception as e:
            logger.error(f"获取基金信息失败: {fund_code}, 错误: {str(e)}")
            return None

    def _get_common_fund_info(self, fund_code: str) -> Dict:
        """获取普通基金信息"""
        url = f"http://fundgz.1234567.com.cn/js/{fund_code}.js"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        
        for i in range(3):  # 重试3次
            try:
                response = requests.get(url, headers=headers, timeout=5)
                response.raise_for_status()
                
                # 提取JSON数据
                pattern = r'^jsonpgz\((.*)\)'
                content = re.findall(pattern, response.text)
                if content:
                    return json.loads(content[0])
                
            except (requests.RequestException, json.JSONDecodeError) as e:
                logger.warning(f"获取基金信息失败 {fund_code}, 重试 {i+1}/3: {str(e)}")
                time.sleep(1)
        
        raise Exception(f"无法获取基金信息: {fund_code}")

    def _get_lof_fund_info(self, fund_code: str) -> Dict:
        """获取LOF基金信息"""
        url = f'http://fund.eastmoney.com/{fund_code}.html'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        
        for i in range(3):  # 重试3次
            try:
                response = requests.get(url, headers=headers, timeout=10)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # 解析基金名称
                name_element = soup.find('a', href=url, target="_self")
                name = name_element.getText() if name_element else "未知基金"
                
                # 解析基金净值
                value_element = soup.find_all('dd', {'class': 'dataNums'})[1].find('span')
                value = value_element.getText() if value_element else "0.00"
                
                # 解析日期
                date_element = soup.find('dl', {'class': "dataItem02"}).find('p')
                date_str = date_element.getText() if date_element else "未知日期"
                
                return {'name': name, 'value': value, 'data': date_str}
            except (requests.RequestException, IndexError, AttributeError) as e:
                logger.warning(f"获取LOF基金信息失败 {fund_code}, 重试 {i+1}/3: {str(e)}")
                time.sleep(1)
        
        raise Exception(f"无法获取LOF基金信息: {fund_code}")

    def get_change_recent_days(self, fund_code: str) -> str:
        """获取基金最近涨跌情况"""
        cache_key = f"fund_recent:{fund_code}"
        cached_data = redis_client.get(cache_key)
        if cached_data:
            return cached_data

        url = f"http://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code={fund_code}&page=1&sdate={self.six_days_ago}&edate={self.yesterday}&per=20"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close'
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            # 提取内容
            content = re.findall(r'content:"(.*?)",records:', response.text)
            if not content:
                return "无数据"
                
            # 解析HTML
            html = etree.HTML(content[0])
            html_data = html.xpath('//tr/td/text()')
            
            # 提取涨跌百分比
            rise_fall_list = [num for num in html_data if num.endswith('%')]
            rise_fall_list.reverse()
            
            result = ' , '.join(rise_fall_list)
            # 缓存结果（10分钟）
            redis_client.setex(cache_key, 600, result)
            return result
        except Exception as e:
            logger.error(f"获取近期涨跌失败: {fund_code}, 错误: {str(e)}")
            return "获取失败"
    
    def get_fund_nav_history_simple(self, fund_code: str, days: int = 30) -> List[Dict[str, Any]]:
        """
        获取基金历史净值数据（仅提取日期、单位净值、增长率）
        
        Args:
            fund_code: 基金代码
            days: 获取最近多少天的数据，默认30天
        
        Returns:
            [
                {
                    "date": "净值日期",
                    "unit_nav": 单位净值,
                    "daily_growth": "日增长率",
                    "daily_growth_value": 日增长率数值（不带%）
                },
                ...
            ]
        """
        # 计算日期范围
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # 格式化日期字符串
        sdate = start_date.strftime("%Y-%m-%d")
        edate = end_date.strftime("%Y-%m-%d")
        
        # 缓存键
        cache_key = f"fund_nav_simple:{fund_code}:{sdate}:{edate}"
        cached_data = redis_client.get(cache_key)
        
        if cached_data:
            try:
                return json.loads(cached_data)
            except json.JSONDecodeError:
                pass
        
        url = f"http://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code={fund_code}&page=1&sdate={sdate}&edate={edate}&per=50"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': f'http://fund.eastmoney.com/{fund_code}.html',
            'Connection': 'close'
        }
        
        result = []
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            # 提取内容
            pattern = r'content:"(.*?)",records:'
            match = re.search(pattern, response.text, re.DOTALL)
            
            if not match:
                logger.warning(f"未匹配到基金净值数据: {fund_code}")
                return result
            
            content = match.group(1)
            
            # 清理HTML内容
            content = content.replace('\\r\\n', '\n').replace('\\t', '\t')
            
            # 解析HTML表格
            html = etree.HTML(content)
            
            # 使用XPath获取表格行
            rows = html.xpath('//tr')
            
            for row in rows[1:]:  # 跳过表头行
                # 获取所有单元格
                cells = row.xpath('./td')
                if len(cells) < 4:  # 至少需要前4列数据
                    continue
                    
                try:
                    # 提取日期、单位净值、增长率
                    date = cells[0].xpath('string(.)').strip()
                    unit_nav_str = cells[1].xpath('string(.)').strip()
                    daily_growth = cells[3].xpath('string(.)').strip()
                    
                    # 转换单位净值
                    unit_nav = None
                    if unit_nav_str and unit_nav_str != '-':
                        try:
                            unit_nav = float(unit_nav_str)
                        except ValueError:
                            pass
                    
                    # 提取增长率数值（去掉百分号）
                    daily_growth_value = None
                    if daily_growth and daily_growth != '-':
                        try:
                            daily_growth_value = float(daily_growth.rstrip('%'))
                        except ValueError:
                            pass
                    
                    # 只添加有净值数据的数据
                    if unit_nav is not None:
                        nav_data = {
                            "date": date,
                            "unit_nav": unit_nav,
                            "daily_growth": daily_growth,
                            "daily_growth_value": daily_growth_value
                        }
                        result.append(nav_data)
                        
                except Exception as e:
                    logger.warning(f"解析基金净值行数据失败: {fund_code}, 行数据: {etree.tostring(row)}, 错误: {str(e)}")
                    continue
            
            # 按日期排序（最新的在前面）
            result.sort(key=lambda x: x["date"], reverse=True)
            
            # 缓存结果（15分钟）
            redis_client.setex(cache_key, 900, json.dumps(result, ensure_ascii=False))
            
            logger.info(f"获取基金净值历史成功: {fund_code}, 记录数: {len(result)}")
            return result
            
        except requests.exceptions.Timeout:
            logger.error(f"获取基金净值超时: {fund_code}")
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"获取基金净值网络错误: {fund_code}, 错误: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"获取基金净值失败: {fund_code}, 错误: {str(e)}")
            return []

    def calculate_portfolio(self, funds_data: List[Dict]) -> Dict:
        """计算投资组合"""
        low_fund_list = []
        high_fund_list = []
        fund_details = []
        
        # 重置累计数据
        self.__init__()

        for fund_data in funds_data:
            fund_code = fund_data['fund_code']
            cost_price = fund_data['cost_price']
            share = fund_data['shares']
            
            fund_info = self.get_fund_info(fund_code)
            if not fund_info:
                continue
                
            # 基础计算
            count = round(cost_price * share, 2)  # 成本
            
            # 金额计算
            if 'dwjz' in fund_info:  # 普通基金
                amount = round(float(fund_info['dwjz']) * share, 2)
                today_value = float(fund_info.get('gsz', fund_info['dwjz']))
                fund_name = fund_info['name']
                shangrijingzhi = float(fund_info.get('dwjz'))
            else:  # LOF基金
                amount = round(float(fund_info['value']) * share, 2)
                today_value = float(fund_info['value'])
                fund_name = fund_info['name']
            
            # 今日收益计算
            if 'dwjz' in fund_info:
                today_revenue = round((today_value - float(fund_info['dwjz'])) * share, 2)
            else:
                today_revenue = 0
            
            # 总收益计算
            total_revenue = round((today_value - cost_price) * share, 2)
            
            # 盈亏率
            profit_and_loss_ratio = round((total_revenue / count) * 100, 2) if count > 0 else 0
            
            # 涨跌幅度
            if 'gszzl' in fund_info:
                gszzl = float(fund_info['gszzl'])
                change_rate = f"{gszzl}%"
            else:
                gszzl = 0
                change_rate = "--"
            
            # 近期涨跌
            rise_fall = self.get_fund_nav_history_simple(fund_code)
            
            # 更新汇总数据
            self.full_cost += count
            self.yesterday_holding_amount += amount
            self.yesterday_holding_income += total_revenue - today_revenue
            self.full_today_revenue = round(self.full_today_revenue + today_revenue, 2)
            self.full_today_holding_amount = self.yesterday_holding_amount + self.full_today_revenue
            
            # 添加到高低基金列表
            if gszzl <= -3:
                low_fund_list.append(f"{fund_name} 跌幅为: {gszzl}%")
            if gszzl >= 3:
                high_fund_list.append(f"{fund_name} 涨幅为: +{gszzl}%")
            
            # 基金详情
            fund_detail = {
                'fund_code': fund_code,
                'fund_name': fund_name,
                'cost': count,
                'amount': amount,
                'cost_price': cost_price,
                'shangrijingzhi': shangrijingzhi,
                'today_value': today_value,
                'change_rate': change_rate,
                'change_rate_value': gszzl,  # 添加用于排序的数值字段
                'today_revenue': today_revenue,
                'total_revenue': total_revenue,
                'profit_loss_ratio': profit_and_loss_ratio,
                'recent_changes': rise_fall
            }
            fund_details.append(fund_detail)

        # 按照涨跌幅度（change_rate_value）由大到小排序
        fund_details.sort(key=lambda x: x['change_rate_value'], reverse=True)
        # 删除排序用的临时字段（可选）
        for detail in fund_details:
            detail.pop('change_rate_value', None)

        fund_count = len(fund_details)

        # 汇总信息
        summary = {
            'fund_count': fund_count,
            'total_cost': round(self.full_cost, 2),
            'yesterday_holding_amount': round(self.yesterday_holding_amount, 2),
            'yesterday_holding_income': round(self.yesterday_holding_income, 2),
            'today_revenue': round(self.full_today_revenue, 2),
            'today_holding_amount': round(self.full_today_holding_amount, 2),
            'low_fund_list': low_fund_list,
            'high_fund_list': high_fund_list,
            'fund_details': fund_details,
        }

        return summary