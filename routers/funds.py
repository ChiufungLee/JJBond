import logging
import aiohttp
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.database import get_db
from core.dependencies import get_current_user
from crud import user as user_crud
from utils.fund_calculator import FundCalculator
from utils.fund_data_manager import search_funds, upsert_fund

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/funds", tags=["funds"])


@router.post("/", response_model=schemas.Fund)
def create_fund(
    fund: schemas.FundCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    result = user_crud.create_user_fund(db=db, fund=fund, user_id=current_user.id)
    if result is None:
        raise HTTPException(status_code=400, detail="该基金已在您的持仓中")
    return result


@router.get("/", response_model=List[schemas.Fund])
def get_funds(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return user_crud.get_user_funds(db=db, user_id=current_user.id)


@router.get("/fund_info/{fund_code}")
async def get_fund_info(
    fund_code: str,
    current_user: schemas.User = Depends(get_current_user)
):
    calculator = FundCalculator()
    return await calculator.get_fund_info(fund_code)


@router.get("/calculate", response_model=schemas.PortfolioSummary)
async def calculate_portfolio(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    funds = user_crud.get_user_funds(db=db, user_id=current_user.id)
    funds_data = [
        {
            'fund_code': fund.fund_code,
            'fund_name': fund.fund_name or fund.fund_code,  # 降级时用代码代替名称
            'cost_price': fund.cost_price,
            'shares': fund.shares,
        }
        for fund in funds
    ]
    calculator = FundCalculator()
    return await calculator.calculate_portfolio(funds_data)


@router.get("/search", response_model=List[dict])
async def search_fund(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
    use_api: bool = Query(False, description="是否使用第三方API")
):
    """搜索基金：优先查本地数据库，不足时调用第三方 API 补充"""
    try:
        if use_api:
            funds = await _search_funds_from_api(q, limit)
            for fund in funds:
                upsert_fund(db, fund["fund_code"], fund["fund_name"], fund.get("fund_type", "其他"))
        else:
            funds = search_funds(db, q, limit)
            if len(funds) < 5 and q:
                try:
                    api_funds = await _search_funds_from_api(q, limit)
                    if api_funds:
                        funds = api_funds[:limit]
                except Exception:
                    pass  # API 失败时保留本地结果

        logger.info(f"搜索成功，返回 {len(funds)} 个结果")
        return funds
    except Exception as e:
        logger.error(f"搜索失败: {str(e)}", exc_info=True)
        return search_funds(db, q, limit)


async def _search_funds_from_api(keyword: str, limit: int = 10) -> List[dict]:
    """从天天基金网搜索基金（第三方 API）"""
    url = f"http://fundgz.1234567.com.cn/js/{keyword}.js"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                data = await resp.json()
                funds = []
                if data.get("Datas"):
                    for item in data["Datas"]:
                        funds.append({
                            "fund_code": item.get("CODE", ""),
                            "fund_name": item.get("NAME", ""),
                            "fund_type": item.get("FTYPE", ""),
                        })
                return funds[:limit]
    except Exception as e:
        logger.error(f"第三方 API 搜索失败: {e}")
        return []


@router.put("/{fund_id}", response_model=schemas.Fund)
def update_fund(
    fund_id: int,
    fund_update: schemas.FundCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    fund = user_crud.update_user_fund(db=db, fund_id=fund_id, fund_update=fund_update, user_id=current_user.id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


@router.delete("/{fund_id}")
def delete_fund(
    fund_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    success = user_crud.delete_user_fund(db=db, fund_id=fund_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Fund not found")
    return {"message": "Fund deleted successfully"}