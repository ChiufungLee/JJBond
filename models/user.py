# models/user.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from .base import Base


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=True)  # 微信登录可为空
    email = Column(String(100), unique=True, index=True, nullable=True)    # 微信登录可为空
    hashed_password = Column(String(255), nullable=True)  # 微信登录可为空
    # 微信登录相关字段
    openid = Column(String(100), unique=True, index=True, nullable=True)   # 微信 openid
    unionid = Column(String(100), unique=True, index=True, nullable=True)  # 微信 unionid（可选）
    nickname = Column(String(100), nullable=True)       # 微信昵称
    avatar_url = Column(String(500), nullable=True)    # 微信头像
    login_type = Column(String(20), default='password')  # 登录方式: password/wechat
    created_at = Column(DateTime, default=datetime.now)