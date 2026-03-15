from sqlalchemy import Column, Integer, String, Float, DateTime, UniqueConstraint
from .base import Base
from datetime import datetime


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserFund(Base):
    __tablename__ = 'user_funds'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    fund_code = Column(String(20), nullable=False)
    fund_name = Column(String(100))
    cost_price = Column(Float, nullable=False)  # 持仓成本价
    shares = Column(Float, nullable=False)       # 持仓份额
    created_at = Column(DateTime, default=datetime.utcnow)


class FundLib(Base):
    """基金信息库，替代 data/funds.json"""
    __tablename__ = 'fund_lib'

    id = Column(Integer, primary_key=True, index=True)
    fund_code = Column(String(20), unique=True, index=True, nullable=False)
    fund_name = Column(String(200), nullable=False)
    fund_type = Column(String(50), default='其他')
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)