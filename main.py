import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.database import SessionLocal, engine
from core.limiter import limiter
from core.http_client import init_http_session, close_http_session
from models import base as models
from core.config import settings
from core.scheduler import setup_scheduler, start_scheduler, shutdown_scheduler
from routers import auth, user, funds, watchlist, ranking, sector
from utils.fund_data_manager import init_fund_lib
from utils.fund_ranking import fund_ranking_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期
    启动顺序：建表 → 初始化基金库 → HTTP session → 调度器 → 排行榜预热
    关闭顺序：调度器 → HTTP session
    """
    # 1. 创建数据库表（已存在则跳过）
    models.Base.metadata.create_all(bind=engine)

    # 2. 初始化基金库（首次启动写入数据，已有则跳过）
    db = SessionLocal()
    try:
        init_fund_lib(db)
    finally:
        db.close()

    # 3. 初始化全局 HTTP session（复用 TCP 连接）
    await init_http_session()

    # 4. 配置并启动定时任务调度器
    setup_scheduler()
    start_scheduler()

    # 5. 排行榜数据预热：检查 Redis 是否已有数据，没有则同步一次
    #    直接 await 而非 create_task，确保应用就绪前数据已可用
    await _warmup_ranking()

    yield  # 应用正常运行阶段

    # 关闭：调度器 → HTTP session
    shutdown_scheduler()
    await close_http_session()


async def _warmup_ranking() -> None:
    """
    启动时预热排行榜数据。
    - Redis 中已有数据则跳过，避免每次重启都触发耗时的全量同步
    - Redis 不可用时静默跳过，不影响应用启动
    """
    try:
        status = fund_ranking_manager.get_cache_status()
        if not status.get("available"):
            logger.warning("排行榜预热跳过：Redis 不可用")
            return

        # 检查是否已有数据（任意一个维度有数据即视为已预热）
        counts = status.get("rankingCounts", {})
        if any(v > 0 for v in counts.values()):
            logger.info(f"排行榜数据已存在（{status.get('totalCount', 0)} 只基金），跳过预热")
            return

        logger.info("排行榜缓存为空，开始预热...")
        success = await fund_ranking_manager.sync_ranking_data()
        if success:
            logger.info("排行榜预热完成")
        else:
            logger.warning("排行榜预热失败（网络错误或数据源不可用）")
    except Exception as e:
        logger.error(f"排行榜预热异常: {e}")


# 创建 FastAPI 应用
app = FastAPI(
    title="基金管理平台 API",
    description="一个基于FastAPI的在线基金管理网站",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# 将 limiter 挂载到 app.state
app.state.limiter = limiter

# 注册限流超出时的统一错误处理（返回 429 Too Many Requests）
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 配置 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router,      prefix="/api")
app.include_router(user.router,      prefix="/api")
app.include_router(funds.router,     prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(ranking.router,   prefix="/api")
app.include_router(sector.router,    prefix="/api")

# 挂载静态文件目录（用户头像）
os.makedirs(settings.AVATAR_UPLOAD_DIR, exist_ok=True)
app.mount("/static/avatars", StaticFiles(directory=settings.AVATAR_UPLOAD_DIR), name="avatars")


@app.get("/")
async def root():
    return {"message": "欢迎使用基金查询网站API", "status": "运行正常"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8888)