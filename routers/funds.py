from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from core.dependencies import get_current_user
import schemas
# from schemas import user as user_schemas
from crud import user as user_crud
from routers import auth
from core.database import get_db
from utils.fund_calculator import FundCalculator
from datetime import datetime
import aiohttp
from utils.fund_data_manager import fund_data_manager


router = APIRouter(prefix="/funds", tags=["funds"])

@router.post("/", response_model=schemas.Fund)
def create_fund(
    fund: schemas.FundCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return user_crud.create_user_fund(db=db, fund=fund, user_id=current_user.id)

@router.get("/", response_model=List[schemas.Fund])
def get_funds(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return user_crud.get_user_funds(db=db, user_id=current_user.id)

@router.get("/fund_info/{fund_code}")
def get_fund_info(fund_code: str):
    calculator = FundCalculator()
    return calculator.get_fund_info(fund_code)


@router.get("/calculate", response_model=schemas.PortfolioSummary)
def calculate_portfolio(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    funds = user_crud.get_user_funds(db=db, user_id=current_user.id)
    if not funds:
        raise HTTPException(status_code=404, detail="No funds found")
    
    funds_data = [
        {
            'fund_code': fund.fund_code,
            'cost_price': fund.cost_price,
            'shares': fund.shares
        }
        for fund in funds
    ]
    
    calculator = FundCalculator()
    summary = calculator.calculate_portfolio(funds_data)
    return summary


@router.get("/search", response_model=List[dict])
async def search_fund(
    q: str,
    limit: int = 10,
    current_user: schemas.User = Depends(get_current_user),
    use_api: bool = Query(False, description="是否使用第三方API")
):
    """
    搜索基金
    """
    # try:
    #     # 调用第三方基金搜索接口
    #     funds = await search_funds_from_api(q, limit)
    #     return funds
    # except Exception as e:
    #     raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")
    try:
        if use_api:
            # 使用第三方API
            funds = await search_funds_from_api(q, limit)
            # 将API返回的数据保存到本地
            for fund in funds:
                fund_data_manager.add_fund(
                    fund["fund_code"],
                    fund["fund_name"],
                    fund.get("fund_type", "其他")
                )
        else:
            # 使用本地数据
            funds = fund_data_manager.search(q, limit)
            
            # 如果本地数据不足，自动调用API补充
            if len(funds) < 5 and q:
                try:
                    api_funds = await search_funds_from_api(q, limit)
                    funds = api_funds[:limit]  # 使用API结果
                except:
                    pass
        
        logger.info(f"搜索成功，返回 {len(funds)} 个结果")
        return funds
    except Exception as e:
        # logger.error(f"搜索失败: {str(e)}", exc_info=True)
        print(f"搜索失败: {str(e)}")
        # 返回本地数据作为兜底
        return fund_data_manager.search(q, limit)


async def search_funds_from_api(keyword: str, limit: int = 10) -> List[dict]:
    """
    从第三方API搜索基金
    这里以天天基金网为例，实际请替换为您的第三方接口
    """
    async with aiohttp.ClientSession() as session:
        try:
            # 示例：调用天天基金搜索接口
            url = f"http://fundgz.1234567.com.cn/js/{keyword}.js"
            async with session.get(url, timeout=10) as response:
                data = await response.json()
                
                # 解析返回数据
                funds = []
                if data.get("Datas"):
                    for item in data["Datas"]:
                        funds.append({
                            "fund_code": item.get("CODE", ""),  # 基金代码
                            "fund_name": item.get("NAME", ""),  # 基金名称
                            "fund_type": item.get("FTYPE", ""), # 基金类型
                        })
                return funds
        except Exception as e:
            # 如果第三方接口失败，可以返回空结果或使用本地缓存
            logging.error(f"搜索基金失败: {e}")
            return []

# 先添加一个简单的测试路由
@router.get("/test")
async def test_route():
    # logger.info(f"测试路由被访问: {datetime.now()}")
    print(f"测试路由被访问: {datetime.now()}")
    return {"message": "Funds router is working", "timestamp": datetime.now().isoformat()}

@router.put("/{fund_id}", response_model=schemas.Fund)
def update_fund(
    fund_id: int,
    fund_update: schemas.FundBase,
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
