# core/http_client.py
#
# 全局 aiohttp.ClientSession 单例。
# 由 main.py 的 lifespan 负责初始化（startup）和关闭（shutdown），
# 其他模块通过 get_http_session() 获取，不得自行创建 ClientSession。

import aiohttp
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 模块级单例，lifespan 启动时赋值，关闭时置 None
_session: Optional[aiohttp.ClientSession] = None


async def init_http_session() -> None:
    """应用启动时调用，创建全局 ClientSession。"""
    global _session
    connector = aiohttp.TCPConnector(
        limit=100,            # 全局最大并发连接数
        limit_per_host=20,    # 每个域名最大并发连接数
        ttl_dns_cache=300,    # DNS 缓存 5 分钟，减少 DNS 解析开销
        enable_cleanup_closed=True,
    )
    _session = aiohttp.ClientSession(
        connector=connector,
        timeout=aiohttp.ClientTimeout(total=15),  # 默认超时，各调用处可覆盖
    )
    logger.info("全局 HTTP session 已初始化")


async def close_http_session() -> None:
    """应用关闭时调用，优雅关闭全局 ClientSession。"""
    global _session
    if _session and not _session.closed:
        await _session.close()
        _session = None
        logger.info("全局 HTTP session 已关闭")


def get_http_session() -> aiohttp.ClientSession:
    """
    获取全局 ClientSession。
    若 session 未初始化，直接报错，避免创建无人关闭的临时 session。
    """
    if _session is None:
        message = (
            "全局 HTTP session 未初始化。请确认应用通过 main.py/FastAPI lifespan 启动，"
            "并已先调用 init_http_session()。"
        )
        logger.error(message)
        raise RuntimeError(message)

    if _session.closed:
        message = "全局 HTTP session 已关闭。请检查应用生命周期是否已进入 shutdown。"
        logger.error(message)
        raise RuntimeError(message)

    return _session