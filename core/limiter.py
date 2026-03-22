# core/limiter.py
#
# 限流器单例模块，供 main.py 和各路由共同 import，避免循环依赖。
# Redis 可用时使用分布式 Redis 存储；Redis 不可用时自动降级为进程内内存存储。

import logging
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)


def build_limiter() -> Limiter:
    """
    构建 Limiter 实例。
    延迟 import core.database 以避免模块加载顺序问题。
    """
    try:
        from core.database import redis_client
        if redis_client is not None:
            conn = redis_client.connection_pool.connection_kwargs
            host = conn.get("host", "localhost")
            port = conn.get("port", 6379)
            db   = conn.get("db", 0)
            storage_uri = f"redis://{host}:{port}/{db}"
            logger.info(f"限流器使用 Redis 存储: {storage_uri}")
            return Limiter(key_func=get_remote_address, storage_uri=storage_uri)
    except Exception as e:
        logger.warning(f"限流器初始化 Redis 存储失败，降级为内存存储: {e}")

    logger.warning("限流器使用进程内内存存储（多进程部署时各进程独立计数）")
    return Limiter(key_func=get_remote_address)


# 模块级单例，所有路由共享同一个 limiter 实例
limiter = build_limiter()