"""
共享工具函数
"""
from typing import Optional, Any


def safe_float(value: Any) -> Optional[float]:
    """安全转换为浮点数，失败返回 None"""
    try:
        if value is None or value == '':
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
