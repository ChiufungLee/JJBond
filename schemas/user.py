# schemas/user.py

from pydantic import BaseModel, EmailStr, Field
# from typing import Optional
from typing import Optional, List
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
    cost_price: float
    shares: float

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
    amount: float
    cost_price: float
    shangrijingzhi: float
    today_value: float
    change_rate: str
    today_revenue: float
    total_revenue: float
    profit_loss_ratio: float
    recent_changes: str

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