# CLAUDE.md

本文件为 AI 提供项目上下文，帮助更准确地理解代码结构和规范，减少重复说明。

---

## 项目概述

**JJBond** 是一款基金投资组合管理工具，支持持仓追踪、收益计算、排行榜、收益日历等功能。

- **后端**：FastAPI (Python 3.12)，端口 8888
- **数据库**：MySQL + SQLAlchemy ORM
- **缓存**：Redis（可选，降级兼容，不可用时服务正常运行）
- **前端 1**：微信小程序（`miniprogram/`），主要客户端
- **前端 2**：Web 静态页面（`frontweb/`），功能较少

---

## 启动命令

```bash
python main.py
# 或
uvicorn main:app --reload --host 0.0.0.0 --port 8888
```

安装依赖：
```bash
pip install fastapi uvicorn sqlalchemy pymysql pydantic-settings python-dotenv \
  bcrypt python-jose[cryptography] redis aiohttp beautifulsoup4 lxml slowapi
```

---

## 后端目录结构

```
main.py                  # 应用入口，注册路由、限流器、HTTP session 生命周期
core/
  config.py              # pydantic_settings 读取 .env
  database.py            # SQLAlchemy engine + Redis client（失败降级为 None）
  dependencies.py        # get_current_user / get_current_user_with_token 依赖
  limiter.py             # slowapi 限流器单例（避免循环依赖）
  http_client.py         # 全局 aiohttp.ClientSession 单例（lifespan 管理）
  scheduler.py           # APScheduler 定时任务（每个工作日 15:30 同步排行榜）
models/
  base.py                # DeclarativeBase
  user.py                # User
  fund.py                # UserFund, FundLib
  watchlist.py           # WatchlistFund, FundTransaction
schemas/
  user.py                # 所有 Pydantic schema（含 CalendarFundDetail）
  __init__.py            # 统一导出，新增 schema 必须同步在此处添加
routers/
  auth.py                # /api/auth/register|login|logout（含限流）
  user.py                # /api/users/me
  funds.py               # /api/funds/* CRUD + 搜索 + 组合计算
  watchlist.py           # /api/watchlist/*
  ranking.py             # /api/ranking/*
  sector.py              # /api/sector/* 板块详情
  market.py              # /api/market/* 股市指数行情
crud/
  user.py                # 所有数据库写操作（原子事务，单次 commit）
utils/
  jwt.py                 # JWT 创建/验证 + Redis 黑名单吊销
  password.py            # bcrypt 密码哈希
  fund_calculator.py     # 模块级单例 calculator，所有路由共享
  fund_data_manager.py   # 基金库搜索（Redis 缓存优先，降级到 DB LIKE）
  fund_ranking.py        # 排行榜管理（并发拉取 + pipeline 批量写 Redis）
```

---

## 关键设计规范

### 1. 路由 prefix 规范
所有路由的相对 prefix 在 `router = APIRouter(prefix="...")` 中定义（不含 `/api`），
`main.py` 中统一注入 `prefix="/api"`：
```python
app.include_router(auth.router,     prefix="/api")
app.include_router(ranking.router,  prefix="/api")  # 注意：ranking 也要加
```

### 2. 数据库事务规范
多步写操作必须在同一事务内原子提交，使用 `flush()` 获取自增 id，最后统一 `commit()`：
```python
db.add(db_fund)
db.flush()           # 获取 id，不提交
_add_transaction(db, ...)   # 只 add，不 commit
db.commit()          # 唯一的 commit
```
`_add_transaction` 是内部函数（下划线前缀），只负责 `db.add()`，不自行 commit。

### 3. 时间规范
全项目统一使用 aware UTC 时间，禁止 `datetime.utcnow()`（Python 3.12 已废弃）：
```python
from datetime import datetime, timezone
datetime.now(timezone.utc)
```

### 4. HTTP 请求规范
禁止在业务代码中直接 `aiohttp.ClientSession()`，统一使用全局单例：
```python
from core.http_client import get_http_session
session = get_http_session()
async with session.get(url, ...) as resp:
    ...
```

### 5. schema 新增规范
新增 Pydantic schema 后，必须同步更新 `schemas/__init__.py` 的导出列表，
否则 `import schemas` 的路由会报 `AttributeError`。

### 6. Redis 降级规范
所有 Redis 操作必须处理 `redis_client is None` 的情况，服务正常运行不依赖 Redis：
```python
if redis_client is None:
    return None   # 或走降级逻辑
```

### 7. 限流规范
`core/limiter.py` 提供全局 `limiter` 单例，需要限流的路由直接 import：
```python
from core.limiter import limiter

@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, ...):   # request 参数必须存在
```

### 8. FundCalculator 使用规范
`FundCalculator` 是无状态类，通过模块级单例共享，禁止路由内 `FundCalculator()`：
```python
from utils.fund_calculator import calculator   # 直接用单例
result = await calculator.get_fund_info(code)
```

---

## API 完整端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册（3次/分钟限流） |
| POST | /api/auth/login | 登录，返回 JWT（5次/分钟限流） |
| POST | /api/auth/logout | 登出，吊销 token |
| GET | /api/users/me | 当前用户信息 |
| GET | /api/funds/ | 用户持仓列表 |
| POST | /api/funds/ | 添加持仓 |
| PUT | /api/funds/{id} | 更新持仓 |
| DELETE | /api/funds/{id} | 删除持仓 |
| GET | /api/funds/calculate | 组合计算（含历史净值） |
| GET | /api/funds/calculate-simple | 组合计算（轻量版） |
| GET | /api/funds/revenue-calendar | 收益日历（含各基金每日明细） |
| GET | /api/funds/search | 搜索基金 |
| GET | /api/funds/fund_info/{code} | 单只基金信息 |
| GET | /api/watchlist/ | 自选列表 |
| POST | /api/watchlist/ | 添加自选 |
| DELETE | /api/watchlist/{id} | 移除自选 |
| GET | /api/ranking/ | 排行榜（分页） |
| GET | /api/ranking/{fund_code} | 单基金排名 |
| GET | /api/ranking/status/cache | 缓存状态 |
| POST | /api/ranking/sync | 手动同步排行榜 |
| GET | /api/market/indices | 股市指数行情（A股/港股/全球） |

---

## 数据库表结构

| 表名 | 模型文件 | 说明 |
|------|---------|------|
| users | models/user.py | 用户 |
| user_funds | models/fund.py | 持仓 |
| fund_lib | models/fund.py | 基金信息库（25000+条） |
| watchlist_funds | models/watchlist.py | 自选基金 |
| fund_transactions | models/watchlist.py | 交易记录（买入/卖出） |

---

## 外部数据源

| 用途 | URL |
|------|-----|
| 普通基金实时净值 | `http://fundgz.1234567.com.cn/js/{code}.js` |
| 备用基金信息 | `https://fundcomapi.tiantianfunds.com/mm/newCore/FundCoreDiyNew` |
| LOF基金信息 | `http://fund.eastmoney.com/{code}.html`（HTML 解析） |
| 历史净值 | `http://fund.eastmoney.com/f10/F10DataApi.aspx` |
| 排行榜数据 | `https://condition.tiantianfunds.com/condition/conditionFund/fundSelect` |
| 基金搜索 | `http://fundgz.1234567.com.cn/js/{keyword}.js` |

---

## 小程序目录结构

```
miniprogram/
  app.js               # 全局配置，baseUrl、登录状态管理
  pages/
    index/             # 首页（持仓概览）
    funds/             # 我的持仓（表格，支持按持有收益率排序）
    funds-add/         # 添加持仓
    funds-edit/        # 编辑持仓
    fund-detail/       # 基金详情
    watchlist/         # 自选基金
    search/            # 搜索基金
    ranking/           # 涨跌榜
    calendar/          # 收益日历（含 Treemap 收益图表）
    login/             # 登录
    register/          # 注册
    mine/              # 我的
    contact/           # 联系
    feedback/          # 反馈
    market/            # 股市行情（A股/港股/全球指数）
  components/
    fund-card/         # 基金卡片组件
    summary-card/      # 汇总卡片组件
    loading/           # 加载组件
    empty/             # 空状态组件
  utils/
    request.js         # wx.request 封装，自动注入 token，处理 401/422
    auth.js            # token 存取、登录状态检查
    util.js            # formatMoney、formatPercent 等工具函数
```

### 小程序开发规范

**请求**：统一使用 `utils/request.js` 的 `get/post/put/del`，不直接调 `wx.request`。
登录接口例外，使用 `login(username, password)` 方法（form-data 格式）。

**颜色规范**（基金涨跌）：
- 正收益/上涨：红色 `#ff4d4f`
- 负收益/下跌：绿色 `#52c41a`
- 主题色：紫色 `#722ed1`

**收益日历页 calendar 特别说明**：
- 后端 `revenue-calendar` 接口返回的 `CalendarDay` 包含 `fund_details`（各基金当日明细）
- 前端 `_buildChartBlocks()` 基于 `fund_details` 构建 Treemap，使用递归二分切割算法
- Treemap 颜色：正收益背景 `rgb(250,212,215)` 文字 `rgb(207,64,80)`，负收益背景 `rgb(206,235,229)` 文字 `rgb(49,154,128)`
- 图表色块间距通过 `calc()` 内缩实现（`GAP=4rpx`），容器背景白色作为间距底色

---

## 环境变量（.env）

```
DATABASE_URL=mysql+pymysql://user:pass@host/fund_web_db
SECRET_KEY=<random-32-bytes-hex>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
```

---

## 已知注意事项

1. `schemas/__init__.py` 手动维护导出列表，新增 schema 类必须手动添加，否则报 `AttributeError`
2. `models/__init__.py` 需导入所有模型类，确保 `Base.metadata.create_all()` 能建所有表
3. LOF 基金代码以 `OF/F/SH/SZ` 开头，走不同的抓取逻辑
4. `fund_data_manager.py` 的搜索缓存 key 为 `fund_lib:all`，`upsert_fund` 后自动失效
5. 排行榜依赖 Redis，Redis 不可用时 `get_ranking` 返回 `{"error": "Redis 不可用"}`
6. Token 黑名单存在 Redis，key 前缀 `token:blacklist:`，TTL = token 剩余有效期



# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding



**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First



**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes



**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution



**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```



Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

------

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
