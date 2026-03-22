from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings
import redis
import logging
import os

logger = logging.getLogger(__name__)

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
)

# Redis 配置：连接失败时降级为 None，不阻断服务启动
try:
    redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        db=int(os.getenv("REDIS_DB", 0)),
        decode_responses=True,
        socket_connect_timeout=20,  # 连接超时2秒，快速失败
    )
    redis_client.ping()  # 主动探测连接是否可用
    logger.info("Redis 连接成功")
except Exception as e:
    logger.warning(f"Redis 连接失败，缓存功能将被禁用: {e}")
    redis_client = None

# 创建数据库会话
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()