# utils/fund_data_manager.py
import json
import os
from typing import List, Dict, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class FundDataManager:
    def __init__(self, data_file: str = "data/funds.json"):
        self.data_file = data_file
        self.funds_data = []
        self._load_data()
    
    def _load_data(self):
        """加载基金数据"""
        try:
            if os.path.exists(self.data_file):
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    self.funds_data = json.load(f)
                logger.info(f"加载了 {len(self.funds_data)} 个基金数据")
            else:
                # 创建数据目录并初始化数据
                os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
                self.funds_data = self._get_initial_data()
                self._save_data()
                logger.info("创建了初始基金数据文件")
        except Exception as e:
            logger.error(f"加载基金数据失败: {e}")
            self.funds_data = self._get_initial_data()
    
    def _get_initial_data(self) -> List[Dict]:
        """获取初始基金数据"""
        return [
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
    
    def _save_data(self):
        """保存数据到文件"""
        try:
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.funds_data, f, ensure_ascii=False, indent=2)
            logger.info(f"保存了 {len(self.funds_data)} 个基金数据")
        except Exception as e:
            logger.error(f"保存基金数据失败: {e}")
    
    def search(self, keyword: str, limit: int = 20) -> List[Dict]:
        """搜索基金"""
        if not keyword:
            return self.funds_data[:limit]
        
        keyword = keyword.lower()
        results = []
        
        # 优先匹配代码
        for fund in self.funds_data:
            if keyword in fund.get("fund_code", "").lower():
                results.append(fund)
        
        # 然后匹配名称
        for fund in self.funds_data:
            if keyword in fund.get("fund_name", "").lower() and fund not in results:
                results.append(fund)
        
        # 最后匹配类型
        for fund in self.funds_data:
            if keyword in fund.get("fund_type", "").lower() and fund not in results:
                results.append(fund)
        
        return results[:limit]
    
    def get_by_code(self, fund_code: str) -> Optional[Dict]:
        """根据基金代码获取基金信息"""
        for fund in self.funds_data:
            if fund.get("fund_code") == fund_code:
                return fund
        return None
    
    def add_fund(self, fund_code: str, fund_name: str, fund_type: str = "其他"):
        """添加新的基金数据"""
        # 检查是否已存在
        for fund in self.funds_data:
            if fund.get("fund_code") == fund_code:
                # 更新现有基金
                fund["fund_name"] = fund_name
                fund["fund_type"] = fund_type
                self._save_data()
                return True
        
        # 添加新基金
        new_fund = {
            "fund_code": fund_code,
            "fund_name": fund_name,
            "fund_type": fund_type
        }
        self.funds_data.append(new_fund)
        self._save_data()
        return True
    
    def update_from_api(self, keyword: str = None):
        """从第三方API更新基金数据"""
        # 这里可以调用第三方API来更新数据
        # 暂时留空，您可以根据需要实现
        pass

# 创建全局实例
fund_data_manager = FundDataManager()