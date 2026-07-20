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
from core.database import init_redis, close_redis
from core.limiter import limiter
from core.http_client import init_http_session, close_http_session
from models import base as models
from core.config import settings
from core.scheduler import setup_scheduler, start_scheduler, shutdown_scheduler
from routers import auth, user, funds, watchlist, ranking, sector, market, hot_search, feedback, announcement, auto_invest
from utils.fund_data_manager import init_fund_lib
from utils.fund_ranking import fund_ranking_manager
from utils.fund_sector_sync import sync_fund_sectors
from models.fund import FundSector

logger = logging.getLogger(__name__)

# 数据库相关启动步骤的超时时间（秒）
_STARTUP_DB_TIMEOUT = 15


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期
    启动顺序：建表 → 初始化基金库 → HTTP session → 调度器 → 排行榜预热
    关闭顺序：调度器 → HTTP session

    数据库不可用时，步骤 1/3/7 会超时跳过，服务降级启动。
    """
    # 1. 创建数据库表（已存在则跳过，超时则降级跳过）
    logger.info("[startup] 1/7 创建数据库表...")
    try:
        await asyncio.wait_for(
            asyncio.to_thread(models.Base.metadata.create_all, bind=engine),
            timeout=_STARTUP_DB_TIMEOUT,
        )
        logger.info("[startup] 1/7 数据库表完成")
    except Exception as e:
        logger.warning(f"[startup] 1/7 建表失败（跳过，降级启动）: {e}")

    # 2. 初始化 async Redis
    logger.info("[startup] 2/7 初始化 Redis...")
    await init_redis()
    logger.info("[startup] 2/7 Redis 完成")

    # 3. 初始化基金库（首次启动写入数据，已有则跳过，超时则降级跳过）
    logger.info("[startup] 3/7 初始化基金库...")
    db = SessionLocal()
    try:
        await asyncio.wait_for(init_fund_lib(db), timeout=_STARTUP_DB_TIMEOUT)
        logger.info("[startup] 3/7 基金库完成")
    except Exception as e:
        logger.warning(f"[startup] 3/7 基金库初始化失败（跳过）: {e}")
    finally:
        db.close()

    # 4. 初始化全局 HTTP session（复用 TCP 连接）
    logger.info("[startup] 4/7 初始化 HTTP session...")
    await init_http_session()
    logger.info("[startup] 4/7 HTTP session 完成")

    # 5. 配置并启动定时任务调度器
    logger.info("[startup] 5/7 启动调度器...")
    setup_scheduler()
    start_scheduler()
    logger.info("[startup] 5/7 调度器完成")

    # 6. 排行榜数据预热：检查 Redis 是否已有数据，没有则同步一次
    logger.info("[startup] 6/7 排行榜预热...")
    await _warmup_ranking()
    logger.info("[startup] 6/7 排行榜预热完成")

    # 7. 基金-板块关联：表为空时后台触发首次同步（同步 DB 查询，加超时保护）
    logger.info("[startup] 7/7 板块同步检查...")
    try:
        db_sector = SessionLocal()

        def _check_sector_count():
            try:
                return db_sector.query(FundSector).count()
            finally:
                db_sector.close()

        count = await asyncio.wait_for(
            asyncio.to_thread(_check_sector_count),
            timeout=_STARTUP_DB_TIMEOUT,
        )
        if count == 0:
            logger.info("fund_sectors 表为空，后台触发首次板块同步...")
            asyncio.create_task(_first_sector_sync())
    except Exception as e:
        logger.warning(f"[startup] 7/7 板块同步检查失败（跳过）: {e}")
    logger.info("[startup] 启动完成")

    yield  # 应用正常运行阶段

    # 关闭：调度器 → HTTP session → Redis
    shutdown_scheduler()
    await close_http_session()
    await close_redis()


def _is_ranking_stale(last_update_str: str) -> bool:
    """判断排行榜数据是否过期（超过 24 小时未更新）"""
    if not last_update_str:
        return True
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        last_update = datetime.strptime(last_update_str, "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=ZoneInfo("Asia/Shanghai")
        )
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        return (now - last_update).total_seconds() > 24 * 3600
    except Exception:
        return True


async def _warmup_ranking() -> None:
    """
    启动时预热排行榜数据。
    - 数据不存在或超过 24 小时未更新时触发全量同步
    - Redis 不可用时静默跳过，不影响应用启动
    """
    try:
        status = await fund_ranking_manager.get_cache_status()
        if not status.get("available"):
            logger.warning("排行榜预热跳过：Redis 不可用")
            return

        counts = status.get("rankingCounts", {})
        has_data = any(v > 0 for v in counts.values())
        last_update = status.get("lastUpdate", "")
        is_stale = _is_ranking_stale(last_update)

        if has_data and not is_stale:
            logger.info(f"排行榜数据最新（{last_update}，{status.get('totalCount', 0)} 只基金），跳过预热")
            return

        reason = "缓存为空" if not has_data else f"数据过期（上次更新: {last_update}）"
        logger.info(f"排行榜{reason}，开始预热...")
        success = await fund_ranking_manager.sync_ranking_data()
        if success:
            logger.info("排行榜预热完成")
        else:
            logger.warning("排行榜预热失败（网络错误或数据源不可用）")
    except Exception as e:
        logger.error(f"排行榜预热异常: {e}")


async def _first_sector_sync() -> None:
    """首次启动时后台同步基金-板块关联数据"""
    db = SessionLocal()
    try:
        result = await sync_fund_sectors(db)
        if "error" in result:
            logger.warning(f"首次板块同步部分失败: {result['error']}")
        else:
            logger.info(
                f"首次板块同步完成: {result['sectors']} 个板块, "
                f"{result['mappings']} 条映射, 耗时 {result['elapsed']}s"
            )
    except Exception as e:
        logger.error(f"首次板块同步异常: {e}")
    finally:
        db.close()


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
app.include_router(market.router,    prefix="/api")
app.include_router(hot_search.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
app.include_router(announcement.router, prefix="/api")
app.include_router(auto_invest.router,   prefix="/api")

# 挂载静态文件目录（用户头像）
os.makedirs(settings.AVATAR_UPLOAD_DIR, exist_ok=True)
app.mount("/static/avatars", StaticFiles(directory=settings.AVATAR_UPLOAD_DIR), name="avatars")

# 挂载前端静态文件
app.mount("/frontweb", StaticFiles(directory="frontweb", html=True), name="frontweb")


@app.get("/")
async def root():
    return {"message": "欢迎使用基金查询网站API", "status": "运行正常"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8888)