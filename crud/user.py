from sqlalchemy.orm import Session
from models.user import User, UserFund, WatchlistFund
from schemas.user import UserCreate, FundCreate, FundUpdate
from utils.password import get_password_hash, verify_password
from typing import Optional, List


def get_user_by_username(db: Session, username: str):
    """通过用户名获取用户"""
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str):
    """通过邮箱获取用户"""
    return db.query(User).filter(User.email == email).first()

def create_user(db: Session, user: UserCreate):
    """创建新用户"""
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
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


# 基金 CRUD
def get_user_funds(db: Session, user_id: int):
    return db.query(UserFund).filter(UserFund.user_id == user_id).all()

def get_user_fund(db: Session, user_id: int, fund_id: int):
    return db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.id == fund_id
    ).first()

def create_user_fund(db: Session, fund: FundCreate, user_id: int):
    existing = db.query(UserFund).filter(
        UserFund.user_id == user_id,
        UserFund.fund_code == fund.fund_code
    ).first()
    if existing:
        return None  # 由调用方决定如何处理重复
    db_fund = UserFund(**fund.dict(), user_id=user_id)
    db.add(db_fund)
    db.commit()
    db.refresh(db_fund)
    return db_fund


def update_user_fund(db: Session, fund_id: int, fund_update: FundUpdate, user_id: int):
    db_fund = get_user_fund(db, user_id, fund_id)
    if db_fund:
        for key, value in fund_update.dict().items():
            setattr(db_fund, key, value)
        db.commit()
        db.refresh(db_fund)
    return db_fund

def delete_user_fund(db: Session, fund_id: int, user_id: int):
    db_fund = get_user_fund(db, user_id, fund_id)
    if db_fund:
        db.delete(db_fund)
        db.commit()
        return True
    return False


# 自选基金 CRUD
def get_watchlist(db: Session, user_id: int) -> List[WatchlistFund]:
    """获取用户的自选基金列表"""
    return db.query(WatchlistFund).filter(WatchlistFund.user_id == user_id).all()


def get_watchlist_by_code(db: Session, user_id: int, fund_code: str) -> Optional[WatchlistFund]:
    """根据基金代码获取自选基金"""
    return db.query(WatchlistFund).filter(
        WatchlistFund.user_id == user_id,
        WatchlistFund.fund_code == fund_code
    ).first()


def add_to_watchlist(db: Session, user_id: int, fund_code: str, fund_name: str, cost_nav: float) -> WatchlistFund:
    """添加基金到自选"""
    db_watchlist = WatchlistFund(
        user_id=user_id,
        fund_code=fund_code,
        fund_name=fund_name,
        cost_nav=cost_nav
    )
    db.add(db_watchlist)
    db.commit()
    db.refresh(db_watchlist)
    return db_watchlist


def remove_from_watchlist(db: Session, user_id: int, watchlist_id: int) -> bool:
    """从自选中移除基金"""
    db_watchlist = db.query(WatchlistFund).filter(
        WatchlistFund.id == watchlist_id,
        WatchlistFund.user_id == user_id
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