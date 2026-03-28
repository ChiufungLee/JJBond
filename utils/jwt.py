from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from jose import JWTError, jwt
from core.config import settings
from core.database import redis_client
import logging

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

logger = logging.getLogger(__name__)

# 黑名单 Redis Key 前缀，TTL 与 token 过期时间对齐，到期自动清除
_BLACKLIST_PREFIX = "token:blacklist:"


def _create_token(data: dict, token_type: str, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.now(SHANGHAI_TZ) + expires_delta
    to_encode.update({"exp": expire, "type": token_type})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """创建访问令牌"""
    return _create_token(
        data=data,
        token_type=ACCESS_TOKEN_TYPE,
        expires_delta=expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(data: dict, expires_delta: timedelta = None) -> str:
    """创建刷新令牌"""
    return _create_token(
        data=data,
        token_type=REFRESH_TOKEN_TYPE,
        expires_delta=expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def revoke_token(token: str) -> bool:
    """
    将 token 加入黑名单，直到其自然过期。
    返回 True 表示吊销成功，False 表示 Redis 不可用（降级：token 将在过期时间后自然失效）。
    """
    if redis_client is None:
        logger.warning("Redis 不可用，token 无法立即吊销，将在过期时间后自然失效")
        return False
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},
        )
        exp = payload.get("exp")
        if exp:
            remaining = int(exp - datetime.now(SHANGHAI_TZ).timestamp())
            ttl = max(remaining, 1)
        else:
            ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        redis_client.setex(f"{_BLACKLIST_PREFIX}{token}", ttl, "1")
        logger.info("Token 已加入黑名单")
        return True
    except Exception as e:
        logger.error(f"Token 吊销失败: {e}")
        return False


def verify_token(token: str, token_type: str | None = ACCESS_TOKEN_TYPE) -> dict | None:
    """
    验证令牌，返回整个 payload 或 None。
    验证步骤：黑名单检查 → 签名 & 过期校验 → token 类型校验 → 返回 payload。
    """
    if redis_client is not None:
        try:
            if redis_client.exists(f"{_BLACKLIST_PREFIX}{token}"):
                logger.warning("Token 已被吊销")
                return None
        except Exception as e:
            logger.warning(f"黑名单检查失败，跳过: {e}")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        payload_type = payload.get("type", ACCESS_TOKEN_TYPE)
        if token_type is not None and payload_type != token_type:
            return None
        return payload
    except JWTError:
        return None


# 保持向后兼容的模块级常量（其他模块直接 import 这些值）
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS
ALGORITHM = settings.ALGORITHM
SECRET_KEY = settings.SECRET_KEY
