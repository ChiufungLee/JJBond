"""
定投执行器：定时批量执行所有活跃的定投计划。
"""
import logging
from datetime import date
from typing import Dict, Optional

from sqlalchemy.orm import Session

from core.database import SessionLocal
from models.auto_invest import AutoInvestPlan, AutoInvestRecord
from crud.user import add_shares_from_auto_invest

logger = logging.getLogger(__name__)


async def execute_all_plans() -> Dict:
    """
    批量执行所有活跃的定投计划。
    每个计划独立事务，单个失败不影响其他。
    返回 {"total": int, "success": int, "failed": int}
    """
    db = SessionLocal()
    try:
        plans = db.query(AutoInvestPlan).filter(
            AutoInvestPlan.status == 'active'
        ).all()

        if not plans:
            logger.info("定投执行：无活跃计划")
            return {"total": 0, "success": 0, "failed": 0}

        from utils.fund_calculator import calculator

        today = date.today()
        success = 0
        failed = 0

        for plan in plans:
            try:
                result = await execute_single_plan(db, plan, calculator, today)
                if result.get("error"):
                    failed += 1
                    logger.warning(f"定投执行失败 plan_id={plan.id} fund={plan.fund_code}: {result['error']}")
                else:
                    success += 1
                    logger.info(f"定投执行成功 plan_id={plan.id} fund={plan.fund_code} shares={result['shares']}")
            except Exception as e:
                failed += 1
                logger.error(f"定投执行异常 plan_id={plan.id} fund={plan.fund_code}: {e}")

        logger.info(f"定投批量执行完成: total={len(plans)} success={success} failed={failed}")
        return {"total": len(plans), "success": success, "failed": failed}
    finally:
        db.close()


async def execute_single_plan(
    db: Session, plan: AutoInvestPlan, calculator, execute_date: date,
) -> Dict:
    """
    执行单个定投计划（在调用方事务中）。
    1. 获取当日净值
    2. 计算份额
    3. 更新持仓 + 写交易记录
    4. 写执行记录
    """
    # 获取净值
    fund_info = await calculator.get_fund_info(plan.fund_code)
    if not fund_info:
        record = AutoInvestRecord(
            plan_id=plan.id,
            user_id=plan.user_id,
            fund_code=plan.fund_code,
            execute_date=execute_date,
            amount=plan.amount,
            status='failed',
            error_msg='无法获取基金净值',
        )
        db.add(record)
        db.commit()
        return {"error": "无法获取基金净值"}

    nav_raw = fund_info.get('dwjz')
    if nav_raw is None:
        record = AutoInvestRecord(
            plan_id=plan.id,
            user_id=plan.user_id,
            fund_code=plan.fund_code,
            execute_date=execute_date,
            amount=plan.amount,
            status='failed',
            error_msg='净值数据为空',
        )
        db.add(record)
        db.commit()
        return {"error": "净值数据为空"}

    try:
        nav = float(nav_raw)
    except (ValueError, TypeError):
        record = AutoInvestRecord(
            plan_id=plan.id,
            user_id=plan.user_id,
            fund_code=plan.fund_code,
            execute_date=execute_date,
            amount=plan.amount,
            status='failed',
            error_msg=f'净值格式错误: {nav_raw}',
        )
        db.add(record)
        db.commit()
        return {"error": f"净值格式错误: {nav_raw}"}

    if nav <= 0:
        record = AutoInvestRecord(
            plan_id=plan.id,
            user_id=plan.user_id,
            fund_code=plan.fund_code,
            execute_date=execute_date,
            amount=plan.amount,
            status='failed',
            error_msg=f'净值异常: {nav}',
        )
        db.add(record)
        db.commit()
        return {"error": f"净值异常: {nav}"}

    # 更新持仓
    result = add_shares_from_auto_invest(
        db=db,
        user_id=plan.user_id,
        fund_code=plan.fund_code,
        fund_name=plan.fund_name,
        amount=plan.amount,
        nav=nav,
    )
    if result is None:
        record = AutoInvestRecord(
            plan_id=plan.id,
            user_id=plan.user_id,
            fund_code=plan.fund_code,
            execute_date=execute_date,
            amount=plan.amount,
            nav=nav,
            shares=0,
            status='failed',
            error_msg='用户未持有该基金',
        )
        db.add(record)
        db.commit()
        return {"error": "用户未持有该基金"}

    new_shares = result["shares"]

    # 写成功记录
    record = AutoInvestRecord(
        plan_id=plan.id,
        user_id=plan.user_id,
        fund_code=plan.fund_code,
        execute_date=execute_date,
        amount=plan.amount,
        nav=nav,
        shares=new_shares,
        status='success',
    )
    db.add(record)
    db.commit()

    return {"shares": new_shares, "nav": nav}
