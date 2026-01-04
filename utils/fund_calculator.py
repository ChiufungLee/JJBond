import requests
import json
import re
import time
from datetime import datetime, date, timedelta
from lxml import etree
from bs4 import BeautifulSoup
import logging
from typing import Dict, Optional, List
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
            rise_fall = self.get_change_recent_days(fund_code)
            
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
                'today_revenue': today_revenue,
                'total_revenue': total_revenue,
                'profit_loss_ratio': profit_and_loss_ratio,
                'recent_changes': rise_fall
            }
            print(f"fund_detail:{fund_detail}")
            fund_details.append(fund_detail)

        # 汇总信息
        summary = {
            'total_cost': round(self.full_cost, 2),
            'yesterday_holding_amount': round(self.yesterday_holding_amount, 2),
            'yesterday_holding_income': round(self.yesterday_holding_income, 2),
            'today_revenue': round(self.full_today_revenue, 2),
            'today_holding_amount': round(self.full_today_holding_amount, 2),
            'low_fund_list': low_fund_list,
            'high_fund_list': high_fund_list,
            'fund_details': fund_details
        }
        
        return summary