# JJBond - 基金管理平台

一个简洁实用的基金管理工具，帮助用户跟踪和管理基金投资组合，实时查看基金估值和收益情况。

## 功能特性

### 核心功能
- **持仓管理**：添加、编辑、删除持有的基金，记录成本价和份额
- **收益计算**：自动计算今日收益、累计收益、收益率等
- **自选基金**：添加关注的基金到自选列表，跟踪加入以来的涨跌幅
- **实时估值**：获取基金实时净值和估值数据
- **趋势图表**：查看基金近期净值走势图

### 特色亮点
- 持有/自选基金自动标记，一目了然
- 涨跌幅预警（超过 ±3% 提醒）
- 支持移动端响应式布局
- 微信小程序 + Web 双端支持

## 技术栈

### 后端
- **FastAPI** - 高性能 Python Web 框架
- **SQLAlchemy** - ORM 数据库操作
- **MySQL** - 数据存储
- **Redis** - 数据缓存
- **Pydantic** - 数据验证

### 前端
- **Web**: 原生 JavaScript + HTML/CSS
- **小程序**: 微信小程序原生开发
- **Chart.js** - 图表展示

## 项目结构

```
JJBond/
├── main.py              # 应用入口
├── core/                # 核心配置
│   ├── config.py        # 配置管理
│   ├── database.py      # 数据库连接
│   └── dependencies.py  # 依赖注入
├── models/              # 数据模型
│   └── user.py          # User, UserFund, WatchlistFund
├── schemas/             # Pydantic 模型
├── routers/             # API 路由
│   ├── auth.py          # 认证相关
│   ├── funds.py         # 基金管理
│   └── watchlist.py     # 自选基金
├── crud/                # 数据库操作
├── utils/               # 工具函数
│   ├── fund_calculator.py    # 基金数据计算
│   └── fund_data_manager.py  # 基金数据管理
├── frontweb/            # Web 前端
└── miniprogram/         # 微信小程序
```

## 快速开始

### 环境要求
- Python 3.8+
- MySQL 5.7+
- Redis (可选，用于缓存)

### 安装依赖

```bash
pip install fastapi uvicorn sqlalchemy pymysql pydantic-settings python-dotenv passlib bcrypt python-jose redis aiohttp requests beautifulsoup4 lxml
```

### 配置环境变量

创建 `.env` 文件：

```env
DATABASE_URL=mysql+pymysql://user:password@localhost/fund_web_db
SECRET_KEY=your-secret-key
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 运行服务

```bash
python main.py
# 或
uvicorn main:app --reload --host 0.0.0.0 --port 8888
```

访问 http://localhost:8888 即可使用 Web 端。

### API 文档

启动服务后访问：
- Swagger UI: http://localhost:8888/api/docs
- ReDoc: http://localhost:8888/api/redoc

## API 接口

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |

### 持仓管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/funds/ | 获取持仓列表 |
| POST | /api/funds/ | 添加基金 |
| PUT | /api/funds/{id} | 更新基金 |
| DELETE | /api/funds/{id} | 删除基金 |
| GET | /api/funds/calculate | 计算收益 |
| GET | /api/funds/search | 搜索基金 |

### 自选基金
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/watchlist/ | 获取自选列表 |
| POST | /api/watchlist/ | 添加自选 |
| DELETE | /api/watchlist/{id} | 移除自选 |

## 截图

![首页](frontweb/index_page.png)

## License

MIT
