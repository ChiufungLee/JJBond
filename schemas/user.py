# schemas/user.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None

class UserCreate(BaseModel):
    """普通用户注册（需要 username, email, password）"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# 微信登录请求
class WechatLoginRequest(BaseModel):
    code: str = Field(..., description="wx.login 获取的 code")
    nickname: Optional[str] = Field(None, description="用户昵称")
    avatar_url: Optional[str] = Field(None, description="用户头像URL")

# 微信登录响应（扩展 Token）
class WechatLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    is_new_user: bool = Field(..., description="是否为新用户")
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

class User(UserBase):
    id: int
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    login_type: str = "password"
    last_login_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        # orm_mode = True
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    created_at: datetime
    last_login_at: Optional[datetime] = None

class TokenData(BaseModel):
    username: Optional[str] = None



# 基金相关
class FundBase(BaseModel):
    fund_code: str
    cost_price: float = Field(..., gt=0, description="持仓成本价，必须大于0")
    shares: float = Field(..., gt=0, description="持仓份额，必须大于0")

class FundCreate(FundBase):
    fund_name: str

class FundUpdate(BaseModel):
    """基金更新模型 - 只更新可修改的字段"""
    cost_price: float = Field(..., gt=0, description="持仓成本价，必须大于0")
    shares: float = Field(..., gt=0, description="持仓份额，必须大于0")


# 自选基金相关
class WatchlistCreate(BaseModel):
    """添加自选基金"""
    fund_code: str
    fund_name: str

class WatchlistItem(BaseModel):
    """自选基金项"""
    id: int
    fund_code: str
    fund_name: Optional[str] = None
    cost_nav: float  # 添加时的净值
    added_at: datetime
    is_holding: bool = False  # 是否已持有
    current_nav: Optional[float] = None  # 当前净值
    change_rate: Optional[str] = None  # 今日涨跌幅
    total_change_rate: Optional[float] = None  # 加入自选以来涨跌幅(%)
    nav_updated: bool = False  # 今日实际净值是否已更新

    class Config:
        from_attributes = True

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
class FundDetail(BaseModel):
    id: Optional[int] = None  # 用户基金记录ID，用于编辑/删除操作
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
    nav_updated: bool = False  # 今日实际净值是否已更新

class PortfolioSummary(BaseModel):
    fund_count: int
    total_cost: float
    yesterday_holding_amount: float
    yesterday_holding_income: float
    today_revenue: float
    today_holding_amount: float
    low_fund_list: List[str]
    high_fund_list: List[str]
    fund_details: List[FundDetail]


# 交易记录相关
class TransactionBase(BaseModel):
    fund_code: str
    fund_name: Optional[str] = None
    transaction_type: str  # 'buy' or 'sell'
    shares: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    transaction_date: datetime


class Transaction(TransactionBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# 收益日历相关
class CalendarFundDetail(BaseModel):
    """日历单日中单只基金的收益明细"""
    fund_code: str
    fund_name: str
    shares: float           # 当日持仓份额
    prev_nav: float         # 前一日净值
    today_nav: float        # 当日净值
    revenue: float          # 当日收益额


class CalendarDay(BaseModel):
    """日历单日数据"""
    date: str  # "2026-03-01"
    day: int  # 1-31
    weekday: int  # 0=周一, 6=周日
    is_trading_day: bool
    revenue: Optional[float] = None       # 当日汇总收益
    accumulated: Optional[float] = None   # 月累计收益
    fund_details: List['CalendarFundDetail'] = []  # 各基金明细


class RevenueCalendar(BaseModel):
    """收益日历响应"""
    year: int
    month: int
    total_revenue: float  # 月总收益
    trading_days: int  # 交易日数
    positive_days: int  # 盈利天数
    negative_days: int  # 亏损天数
    calendar: List[CalendarDay]

class LogoutResponse(BaseModel):
    message: str


# 用户更新相关
class UsernameUpdate(BaseModel):
    """修改用户名"""
    username: str = Field(..., min_length=2, max_length=20, description="新用户名")


class UserInfoUpdate(BaseModel):
    """更新用户信息"""
    username: Optional[str] = Field(None, min_length=2, max_length=20, description="用户名")
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")