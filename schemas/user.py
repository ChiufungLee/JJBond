# schemas/user.py

from pydantic import BaseModel, EmailStr, Field
# from typing import Optional
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class User(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        # orm_mode = True
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None



# 基金相关
class FundBase(BaseModel):
    fund_code: str
    cost_price: float = Field(..., gt=0, description="持仓成本价，必须大于0")
    shares: float = Field(..., gt=0, description="持仓份额，必须大于0")

class FundCreate(FundBase):
    # pass
    fund_name: str

class FundSearchResult(BaseModel):
    """基金搜索结果模型"""
    fund_code: str
    fund_name: str
    fund_type: Optional[str] = None
    
class Fund(FundBase):
    id: int
    user_id: int
    fund_name: Optional[str]
    created_at: datetime
    # updated_at: datetime

    class Config:
        from_attributes = True

# 基金计算结果
class FundCalculator(BaseModel):
    fund_code: str
    fund_name: str
    cost: float
    cost_price: float
    shares: float
    data_unavailable: bool = False  # True 表示行情获取失败，以下字段为 None
    amount: Optional[float] = None
    shangrijingzhi: Optional[float] = None
    today_value: Optional[float] = None
    change_rate: Optional[str] = None
    today_revenue: Optional[float] = None
    total_revenue: Optional[float] = None
    profit_loss_ratio: Optional[float] = None
    recent_changes: List[Dict[str, Any]] = []

class PortfolioSummary(BaseModel):
    fund_count: int
    total_cost: float
    yesterday_holding_amount: float
    yesterday_holding_income: float
    today_revenue: float
    today_holding_amount: float
    low_fund_list: List[str]
    high_fund_list: List[str]
    fund_details: List[FundCalculator]