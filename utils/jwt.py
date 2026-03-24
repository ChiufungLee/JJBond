from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from core.config import settings
from core.database import redis_client
import logging

logger = logging.getLogger(__name__)

# 黑名单 Redis Key 前缀，TTL 与 token 过期时间对齐，到期自动清除
_BLACKLIST_PREFIX = "token:blacklist:"


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def revoke_token(token: str) -> bool:
    """
    将 token 加入黑名单，直到其自然过期。
    返回 True 表示吊销成功，False 表示 Redis 不可用（降级：token 将在过期时间后自然失效）。
    """
    if redis_client is None:
        logger.warning("Redis 不可用，token 无法立即吊销，将在过期时间后自然失效")
        return False
    try:
        # 解码取出过期时间，计算距现在的剩余秒数作为 TTL
        payload = jwt.decode(
            token, settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},  # 允许解码已过期的 token（用于计算 TTL）
        )
        exp = payload.get("exp")
        if exp:
            remaining = int(exp - datetime.now(timezone.utc).timestamp())
            ttl = max(remaining, 1)  # 至少保留 1 秒，避免 TTL=0 导致立即删除
        else:
            ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        redis_client.setex(f"{_BLACKLIST_PREFIX}{token}", ttl, "1")
        logger.info("Token 已加入黑名单")
        return True
    except Exception as e:
        logger.error(f"Token 吊销失败: {e}")
        return False


def verify_token(token: str) -> dict | None:
    """
    验证令牌，返回整个 payload 或 None。
    验证步骤：黑名单检查 → 签名 & 过期校验 → 返回 payload。
    """
    # 1. 黑名单检查（Redis 不可用时跳过，降级为仅校验签名和过期时间）
    if redis_client is not None:
        try:
            if redis_client.exists(f"{_BLACKLIST_PREFIX}{token}"):
                logger.warning("Token 已被吊销")
                return None
        except Exception as e:
            logger.warning(f"黑名单检查失败，跳过: {e}")

    # 2. 签名 & 过期校验
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# 保持向后兼容的模块级常量（其他模块直接 import 这些值）
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
ALGORITHM = settings.ALGORITHM
SECRET_KEY = settings.SECRET_KEY