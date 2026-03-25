# models/watchlist.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime
from .base import Base


class WatchlistFund(Base):
    """自选基金表"""
    __tablename__ = 'watchlist_funds'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    fund_code = Column(String(20), nullable=False)
    fund_name = Column(String(100))
    cost_nav = Column(Float, nullable=False)   # 添加自选时的净值
    added_at = Column(DateTime, default=datetime.now)


class FundTransaction(Base):
    """基金交易记录表"""
    __tablename__ = 'fund_transactions'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    fund_code = Column(String(20), nullable=False, index=True)
    fund_name = Column(String(100))
    transaction_type = Column(String(10), nullable=False)   # 'buy' / 'sell'
    shares = Column(Float, nullable=False)                   # 交易份额
    price = Column(Float, nullable=False)                    # 交易单价（净值）
    transaction_date = Column(DateTime, nullable=False)      # 交易日期
    created_at = Column(DateTime, default=datetime.now)