import logging
import aiohttp
from core.http_client import get_http_session
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.database import get_db
from core.dependencies import get_current_user
from crud import user as user_crud
from utils.fund_calculator import calculator
from utils.fund_data_manager import search_funds, upsert_fund
from utils.fund_ranking import fund_ranking_manager

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
    return await calculator.get_fund_info(fund_code)


@router.get("/fund_nav_history/{fund_code}")
async def get_fund_nav_history(
    fund_code: str,
    days: int = Query(default=30, ge=1, le=365, description="获取天数"),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取基金历史净值数据"""
    return await calculator.get_fund_nav_history_simple(fund_code, days)


@router.get("/fund_returns/{fund_code}")
async def get_fund_returns(
    fund_code: str,
    current_user: schemas.User = Depends(get_current_user)
):
    """
    获取基金各阶段涨跌幅
    优先从排行榜缓存获取，缓存未命中时调用 API
    返回：近一周、近一月、近三月、近六月、近1年、近2年、近3年、近5年、今年来、成立来
    """
    # 优先从排行榜缓存获取
    ranking_info = fund_ranking_manager.get_fund_ranking_info(fund_code)
    # 检查 returns 列表是否非空（空列表 [] 也是 truthy，需要检查长度）
    if ranking_info and ranking_info.get("returns") and len(ranking_info["returns"]) > 0:
        # 缓存命中，直接返回
        return {
            "fund_code": fund_code,
            "periods": ranking_info["returns"]
        }
    # 缓存未命中，调用 API 获取
    return await calculator.get_fund_period_returns(fund_code)


@router.get("/calculate", response_model=schemas.PortfolioSummary)
async def calculate_portfolio(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    funds = user_crud.get_user_funds(db=db, user_id=current_user.id)
    funds_data = [
        {
            'fund_code': fund.fund_code,
            'fund_name': fund.fund_name or fund.fund_code,
            'cost_price': fund.cost_price,
            'shares': fund.shares,
        }
        for fund in funds
    ]
    return await calculator.calculate_portfolio(funds_data)


@router.get("/calculate-simple", response_model=schemas.PortfolioSummary)
async def calculate_portfolio_simple(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """轻量级计算接口，仅获取行情数据，不获取历史净值，加载更快"""
    funds = user_crud.get_user_funds(db=db, user_id=current_user.id)
    funds_data = [
        {
            'id': fund.id,
            'fund_code': fund.fund_code,
            'fund_name': fund.fund_name or fund.fund_code,
            'cost_price': fund.cost_price,
            'shares': fund.shares,
        }
        for fund in funds
    ]
    return await calculator.calculate_portfolio_simple(funds_data)


@router.get("/revenue-calendar", response_model=schemas.RevenueCalendar)
async def get_revenue_calendar(
    year: int = Query(..., description="年份"),
    month: int = Query(..., ge=1, le=12, description="月份(1-12)"),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """
    获取收益日历数据
    返回指定月份每天的收益情况
    """
    # 获取用户所有交易记录
    transactions = user_crud.get_user_transactions(db=db, user_id=current_user.id)

    return await calculator.calculate_revenue_calendar(transactions, year, month)


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
                    pass

        logger.info(f"搜索成功，返回 {len(funds)} 个结果")
        return funds
    except Exception as e:
        logger.error(f"搜索失败: {str(e)}", exc_info=True)
        return search_funds(db, q, limit)


async def _search_funds_from_api(keyword: str, limit: int = 10) -> List[dict]:
    """从天天基金网搜索基金（第三方 API）"""
    url = f"http://fundgz.1234567.com.cn/js/{keyword}.js"
    try:
        session = get_http_session()
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
    fund_update: schemas.FundUpdate,
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