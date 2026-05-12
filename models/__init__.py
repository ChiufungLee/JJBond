# models/__init__.py
# 统一导出所有 ORM 模型，确保 Base.metadata 能感知所有表。
# main.py 中 `from models import base as models` 后调用
# `models.Base.metadata.create_all(bind=engine)` 时会自动建所有表。

from .base import Base
from .user import User
from .fund import UserFund, FundLib, FundSector
from .watchlist import WatchlistFund, FundTransaction
from .feedback import FeedbackSuggestion