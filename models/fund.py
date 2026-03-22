# models/fund.py
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime
from .base import Base


class UserFund(Base):
    """用户持仓表"""
    __tablename__ = 'user_funds'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    fund_code = Column(String(20), nullable=False)
    fund_name = Column(String(100))
    cost_price = Column(Float, nullable=False)   # 持仓成本价
    shares = Column(Float, nullable=False)        # 持仓份额
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FundLib(Base):
    """基金信息库"""
    __tablename__ = 'fund_lib'

    id = Column(Integer, primary_key=True, index=True)
    fund_code = Column(String(20), unique=True, index=True, nullable=False)
    fund_name = Column(String(200), nullable=False)
    fund_type = Column(String(50), default='其他')
    updated_at = Column(DateTime,
                        default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))