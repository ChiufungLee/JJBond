#!/usr/bin/env python3
"""手动同步排行榜数据脚本"""
import asyncio
import logging
import sys

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

async def main():
    # 先初始化 Redis 连接
    from core.database import init_redis, get_redis, close_redis
    from utils.fund_ranking import fund_ranking_manager

    print("正在连接 Redis...")
    await init_redis()

    redis = get_redis()
    if redis is None:
        print("错误: Redis 连接失败，请检查 Redis 服务是否运行")
        print("检查环境变量: REDIS_HOST, REDIS_PORT, REDIS_DB")
        return

    print("Redis 连接成功，开始同步排行榜数据...")

    try:
        result = await fund_ranking_manager.sync_ranking_data()
        if result:
            print("排行榜数据同步成功!")

            # 显示同步结果
            meta = await redis.hgetall("ranking:meta")
            print(f"最后更新时间: {meta.get('lastUpdate', '未知')}")
            print(f"基金总数: {meta.get('totalCount', '未知')}")

            # 验证 TTL
            ttl = await redis.ttl("ranking:day")
            print(f"排行榜 TTL: {ttl} 秒 ({ttl/3600:.1f} 小时)")
        else:
            print("排行榜数据同步失败")
    except Exception as e:
        print(f"同步过程出错: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_redis()

if __name__ == "__main__":
    asyncio.run(main())
