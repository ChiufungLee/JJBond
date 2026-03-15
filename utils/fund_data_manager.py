# utils/fund_data_manager.py
import logging
from typing import List, Dict, Optional

from sqlalchemy.orm import Session

from models.user import FundLib

logger = logging.getLogger(__name__)

# 初始基金数据，用于首次建库时写入
INITIAL_FUNDS = [
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


def init_fund_lib(db: Session) -> None:
    """
    启动时初始化基金库：
    - 优先从 data/funds.json 加载完整数据（约 25000+ 条）
    - funds.json 不存在时降级使用 INITIAL_FUNDS（20 条兜底数据）
    - 数据库已有 100 条以上则认为已初始化，跳过
    """
    if db.query(FundLib).count() > 100:
        logger.info("基金库已初始化，跳过")
        return

    # 优先读取 funds.json
    funds_to_insert = _load_funds_json()
    if not funds_to_insert:
        logger.warning("funds.json 未找到或为空，使用内置兜底数据")
        funds_to_insert = INITIAL_FUNDS

    # 清空旧的不完整数据，重新写入
    db.query(FundLib).delete()
    db.bulk_insert_mappings(FundLib, funds_to_insert)
    db.commit()
    logger.info(f"初始化基金库完成，写入 {len(funds_to_insert)} 条记录")


def _load_funds_json() -> List[Dict]:
    """从 data/funds.json 加载基金数据，过滤掉 FundLib 不认识的字段"""
    import os, json
    # 相对于项目根目录寻找
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, 'data', 'funds.json')
    if not os.path.exists(json_path):
        return []
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        # 只保留 FundLib 需要的字段
        allowed = {'fund_code', 'fund_name', 'fund_type'}
        return [{k: v for k, v in item.items() if k in allowed} for item in raw]
    except Exception as e:
        logger.error(f"读取 funds.json 失败: {e}")
        return []


def search_funds(db: Session, keyword: str, limit: int = 20) -> List[Dict]:
    """
    搜索基金：优先精确匹配代码，其次模糊匹配名称和类型。
    数据库有索引，性能远优于原来的全量列表遍历。
    """
    if not keyword:
        rows = db.query(FundLib).limit(limit).all()
        return _to_dict_list(rows)

    # 精确匹配代码（走 index，O(1)）
    exact = db.query(FundLib).filter(FundLib.fund_code == keyword).first()
    results = [exact] if exact else []

    # 模糊匹配名称 / 类型（补足剩余名额）
    remaining = limit - len(results)
    if remaining > 0:
        fuzzy = (
            db.query(FundLib)
            .filter(
                FundLib.fund_name.contains(keyword) |
                FundLib.fund_type.contains(keyword),
                FundLib.fund_code != keyword  # 排除已精确命中的
            )
            .limit(remaining)
            .all()
        )
        results.extend(fuzzy)

    return _to_dict_list(results)


def get_fund_by_code(db: Session, fund_code: str) -> Optional[Dict]:
    """根据基金代码精确查询"""
    row = db.query(FundLib).filter(FundLib.fund_code == fund_code).first()
    return _to_dict(row) if row else None


def upsert_fund(db: Session, fund_code: str, fund_name: str, fund_type: str = "其他") -> None:
    """新增或更新基金库记录"""
    row = db.query(FundLib).filter(FundLib.fund_code == fund_code).first()
    if row:
        row.fund_name = fund_name
        row.fund_type = fund_type
    else:
        db.add(FundLib(fund_code=fund_code, fund_name=fund_name, fund_type=fund_type))
    db.commit()


# ---------- 内部工具 ----------

def _to_dict(row: FundLib) -> Dict:
    return {"fund_code": row.fund_code, "fund_name": row.fund_name, "fund_type": row.fund_type}


def _to_dict_list(rows: List[FundLib]) -> List[Dict]:
    return [_to_dict(r) for r in rows]