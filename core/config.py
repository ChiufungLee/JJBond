# core/config.py

import os
# from pydantic import BaseSettings
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Settings(BaseSettings):
    # 数据库配置
    DATABASE_URL: str = os.getenv("DATABASE_URL", "mysql+pymysql://root:lzfdd937@localhost/fund_web_db")
    
    # JWT配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
    
    # CORS配置
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8000"]
    
    # 第三方API配置
    FUND_API_BASE_URL: str = os.getenv("FUND_API_BASE_URL", "https://fund.eastmoney.com")
    
    class Config:
        env_file = ".env"

settings = Settings()