import logging
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.database import get_db
from core.dependencies import get_current_user
from crud import user as user_crud
from utils.fund_calculator import calculator
from utils.auto_invest_executor import execute_single_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auto-invest", tags=["auto-invest"])


@router.get("/plans", response_model=List[schemas.AutoInvestPlanOut])
def list_plans(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """获取用户所有定投计划"""
    return user_crud.get_auto_invest_plans(db, current_user.id)


@router.post("/plans", response_model=schemas.AutoInvestPlanOut)
def create_plan(
    plan: schemas.AutoInvestPlanCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """创建定投计划（需已持有该基金）"""
    holding = user_crud.get_user_fund_by_code(db, current_user.id, plan.fund_code)
    if not holding:
        raise HTTPException(status_code=400, detail="请先将该基金添加到持仓")

    result = user_crud.create_auto_invest_plan(
        db=db,
        user_id=current_user.id,
        fund_code=plan.fund_code,
        fund_name=holding.fund_name or plan.fund_code,
        amount=plan.amount,
    )
    if result is None:
        raise HTTPException(status_code=400, detail="该基金已有定投计划")
    return result


@router.put("/plans/{plan_id}", response_model=schemas.AutoInvestPlanOut)
def update_plan(
    plan_id: int,
    plan_update: schemas.AutoInvestPlanUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """更新定投计划（修改金额或状态）"""
    result = user_crud.update_auto_invest_plan(
        db=db,
        plan_id=plan_id,
        user_id=current_user.id,
        amount=plan_update.amount,
        status=plan_update.status,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="定投计划不存在")
    return result


@router.delete("/plans/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """删除定投计划"""
    success = user_crud.delete_auto_invest_plan(db, plan_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="定投计划不存在")
    return {"message": "定投计划已删除"}


@router.get("/plans/{plan_id}/records", response_model=List[schemas.AutoInvestRecordOut])
def list_records(
    plan_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """获取定投执行记录"""
    plan = user_crud.get_auto_invest_plan(db, plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="定投计划不存在")
    records = user_crud.get_auto_invest_records(db, plan_id, current_user.id, limit, offset)
    for r in records:
        r.execute_date = r.execute_date.isoformat() if r.execute_date else None
    return records


@router.post("/plans/{plan_id}/execute")
async def execute_plan_now(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """手动执行一次定投"""
    plan = user_crud.get_auto_invest_plan(db, plan_id, current_user.id)
    if not plan:
        raise HTTPException(status_code=404, detail="定投计划不存在")
    if plan.status != 'active':
        raise HTTPException(status_code=400, detail="定投计划非活跃状态")

    today = date.today()
    result = await execute_single_plan(db, plan, calculator, today)
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    return {"message": "执行成功", "shares": result["shares"], "nav": result["nav"]}
