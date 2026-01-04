from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from .base import Base
from datetime import datetime

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # funds = relationship("UserFund", back_populates="user", cascade="all, delete-orphan")


class UserFund(Base):
    __tablename__ = 'user_funds'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    fund_code = Column(String(20), nullable=False)
    fund_name = Column(String(100))
    cost_price = Column(Float, nullable=False) # 持仓成本
    # chengbenjia = Column(Float, nullable=False) # 持仓成本价
    shares = Column(Float, nullable=False) # 持仓份额
    created_at = Column(DateTime, default=datetime.utcnow)

    # user = relationship("User", back_populates="funds")

    
