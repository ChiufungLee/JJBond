from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import asyncio

from core.dependencies import get_current_user
from core.database import get_db
import schemas
from crud import user as user_crud
from utils.fund_calculator import calculator
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("/", response_model=List[schemas.WatchlistItem])
async def get_watchlist(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取用户的自选基金列表"""
    watchlist = user_crud.get_watchlist(db, current_user.id)
    holding_codes = user_crud.get_holding_fund_codes(db, current_user.id)

    if not watchlist:
        return []

    # 并发拉取所有基金行情，耗时从 N×延迟 降为 1×延迟
    fund_infos = await asyncio.gather(
        *[calculator.get_fund_info(item.fund_code) for item in watchlist]
    )

    result = []
    for item, fund_info in zip(watchlist, fund_infos):
        watchlist_item = schemas.WatchlistItem(
            id=item.id,
            fund_code=item.fund_code,
            fund_name=item.fund_name,
            cost_nav=item.cost_nav,
            added_at=item.added_at,
            is_holding=item.fund_code in holding_codes
        )

        if fund_info:
            if 'dwjz' in fund_info:
                current_nav = fund_info.get('gsz') or fund_info.get('dwjz') or 0
                gszzl = fund_info.get('gszzl')
            else:
                current_nav = fund_info.get('value', 0)
                gszzl = None

            current_nav = float(current_nav)
            watchlist_item.current_nav = current_nav
            watchlist_item.change_rate = f"{gszzl}%" if gszzl is not None else "--"

            if item.cost_nav and item.cost_nav > 0:
                total_change = ((current_nav - item.cost_nav) / item.cost_nav) * 100
                watchlist_item.total_change_rate = round(total_change, 2)

        result.append(watchlist_item)

    return result


@router.post("/", response_model=schemas.WatchlistItem)
async def add_to_watchlist(
    watchlist_data: schemas.WatchlistCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """添加基金到自选"""
    existing = user_crud.get_watchlist_by_code(db, current_user.id, watchlist_data.fund_code)
    if existing:
        raise HTTPException(status_code=400, detail="该基金已在自选中")

    fund_info = await calculator.get_fund_info(watchlist_data.fund_code)

    if not fund_info:
        raise HTTPException(status_code=404, detail="无法获取基金信息，请检查基金代码")

    if 'dwjz' in fund_info:
        cost_nav = float(fund_info.get('dwjz', 0))
    else:
        cost_nav = float(fund_info.get('value', 0))

    holding_codes = user_crud.get_holding_fund_codes(db, current_user.id)

    db_watchlist = user_crud.add_to_watchlist(
        db=db,
        user_id=current_user.id,
        fund_code=watchlist_data.fund_code,
        fund_name=watchlist_data.fund_name,
        cost_nav=cost_nav
    )
    if db_watchlist is None:
        raise HTTPException(status_code=400, detail="该基金已在自选中")

    return schemas.WatchlistItem(
        id=db_watchlist.id,
        fund_code=db_watchlist.fund_code,
        fund_name=db_watchlist.fund_name,
        cost_nav=db_watchlist.cost_nav,
        added_at=db_watchlist.added_at,
        is_holding=db_watchlist.fund_code in holding_codes,
        current_nav=cost_nav,
        change_rate="--",
        total_change_rate=0.0
    )


@router.delete("/{watchlist_id}")
def remove_from_watchlist(
    watchlist_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """从自选中移除基金"""
    success = user_crud.remove_from_watchlist(db, current_user.id, watchlist_id)
    if not success:
        raise HTTPException(status_code=404, detail="自选基金不存在")
    return {"message": "已从自选中移除"}