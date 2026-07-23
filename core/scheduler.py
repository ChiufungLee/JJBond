"""
定时任务调度器
使用 APScheduler 实现定时同步排行榜数据
"""
import logging
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from utils.fund_ranking import fund_ranking_manager
from utils.hot_search_manager import hot_search_manager
from utils.fund_sector_sync import sync_fund_sectors
from utils.auto_invest_executor import execute_all_plans
from core.database import get_redis, SessionLocal

logger = logging.getLogger(__name__)
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")

# 全局调度器实例
scheduler = AsyncIOScheduler(timezone=SHANGHAI_TZ)


async def sync_ranking_job():
    """定时同步排行榜数据的任务"""
    logger.info("开始执行排行榜数据同步任务...")
    try:
        success = await fund_ranking_manager.sync_ranking_data()
        if success:
            logger.info("排行榜数据同步成功")
        else:
            logger.warning("排行榜数据同步失败")
    except Exception as e:
        logger.error(f"排行榜数据同步任务执行出错: {e}")


async def sync_hot_search_job():
    """定时同步热搜基金数据的任务"""
    logger.info("开始执行热搜基金数据同步任务...")
    try:
        data = await hot_search_manager.fetch_hot_funds()
        if data:
            await hot_search_manager._save_cache(get_redis(), data)
            logger.info(f"热搜基金数据同步成功，{len(data)} 只基金")
        else:
            logger.warning("热搜基金数据同步失败：未获取到数据")
    except Exception as e:
        logger.error(f"热搜基金数据同步任务执行出错: {e}")


async def sync_fund_sectors_job():
    """定时同步基金-板块关联数据"""
    logger.info("开始执行基金-板块关联同步任务...")
    db = SessionLocal()
    try:
        result = await sync_fund_sectors(db)
        if "error" in result:
            logger.warning(f"基金-板块同步部分失败: {result['error']}")
        else:
            logger.info(
                f"基金-板块同步完成: {result['sectors']} 个板块, "
                f"{result['mappings']} 条映射, 耗时 {result['elapsed']}s"
            )
    except Exception as e:
        logger.error(f"基金-板块同步任务执行出错: {e}")
    finally:
        db.close()


async def sync_auto_invest_job():
    """定时执行定投计划"""
    logger.info("开始执行定投计划...")
    try:
        result = await execute_all_plans()
        logger.info(f"定投计划执行完成: {result}")
    except Exception as e:
        logger.error(f"定投计划执行出错: {e}")


def setup_scheduler():
    """
    配置定时任务

    任务安排：
    - 每个工作日 5:30 早间补同步（兜底前一晚 API 延迟）
    - 每个工作日 21:05 同步（收盘后净值已基本公布）
    - 周六日不执行
    """
    # 每个工作日（周一到周五）10:17 执行定投（此时前一日净值已确认）
    scheduler.add_job(
        sync_auto_invest_job,
        trigger=CronTrigger(day_of_week="mon-fri", hour=10, minute=17, timezone=SHANGHAI_TZ),
        id="sync_auto_invest",
        name="执行定投计划",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 每个工作日（周一到周五）5:30 早间补同步，兜底前一晚 API 未及时刷新的情况
    scheduler.add_job(
        sync_ranking_job,
        trigger=CronTrigger(day_of_week="mon-fri", hour=5, minute=30, timezone=SHANGHAI_TZ),
        id="sync_ranking_morning",
        name="同步排行榜数据（早间补同步）",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 每个工作日（周一到周五）21:05 执行同步
    scheduler.add_job(
        sync_ranking_job,
        trigger=CronTrigger(day_of_week="mon-fri", hour=21, minute=5, timezone=SHANGHAI_TZ),
        id="sync_ranking_data",
        name="同步排行榜数据",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 每天 09:30 和 13:30 同步热搜基金数据
    scheduler.add_job(
        sync_hot_search_job,
        trigger=CronTrigger(hour=9, minute=30, timezone=SHANGHAI_TZ),
        id="sync_hot_search_morning",
        name="同步热搜基金数据（早）",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        sync_hot_search_job,
        trigger=CronTrigger(hour=13, minute=30, timezone=SHANGHAI_TZ),
        id="sync_hot_search_afternoon",
        name="同步热搜基金数据（午）",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 每周一凌晨 2:00 同步基金-板块关联数据
    scheduler.add_job(
        sync_fund_sectors_job,
        trigger=CronTrigger(day_of_week="mon", hour=2, minute=0, timezone=SHANGHAI_TZ),
        id="sync_fund_sectors",
        name="同步基金-板块关联数据",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    logger.info("定时任务调度器已配置: 周一至周五 5:30/21:05 同步排行榜数据, 每天 09:30/13:30 同步热搜基金数据, 每周一 02:00 同步基金板块")


def start_scheduler():
    """启动调度器"""
    if not scheduler.running:
        scheduler.start()
        logger.info("定时任务调度器已启动")


def shutdown_scheduler():
    """关闭调度器"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("定时任务调度器已关闭")
