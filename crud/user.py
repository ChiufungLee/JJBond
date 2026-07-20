from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from models.user import User
from models.fund import UserFund
from models.watchlist import WatchlistFund, FundTransaction
from models.auto_invest import AutoInvestPlan, AutoInvestRecord
from schemas.user import UserCreate, FundCreate, FundUpdate
from utils.password import get_password_hash, verify_password
from typing import Optional, List, Dict
from datetime import datetime, date
from calendar import monthrange
from zoneinfo import ZoneInfo

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


# ---------- 工具函数 ----------

def _now() -> datetime:
    """统一使用 Asia/Shanghai 时间。"""
    return datetime.now(SHANGHAI_TZ)


def _add_transaction(
    db: Session,
    user_id: int,
    fund_code: str,
    fund_name: str,
    transaction_type: str,
    shares: float,
    price: float,
    transaction_date: datetime = None,
) -> FundTransaction:
    """
    仅将交易记录加入 session，不自行 commit。
    调用方负责在所有写操作完成后统一 commit，保证原子性。
    """
    transaction = FundTransaction(
        user_id=user_id,
        fund_code=fund_code,
        fund_name=fund_name,
        transaction_type=transaction_type,
        shares=shares,
        price=price,
        transaction_date=transaction_date or _now(),
    )
    db.add(transaction)
    return transaction


# ---------- 用户 ----------

def get_user_by_username(db: Session, username: str):
    """通过用户名获取用户"""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str):
    """通过邮箱获取用户"""
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, user: UserCreate):
    """创建新用户"""
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, username: str, password: str):
    """验证用户"""
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


# ---------- 微信用户 ----------

def get_user_by_openid(db: Session, openid: str) -> Optional[User]:
    """通过 openid 获取用户"""
    return db.query(User).filter(User.openid == openid).first()


def create_wechat_user(
    db: Session,
    openid: str,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
    unionid: Optional[str] = None
) -> User:
    """创建微信用户"""
    # 使用完整 openid 作为 username，避免与普通用户名冲突
    # openid 通常是28位字符串，如 "oXXXX_XXXXXXXXXXXXXXXXX"
    default_username = f"wechat_{openid}"

    db_user = User(
        username=default_username,
        openid=openid,
        unionid=unionid,
        nickname=nickname,
        avatar_url=avatar_url,
        login_type='wechat',
        email=None,
        hashed_password=None,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_wechat_user_info(
    db: Session,
    user: User,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None
) -> User:
    """更新微信用户信息"""
    if nickname:
        user.nickname = nickname
    if avatar_url:
        user.avatar_url = avatar_url
    db.commit()
    db.refresh(user)
    return user


def update_username(db: Session, user: User, new_username: str) -> User:
    """更新用户名"""
    # 检查用户名是否已被其他用户使用
    existing = db.query(User).filter(
        User.username == new_username,
        User.id != user.id
    ).first()
    if existing:
        return None  # 用户名已存在

    user.username = new_username
    db.commit()
    db.refresh(user)
    return user


def update_user_info(db: Session, user: User, username: str = None, nickname: str = None, avatar_url: str = None) -> User:
    """更新用户信息"""
    # 如果更新用户名，检查是否已被使用
    if username:
        existing = db.query(User).filter(
            User.username == username,
            User.id != user.id
        ).first()
        if existing:
            return None  # 用户名已存在
        user.username = username

    if nickname is not None:
        user.nickname = nickname

    if avatar_url is not None:
        user.avatar_url = avatar_url

    db.commit()
    db.refresh(user)
    return user


# ---------- 基金持仓 ----------

def get_user_funds(db: Session, user_id: int):
    return db.query(UserFund).filter(UserFund.user_id == user_id).all()


def get_user_fund(db: Session, user_id: int, fund_id: int):
    return db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.id == fund_id,
    ).first()


def get_user_fund_by_code(db: Session, user_id: int, fund_code: str):
    """按基金代码定向查询单条持仓"""
    return db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.fund_code == fund_code,
    ).first()


def create_user_fund(db: Session, fund: FundCreate, user_id: int):
    """
    新增持仓并记录买入交易。
    两次写入在同一事务内，flush 获取持仓 id 后统一 commit。
    """
    existing = db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.fund_code == fund.fund_code,
    ).first()
    if existing:
        return None

    db_fund = UserFund(**fund.dict(), user_id=user_id)
    db.add(db_fund)

    try:
        db.flush()  # 写入数据库但不提交，使 db_fund.id / created_at 可用

        _add_transaction(
            db=db,
            user_id=user_id,
            fund_code=fund.fund_code,
            fund_name=fund.fund_name,
            transaction_type='buy',
            shares=fund.shares,
            price=fund.cost_price,
            transaction_date=db_fund.created_at,
        )

        db.commit()          # 持仓 + 交易记录原子提交
    except IntegrityError:
        db.rollback()
        return None

    db.refresh(db_fund)
    return db_fund


def update_user_fund(db: Session, fund_id: int, fund_update: FundUpdate, user_id: int):
    """
    更新持仓并按份额变化记录交易。
    持仓更新与交易记录在同一事务内原子提交。
    """
    db_fund = get_user_fund(db, user_id, fund_id)
    if not db_fund:
        return None

    old_shares = db_fund.shares

    for key, value in fund_update.dict().items():
        setattr(db_fund, key, value)

    shares_diff = fund_update.shares - old_shares
    if shares_diff != 0:
        _add_transaction(
            db=db,
            user_id=user_id,
            fund_code=db_fund.fund_code,
            fund_name=db_fund.fund_name,
            transaction_type='buy' if shares_diff > 0 else 'sell',
            shares=abs(shares_diff),
            price=fund_update.cost_price,
            transaction_date=_now(),
        )

    db.commit()          # 持仓更新 + 交易记录原子提交
    db.refresh(db_fund)
    return db_fund


def delete_user_fund(db: Session, fund_id: int, user_id: int):
    """
    删除持仓并记录全量卖出交易。
    卖出记录与持仓删除在同一事务内原子提交。
    """
    db_fund = get_user_fund(db, user_id, fund_id)
    if not db_fund:
        return False

    _add_transaction(
        db=db,
        user_id=user_id,
        fund_code=db_fund.fund_code,
        fund_name=db_fund.fund_name,
        transaction_type='sell',
        shares=db_fund.shares,
        price=db_fund.cost_price,
        transaction_date=_now(),
    )

    db.delete(db_fund)
    db.commit()          # 卖出记录 + 持仓删除原子提交
    return True


def get_user_transactions(db: Session, user_id: int, fund_code: str = None, before_date: date = None) -> List[FundTransaction]:
    """获取用户交易记录，可按基金代码和日期过滤"""
    query = db.query(FundTransaction).filter(FundTransaction.user_id == user_id)
    if fund_code:
        query = query.filter(FundTransaction.fund_code == fund_code)
    if before_date:
        # 只查询指定日期之前的交易（含该月，用于收益日历计算份额快照）
        end_of_month = date(before_date.year, before_date.month, monthrange(before_date.year, before_date.month)[1])
        query = query.filter(FundTransaction.transaction_date <= end_of_month)
    return query.order_by(FundTransaction.transaction_date.desc()).all()


# ---------- 自选基金 ----------

def get_watchlist(db: Session, user_id: int) -> List[WatchlistFund]:
    """获取用户的自选基金列表"""
    return db.query(WatchlistFund).filter(WatchlistFund.user_id == user_id).all()


def get_watchlist_by_code(db: Session, user_id: int, fund_code: str) -> Optional[WatchlistFund]:
    """根据基金代码获取自选基金"""
    return db.query(WatchlistFund).filter(
        WatchlistFund.user_id == user_id,
        WatchlistFund.fund_code == fund_code,
    ).first()


def add_to_watchlist(db: Session, user_id: int, fund_code: str, fund_name: str, cost_nav: float) -> WatchlistFund | None:
    """添加基金到自选"""
    db_watchlist = WatchlistFund(
        user_id=user_id,
        fund_code=fund_code,
        fund_name=fund_name,
        cost_nav=cost_nav,
    )
    db.add(db_watchlist)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(db_watchlist)
    return db_watchlist


def remove_from_watchlist(db: Session, user_id: int, watchlist_id: int) -> bool:
    """从自选中移除基金"""
    db_watchlist = db.query(WatchlistFund).filter(
        WatchlistFund.id == watchlist_id,
        WatchlistFund.user_id == user_id,
    ).first()
    if db_watchlist:
        db.delete(db_watchlist)
        db.commit()
        return True
    return False


def get_holding_fund_codes(db: Session, user_id: int) -> List[str]:
    """获取用户已持有的基金代码列表"""
    funds = db.query(UserFund.fund_code).filter(UserFund.user_id == user_id).all()
    return [f[0] for f in funds]


# ---------- 定投计划 ----------

def create_auto_invest_plan(
    db: Session, user_id: int, fund_code: str, fund_name: str, amount: float
) -> Optional[AutoInvestPlan]:
    """创建定投计划。同一用户同一基金只能有一个计划。"""
    existing = db.query(AutoInvestPlan).filter(
        AutoInvestPlan.user_id == user_id,
        AutoInvestPlan.fund_code == fund_code,
    ).first()
    if existing:
        return None

    plan = AutoInvestPlan(
        user_id=user_id,
        fund_code=fund_code,
        fund_name=fund_name,
        amount=amount,
        status='active',
    )
    db.add(plan)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(plan)
    return plan


def get_auto_invest_plans(db: Session, user_id: int) -> List[AutoInvestPlan]:
    """获取用户所有定投计划（含累计统计）"""
    plans = db.query(AutoInvestPlan).filter(
        AutoInvestPlan.user_id == user_id
    ).order_by(AutoInvestPlan.created_at.desc()).all()

    for plan in plans:
        stats = db.query(
            func.coalesce(func.sum(AutoInvestRecord.amount), 0),
            func.coalesce(func.sum(AutoInvestRecord.shares), 0),
        ).filter(
            AutoInvestRecord.plan_id == plan.id,
            AutoInvestRecord.status == 'success',
        ).first()
        plan.total_invested = round(float(stats[0]), 2)
        plan.total_shares = round(float(stats[1]), 2)

    return plans


def get_auto_invest_plan(db: Session, plan_id: int, user_id: int) -> Optional[AutoInvestPlan]:
    """获取单个定投计划"""
    return db.query(AutoInvestPlan).filter(
        AutoInvestPlan.id == plan_id,
        AutoInvestPlan.user_id == user_id,
    ).first()


def update_auto_invest_plan(
    db: Session, plan_id: int, user_id: int,
    amount: Optional[float] = None, status: Optional[str] = None,
) -> Optional[AutoInvestPlan]:
    """更新定投计划（金额或状态）"""
    plan = get_auto_invest_plan(db, plan_id, user_id)
    if not plan:
        return None
    if amount is not None:
        plan.amount = amount
    if status is not None:
        plan.status = status
    db.commit()
    db.refresh(plan)
    return plan


def delete_auto_invest_plan(db: Session, plan_id: int, user_id: int) -> bool:
    """删除定投计划"""
    plan = get_auto_invest_plan(db, plan_id, user_id)
    if not plan:
        return False
    db.delete(plan)
    db.commit()
    return True


def get_auto_invest_records(
    db: Session, plan_id: int, user_id: int, limit: int = 20, offset: int = 0
) -> List[AutoInvestRecord]:
    """获取定投执行记录（分页）"""
    return db.query(AutoInvestRecord).filter(
        AutoInvestRecord.plan_id == plan_id,
        AutoInvestRecord.user_id == user_id,
    ).order_by(AutoInvestRecord.execute_date.desc()).offset(offset).limit(limit).all()


def add_shares_from_auto_invest(
    db: Session, user_id: int, fund_code: str, fund_name: str,
    amount: float, nav: float,
) -> Optional[Dict]:
    """
    定投执行：更新持仓份额 + 成本价（加权平均）+ 写交易记录。
    在调用方的事务中执行，不自行 commit。
    返回 {"fund": UserFund, "shares": float} 或 None。
    """
    fund = db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.fund_code == fund_code,
    ).first()
    if not fund:
        return None

    new_shares = round(amount / nav, 2)
    if new_shares <= 0:
        return None

    old_cost = fund.cost_price * fund.shares
    fund.shares = round(fund.shares + new_shares, 2)
    fund.cost_price = round((old_cost + amount) / fund.shares, 4)

    _add_transaction(
        db=db,
        user_id=user_id,
        fund_code=fund_code,
        fund_name=fund_name,
        transaction_type='buy',
        shares=new_shares,
        price=nav,
    )

    return {"fund": fund, "shares": new_shares}