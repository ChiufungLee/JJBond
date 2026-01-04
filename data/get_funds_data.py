# fetch_funds_simple.py
import json
import requests
import time
import logging
from datetime import datetime
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def fetch_and_save_funds():
    """获取并保存基金数据"""
    # URL
    timestamp = int(time.time() * 1000)
    url = f"http://fund.eastmoney.com/js/fundcode_search.js?v={timestamp}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'http://fund.eastmoney.com/',
    }
    
    try:
        # 获取数据
        logger.info("正在获取基金数据...")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        content = response.text
        
        # 提取数组
        start_idx = content.find("var r = [") + len("var r = [") - 1
        end_idx = content.find("];", start_idx) + 1
        
        if start_idx <= 0 or end_idx <= start_idx:
            logger.error("无法提取数据数组")
            return False
        
        array_str = content[start_idx:end_idx]
        
        # 解析JSON
        raw_data = json.loads(array_str)
        logger.info(f"获取到 {len(raw_data)} 条记录")
        
        # 转换格式
        funds = []
        seen_codes = set()
        
        for item in raw_data:
            if len(item) >= 4:
                fund_code = item[0].strip()
                
                # 去重
                if fund_code in seen_codes:
                    continue
                seen_codes.add(fund_code)
                
                fund_name = item[2].strip()
                raw_type = item[3].strip()
                
                # 处理基金类型
                if "-" in raw_type:
                    fund_type = raw_type.split("-")[0]
                else:
                    fund_type = raw_type
                
                funds.append({
                    "fund_code": fund_code,
                    "fund_name": fund_name,
                    "fund_type": fund_type,
                    "raw_type": raw_type
                })
        
        logger.info(f"去重后得到 {len(funds)} 个基金")
        
        # 保存数据
        result = {
            "metadata": {
                "source": "天天基金",
                "fetch_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_count": len(funds)
            },
            "funds": funds
        }
        
        with open("funds.json", 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        logger.info("数据已保存到 funds.json")
        
        # 打印统计信息
        type_stats = {}
        for fund in funds:
            fund_type = fund.get("fund_type", "未知")
            type_stats[fund_type] = type_stats.get(fund_type, 0) + 1
        
        print("\n基金类型统计:")
        print("-" * 40)
        for fund_type, count in sorted(type_stats.items(), key=lambda x: x[1], reverse=True):
            print(f"{fund_type:10} : {count:6} 个")
        print("-" * 40)
        print(f"总计: {len(funds)} 个基金")
        
        return True
        
    except Exception as e:
        logger.error(f"获取数据失败: {e}")
        return False

if __name__ == "__main__":
    fetch_and_save_funds()