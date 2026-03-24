# core/config.py

from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Settings(BaseSettings):
    # 数据库配置（必填，不提供默认值，强制从 .env 读取）
    DATABASE_URL: str

    # JWT配置（SECRET_KEY 必填，其余保留安全的默认值）
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS配置
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8000"]

    # 第三方API配置
    FUND_API_BASE_URL: str = "https://fund.eastmoney.com"

    # 微信小程序配置
    WECHAT_APPID: str = ""  # 微信小程序 AppID
    WECHAT_SECRET: str = ""  # 微信小程序 AppSecret

    class Config:
        env_file = ".env"

settings = Settings()