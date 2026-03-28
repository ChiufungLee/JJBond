"""
定时任务调度器
使用 APScheduler 实现定时同步排行榜数据
"""
import logging
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from utils.fund_ranking import fund_ranking_manager

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


def setup_scheduler():
    """
    配置定时任务

    任务安排：
    - 每个交易日 15:30 同步数据（收盘后30分钟）
    - 周六日不执行
    """
    # 每个工作日（周一到周五）15:30 执行同步
    scheduler.add_job(
        sync_ranking_job,
        trigger=CronTrigger(day_of_week="mon-fri", hour=15, minute=30, timezone=SHANGHAI_TZ),
        id="sync_ranking_data",
        name="同步排行榜数据",
        replace_existing=True,
        misfire_grace_time=3600,  # 错过执行时间1小时内仍然执行
    )

    logger.info("定时任务调度器已配置: 周一至周五 15:30 同步排行榜数据")


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
