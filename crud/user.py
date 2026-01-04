from sqlalchemy.orm import Session
from models.user import User, UserFund
from schemas.user import UserCreate, FundCreate
from utils.password import get_password_hash, verify_password
from typing import Optional


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
    db_fund = UserFund(**fund.dict(), user_id=user_id)
    db.add(db_fund)
    db.commit()
    db.refresh(db_fund)
    print(db_fund)
    return db_fund

# def create_user_fund(db: Session, fund: FundCreate, user_id: int, fund_name: Optional[str] = None):
#     if not fund_name:
#         fund_name = get_fund_name_by_code(fund.fund_code)
#     db_fund = UserFund(**fund.dict(), user_id=user_id)
#     db.add(db_fund)
#     db.commit()
#     db.refresh(db_fund)
#     print(db_fund)
#     return db_fund

def get_fund_name_by_code(fund_code: str) -> Optional[str]:
    """
    根据基金代码获取基金名称
    可以调用第三方接口，也可以使用本地缓存
    """
    # 这里可以添加缓存逻辑
    # 示例：调用简单接口获取基金名称
    try:
        # 模拟调用第三方接口
        # 实际实现时请替换为真实的第三方接口
        return f"基金{fund_code}"
    except:
        return None


def update_user_fund(db: Session, fund_id: int, fund_update: FundCreate, user_id: int):
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