from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings
import redis
import redis.asyncio as aioredis
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
)

# ---- Redis 配置 ----

# 同步 Redis 客户端：仅供 core/limiter.py 读取连接参数。
# 构造后立即 ping() 验证连通性，不可用时设为 None，limiter 降级为内存存储。
_redis_host = os.getenv("REDIS_HOST", "localhost")
_redis_port = int(os.getenv("REDIS_PORT", 6379))
_redis_db = int(os.getenv("REDIS_DB", 0))

try:
    redis_client = redis.Redis(
        host=_redis_host,
        port=_redis_port,
        db=_redis_db,
        decode_responses=True,
        socket_connect_timeout=5,
    )
    redis_client.ping()
except Exception:
    redis_client = None

# 异步 Redis 单例，lifespan 启动时赋值
_async_redis: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    """应用启动时调用，创建全局 async Redis 客户端。"""
    global _async_redis
    try:
        _async_redis = aioredis.Redis(
            host=_redis_host,
            port=_redis_port,
            db=_redis_db,
            decode_responses=True,
            socket_connect_timeout=20,
        )
        await _async_redis.ping()
        logger.info("Async Redis 连接成功")
    except Exception as e:
        _async_redis = None
        logger.warning(f"Async Redis 连接失败，缓存功能将被禁用: {e}")


async def close_redis() -> None:
    """应用关闭时调用，优雅关闭 async Redis 客户端。"""
    global _async_redis
    if _async_redis:
        await _async_redis.aclose()
        _async_redis = None
        logger.info("Async Redis 已关闭")


def get_redis() -> Optional[aioredis.Redis]:
    """获取全局 async Redis 客户端，未初始化或不可用时返回 None。"""
    return _async_redis


# 创建数据库会话
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()