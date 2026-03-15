from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.database import SessionLocal, engine
from models import base as models
from core.config import settings
from routers import auth, user, funds
from utils.fund_data_manager import init_fund_lib


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时建表并初始化基金库"""
    # 创建数据库表（已存在则跳过）
    models.Base.metadata.create_all(bind=engine)

    # 首次启动时写入初始基金库数据
    db = SessionLocal()
    try:
        init_fund_lib(db)
    finally:
        db.close()

    yield  # 应用正常运行阶段


# 创建FastAPI应用
app = FastAPI(
    title="基金管理平台 API",
    description="一个基于FastAPI的在线基金管理网站",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(funds.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "欢迎使用基金查询网站API", "status": "运行正常"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8888, reload=True)