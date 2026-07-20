from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, UniqueConstraint
from .base import Base

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


class AutoInvestPlan(Base):
    """定投计划"""
    __tablename__ = 'auto_invest_plans'
    __table_args__ = (
        UniqueConstraint('user_id', 'fund_code', name='uq_auto_invest_user_fund'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    fund_code = Column(String(20), nullable=False)
    fund_name = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String(10), default='active')  # active / paused / stopped
    created_at = Column(DateTime, default=lambda: datetime.now(SHANGHAI_TZ))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(SHANGHAI_TZ),
        onupdate=lambda: datetime.now(SHANGHAI_TZ),
    )


class AutoInvestRecord(Base):
    """定投执行记录"""
    __tablename__ = 'auto_invest_records'

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    fund_code = Column(String(20), nullable=False)
    execute_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    nav = Column(Float, nullable=True)
    shares = Column(Float, nullable=True)
    status = Column(String(10), default='success')  # success / failed
    error_msg = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(SHANGHAI_TZ))
