# JJBond 后端接口文档（小程序前端参考）

**Base URL:** `http(s)://domain:8888/api`

**通用请求头：**

| Header | 值 | 说明 |
|--------|----|----|
| `Authorization` | `Bearer <access_token>` | 需要登录的接口必传 |
| `Content-Type` | `application/json` | JSON 请求体 |

**通用错误响应格式：**
```json
{"detail": "错误描述"}
```
HTTP 状态码：`400`（参数错误）、`401`（未认证）、`404`（不存在）、`422`（验证失败）、`429`（限流）。

---

## 一、认证模块 `/api/auth`

### 1.1 注册

```
POST /api/auth/register
```

- **限流：** 3次/分钟
- **认证：** 无需登录
- **请求体：**

```json
{
  "username": "string (3-50字符)",
  "email": "user@example.com",
  "password": "string (最少6字符)"
}
```

- **响应 `200`：**

```json
{
  "id": 1,
  "username": "testuser",
  "email": "user@example.com",
  "nickname": null,
  "avatar_url": null,
  "login_type": "password",
  "last_login_at": null,
  "created_at": "2026-01-01T00:00:00Z"
}
```

- **错误：** `400` 用户名或邮箱已存在

---

### 1.2 登录

```
POST /api/auth/login
```

- **限流：** 5次/分钟
- **认证：** 无需登录
- **Content-Type：** `application/x-www-form-urlencoded`（OAuth2 标准格式）
- **请求体（form-data）：**

| 字段 | 类型 | 必填 |
|------|------|------|
| `username` | string | 是 |
| `password` | string | 是 |

- **可选请求头：** `X-Remember-Me: true` — 开启后会在响应中设置 `HttpOnly` 的 refresh token cookie
- **响应 `200`：**

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "username": "testuser",
  "created_at": "2026-01-01T00:00:00Z",
  "last_login_at": "2026-05-21T08:00:00Z"
}
```

- **错误：** `401` 用户名或密码错误

> **小程序调用示例：** 使用 `login(username, password)` 方法（`utils/request.js` 已封装为 form-data 格式）。

---

### 1.3 登出

```
POST /api/auth/logout
```

- **认证：** 需要 Bearer Token
- **响应 `200`：**

```json
{"message": "Successfully logged out"}
```

---

### 1.4 刷新 Token

```
POST /api/auth/refresh
```

- **认证：** 无需 Bearer Token，通过 HttpOnly cookie 中的 refresh token 验证
- **响应 `200`：**

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

- **错误：** `401` refresh token 缺失或无效

> **小程序注意：** 微信小程序不支持 HttpOnly cookie，此接口主要用于 Web 端。

---

### 1.5 微信登录

```
POST /api/auth/wechat-login
```

- **限流：** 10次/分钟
- **认证：** 无需登录
- **请求体：**

```json
{
  "code": "wx.login 获取的 code",
  "nickname": "用户昵称（可选）",
  "avatar_url": "用户头像URL（可选）"
}
```

- **响应 `200`：**

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "username": null,
  "nickname": "微信用户",
  "avatar_url": "https://...",
  "is_new_user": true,
  "created_at": "2026-01-01T00:00:00Z",
  "last_login_at": "2026-05-21T08:00:00Z"
}
```

---

## 二、用户模块 `/api/users`

### 2.1 获取当前用户信息

```
GET /api/users/me
```

- **认证：** 需要
- **响应 `200`：**

```json
{
  "id": 1,
  "username": "testuser",
  "email": "user@example.com",
  "nickname": "昵称",
  "avatar_url": "/static/avatars/1_uuid.jpg",
  "login_type": "password",
  "last_login_at": "2026-05-21T08:00:00Z",
  "created_at": "2026-01-01T00:00:00Z"
}
```

---

### 2.2 修改用户名

```
PUT /api/users/me/username
```

- **认证：** 需要
- **请求体：**

```json
{"username": "新用户名 (2-20字符)"}
```

- **响应 `200`：** 返回更新后的 `User` 对象
- **错误：** `400` 用户名已存在

---

### 2.3 修改用户信息

```
PUT /api/users/me/info
```

- **认证：** 需要
- **请求体：**

```json
{
  "username": "新用户名（可选，2-20字符）",
  "nickname": "新昵称（可选，最长50字符）"
}
```

- **响应 `200`：** 返回更新后的 `User` 对象

---

### 2.4 上传头像

```
POST /api/users/me/avatar
```

- **认证：** 需要
- **Content-Type：** `multipart/form-data`
- **请求体：** `avatar` 字段（图片文件，最大 2MB，支持 jpeg/png/gif/bmp/webp）
- **响应 `200`：**

```json
{"avatar_url": "/static/avatars/1_uuid.jpg"}
```

---

### 2.5 查看指定用户

```
GET /api/users/{username}
```

- **认证：** 需要
- **路径参数：** `username` (string)
- **响应 `200`：** 返回 `User` 对象
- **错误：** `404` 用户不存在

---

## 三、持仓基金模块 `/api/funds`

### 3.1 获取持仓列表

```
GET /api/funds/
```

- **认证：** 需要
- **响应 `200`：** `List[Fund]`

```json
[
  {
    "id": 1,
    "user_id": 1,
    "fund_code": "000001",
    "fund_name": "华夏成长混合",
    "cost_price": 1.5,
    "shares": 1000.0,
    "created_at": "2026-01-01T00:00:00Z"
  }
]
```

---

### 3.2 添加持仓

```
POST /api/funds/
```

- **认证：** 需要
- **请求体：**

```json
{
  "fund_code": "000001",
  "fund_name": "华夏成长混合",
  "cost_price": 1.5,
  "shares": 1000.0
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `fund_code` | string | 是 | 基金代码 |
| `fund_name` | string | 是 | 基金名称 |
| `cost_price` | float | 是 | > 0 |
| `shares` | float | 是 | > 0 |

- **响应 `200`：** 返回创建的 `Fund` 对象
- **错误：** `400` 该基金已在持仓中

---

### 3.3 更新持仓

```
PUT /api/funds/{fund_id}
```

- **认证：** 需要
- **路径参数：** `fund_id` (int)
- **请求体：**

```json
{
  "cost_price": 1.6,
  "shares": 2000.0
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `cost_price` | float | 是 | > 0 |
| `shares` | float | 是 | > 0 |

- **响应 `200`：** 返回更新后的 `Fund` 对象
- **错误：** `404` 持仓不存在

---

### 3.4 删除持仓

```
DELETE /api/funds/{fund_id}
```

- **认证：** 需要
- **路径参数：** `fund_id` (int)
- **响应 `200`：**

```json
{"message": "Fund deleted successfully"}
```

- **错误：** `404` 持仓不存在

---

### 3.5 组合计算（完整版）

```
GET /api/funds/calculate
```

- **认证：** 需要
- **限流：** 10次/分钟
- **响应 `200`：** `PortfolioSummary`

```json
{
  "fund_count": 3,
  "total_cost": 50000.0,
  "yesterday_holding_amount": 51000.0,
  "yesterday_holding_income": 1000.0,
  "today_revenue": 200.0,
  "today_holding_amount": 51200.0,
  "low_fund_list": ["000001"],
  "high_fund_list": ["000002"],
  "fund_details": [
    {
      "id": 1,
      "fund_code": "000001",
      "fund_name": "华夏成长混合",
      "cost": 15000.0,
      "cost_price": 1.5,
      "shares": 10000.0,
      "data_unavailable": false,
      "amount": 15500.0,
      "shangrijingzhi": 1.55,
      "today_value": null,
      "change_rate": "1.23%",
      "today_revenue": 180.0,
      "total_revenue": 500.0,
      "profit_loss_ratio": 3.33,
      "recent_changes": [],
      "nav_updated": true
    }
  ]
}
```

> 包含历史净值，加载较慢。适用于首页/持仓页的完整展示。

---

### 3.6 组合计算（轻量版）

```
GET /api/funds/calculate-simple
```

- **认证：** 需要
- **限流：** 10次/分钟
- **响应 `200`：** 同 `PortfolioSummary` 结构，但 `recent_changes` 为空

> 仅含实时行情，不含历史净值。适用于快速加载场景。

---

### 3.7 收益日历

```
GET /api/funds/revenue-calendar
```

- **认证：** 需要
- **限流：** 10次/分钟
- **查询参数：**

| 参数 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `year` | int | 是 | 年份 |
| `month` | int | 是 | 1-12 |

- **响应 `200`：** `RevenueCalendar`

```json
{
  "year": 2026,
  "month": 5,
  "total_revenue": 500.0,
  "trading_days": 20,
  "positive_days": 12,
  "negative_days": 8,
  "calendar": [
    {
      "date": "2026-05-01",
      "day": 1,
      "weekday": 4,
      "is_trading_day": false,
      "revenue": null,
      "accumulated": null,
      "fund_details": []
    },
    {
      "date": "2026-05-05",
      "day": 5,
      "weekday": 1,
      "is_trading_day": true,
      "revenue": 50.0,
      "accumulated": 50.0,
      "fund_details": [
        {
          "fund_code": "000001",
          "fund_name": "华夏成长混合",
          "shares": 10000.0,
          "prev_nav": 1.50,
          "today_nav": 1.51,
          "revenue": 100.0
        }
      ]
    }
  ]
}
```

---

### 3.8 搜索基金

```
GET /api/funds/search
```

- **认证：** 需要
- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `q` | string | 是 | - | 搜索关键词（代码或名称） |
| `limit` | int | 否 | 10 | 返回条数上限 |
| `use_api` | bool | 否 | false | 是否强制从外部API搜索 |

- **响应 `200`：** `List[dict]`

```json
[
  {"fund_code": "000001", "fund_name": "华夏成长混合", "fund_type": "混合型"},
  {"fund_code": "000011", "fund_name": "华夏大盘精选混合", "fund_type": "混合型"}
]
```

---

### 3.9 单只基金实时信息

```
GET /api/funds/fund_info/{fund_code}
```

- **认证：** 需要
- **路径参数：** `fund_code` (string)
- **响应 `200`：** 返回实时基金信息 dict（名称、净值、涨跌幅、费率等）

---

### 3.10 基金历史净值

```
GET /api/funds/fund_nav_history/{fund_code}
```

- **认证：** 需要
- **路径参数：** `fund_code` (string)
- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 约束 |
|------|------|------|------|------|
| `days` | int | 否 | 30 | 1-366 |

- **响应 `200`：** 历史净值列表

---

### 3.11 基金多阶段收益

```
GET /api/funds/fund_returns/{fund_code}
```

- **认证：** 需要
- **路径参数：** `fund_code` (string)
- **响应 `200`：**

```json
{
  "fund_code": "000001",
  "periods": [
    {"period": "近1周", "value": "1.23%"},
    {"period": "近1月", "value": "3.45%"},
    {"period": "近3月", "value": "5.67%"},
    {"period": "近6月", "value": "8.90%"},
    {"period": "近1年", "value": "12.34%"},
    {"period": "近2年", "value": "20.00%"},
    {"period": "近3年", "value": "30.00%"},
    {"period": "近5年", "value": "50.00%"},
    {"period": "今年来", "value": "6.78%"},
    {"period": "成立来", "value": "100.00%"}
  ]
}
```

---

### 3.12 检查基金持仓状态

```
GET /api/funds/check/{fund_code}
```

- **认证：** 需要
- **路径参数：** `fund_code` (string)
- **响应 `200`：**

```json
{
  "is_held": true,
  "fund_code": "000001",
  "fund_name": "华夏成长混合",
  "shares": 10000.0,
  "cost_price": 1.5,
  "total_revenue": 500.0,
  "profit_loss_ratio": 3.33,
  "change_rate": "1.23%",
  "nav_updated": true
}
```

> 轻量级接口，仅发1次外部请求。适用于搜索结果页/基金详情页判断是否已持有。

---

### 3.13 基金交易记录

```
GET /api/funds/{fund_code}/transactions
```

- **认证：** 需要
- **路径参数：** `fund_code` (string)
- **响应 `200`：** `List[Transaction]`

```json
[
  {
    "id": 1,
    "user_id": 1,
    "fund_code": "000001",
    "fund_name": "华夏成长混合",
    "transaction_type": "buy",
    "shares": 1000.0,
    "price": 1.5,
    "transaction_date": "2026-01-01T00:00:00Z",
    "created_at": "2026-01-01T00:00:00Z"
  }
]
```

---

### 3.14 持仓板块分布

```
GET /api/funds/sector-distribution
```

- **认证：** 需要
- **限流：** 10次/分钟
- **响应 `200`：** `SectorDistribution`

```json
{
  "total_value": 50000.0,
  "sectors": [
    {"sector_code": "BK0001", "sector_name": "新能源", "value": 20000.0, "percentage": 40.0},
    {"sector_code": "BK0002", "sector_name": "消费", "value": 15000.0, "percentage": 30.0}
  ]
}
```

---

## 四、自选基金模块 `/api/watchlist`

### 4.1 获取自选列表

```
GET /api/watchlist/
```

- **认证：** 需要
- **限流：** 15次/分钟
- **响应 `200`：** `List[WatchlistItem]`

```json
[
  {
    "id": 1,
    "fund_code": "000001",
    "fund_name": "华夏成长混合",
    "cost_nav": 1.50,
    "added_at": "2026-05-01T00:00:00Z",
    "is_holding": true,
    "current_nav": 1.55,
    "change_rate": "1.23%",
    "total_change_rate": 3.33,
    "nav_updated": true
  }
]
```

| 字段 | 说明 |
|------|------|
| `cost_nav` | 加入自选时的净值 |
| `is_holding` | 是否在持仓中 |
| `total_change_rate` | 加入自选以来涨跌幅(%) |
| `nav_updated` | 今日实际净值是否已更新 |

---

### 4.2 添加自选

```
POST /api/watchlist/
```

- **认证：** 需要
- **请求体：**

```json
{
  "fund_code": "000001",
  "fund_name": "华夏成长混合"
}
```

- **响应 `200`：** 返回 `WatchlistItem`
- **错误：** `400` 该基金已在自选列表中

---

### 4.3 移除自选

```
DELETE /api/watchlist/{watchlist_id}
```

- **认证：** 需要
- **路径参数：** `watchlist_id` (int)
- **响应 `200`：**

```json
{"message": "已从自选中移除"}
```

- **错误：** `404` 记录不存在

---

## 五、排行榜模块 `/api/ranking`

> 以下接口均为**公开**，无需登录。

### 5.1 排行榜列表

```
GET /api/ranking/
```

- **限流：** 20次/分钟
- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 可选值 |
|------|------|------|------|--------|
| `type` | string | 否 | `day` | `day` / `week` / `month` / `year` / `ytd` |
| `page` | int | 否 | 1 | >= 1 |
| `page_size` | int | 否 | 20 | 1-100 |
| `desc` | bool | 否 | true | true=降序(涨幅榜)，false=升序(跌幅榜) |

- **响应 `200`：**

```json
{
  "rankingType": "day",
  "page": 1,
  "pageSize": 20,
  "total": 100,
  "lastUpdate": "2026-05-21T07:30:00Z",
  "data": [
    {
      "rank": 1,
      "fundCode": "000001",
      "fundName": "华夏成长混合",
      "ftype": "混合型",
      "company": "华夏基金",
      "change": "5.23",
      "perNav": "1.5500",
      "riskLevel": "中风险"
    }
  ]
}
```

---

### 5.2 单基金排名

```
GET /api/ranking/{fund_code}
```

- **路径参数：** `fund_code` (string)
- **响应 `200`：** 返回该基金多阶段收益率及排名信息
- **错误：** `404` 基金未找到

---

### 5.3 排行榜缓存状态

```
GET /api/ranking/status/cache
```

- **响应 `200`：** 返回 Redis 缓存状态信息

---

### 5.4 手动同步排行榜

```
POST /api/ranking/sync
```

- **认证：** 需要 sync token（特殊认证，非 JWT）
- **响应 `200`：** `{"message": "排行榜数据同步成功"}`

---

## 六、板块详情模块 `/api/sector`

> 以下接口均为**公开**，无需登录。

### 6.1 板块列表

```
GET /api/sector/
```

- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 可选值 |
|------|------|------|------|--------|
| `type` | string | 否 | `industry` | `industry`(行业) / `concept`(概念) / `all` |
| `sort` | string | 否 | `change` | `change`(涨跌幅) / `flow`(资金流) |
| `st` | string | 否 | `D` | change 模式: `D`(日) / `W`(周) / `M`(月)<br>flow 模式: `FLOW` / `FLOW_W` / `FLOW_M` |

- **响应 `200`：**

```json
{
  "type": "industry",
  "sort": "change",
  "time_range": "D",
  "total": 80,
  "data": [
    {"code": "BK0001", "name": "新能源", "value": "1234.56", "change_rate": "2.35"}
  ]
}
```

> Redis 缓存 5 分钟。

---

### 6.2 板块详情

```
GET /api/sector/{code}/detail
```

- **路径参数：** `code` (string) — 板块代码
- **响应 `200`：**

```json
{
  "code": "BK0001",
  "name": "新能源",
  "change_d": "2.35",
  "change_w": "5.10",
  "change_m": "8.20",
  "change_q": "12.00",
  "change_y": "25.00",
  "change_ytd": "15.00"
}
```

---

### 6.3 板块关联基金

```
GET /api/sector/{code}/funds
```

- **路径参数：** `code` (string)
- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 约束 |
|------|------|------|------|------|
| `page` | int | 否 | 1 | >= 1 |
| `page_size` | int | 否 | 20 | 1-50 |
| `sort` | string | 否 | `RZDF` | 排序字段 |
| `sorttype` | string | 否 | `DESC` | `DESC` / `ASC` |

- **响应 `200`：**

```json
{
  "sector_code": "BK0001",
  "total": 50,
  "page": 1,
  "page_size": 20,
  "data": [
    {
      "fundCode": "000001",
      "fundName": "华夏成长混合",
      "fundType": "混合型",
      "nav": "1.5500",
      "navDate": "2026-05-21",
      "change": "1.23",
      "changeWeek": "2.34",
      "changeMonth": "3.45",
      "change3Month": "5.67",
      "change6Month": "8.90",
      "change1Year": "12.34",
      "change2Year": "20.00",
      "change3Year": "30.00",
      "changeYtd": "6.78",
      "changeTotal": "100.00",
      "sourceRate": "1.50%",
      "rate": "0.15%",
      "relation": "0.85",
      "isBuy": "1",
      "minPurchase": "10.00"
    }
  ]
}
```

---

### 6.4 基金所属板块

```
GET /api/sector/fund/{fund_code}
```

- **路径参数：** `fund_code` (string)
- **响应 `200`：** `FundSectorResponse`

```json
{
  "fund_code": "000001",
  "sectors": [
    {"sector_code": "BK0001", "sector_name": "新能源", "relation": 0.85},
    {"sector_code": "BK0002", "sector_name": "消费", "relation": 0.60}
  ]
}
```

---

### 6.5 同步板块数据

```
POST /api/sector/sync
```

- **认证：** 无需
- **响应 `200`：**

```json
{"message": "板块同步任务已启动", "status": "started"}
```

> 异步后台执行，立即返回。

---

## 七、股市行情模块 `/api/market`

> 公开接口，无需登录。

### 7.1 股市指数行情

```
GET /api/market/indices
```

- **响应 `200`：**

```json
{
  "groups": [
    {
      "name": "A股指数",
      "items": [
        {"code": "000001", "name": "上证指数", "price": "3200.50", "change": "25.30", "change_pct": "0.80%"},
        {"code": "399001", "name": "深证成指", "price": "10500.00", "change": "-50.00", "change_pct": "-0.47%"},
        {"code": "399006", "name": "创业板指", "price": "2100.00", "change": "15.00", "change_pct": "0.72%"}
      ]
    },
    {
      "name": "港股指数",
      "items": [
        {"code": "HSI", "name": "恒生指数", "price": "19500.00", "change": "100.00", "change_pct": "0.51%"},
        {"code": "HSCEI", "name": "国企指数", "price": "6500.00", "change": "-20.00", "change_pct": "-0.31%"},
        {"code": "HSCCI", "name": "恒生综合", "price": "3800.00", "change": "10.00", "change_pct": "0.26%"}
      ]
    },
    {
      "name": "全球指数",
      "items": [
        {"code": "DJIA", "name": "道琼斯", "price": "39000.00", "change": "200.00", "change_pct": "0.51%"},
        {"code": "SPX", "name": "标普500", "price": "5200.00", "change": "15.00", "change_pct": "0.29%"},
        {"code": "NDX", "name": "纳斯达克100", "price": "18000.00", "change": "-50.00", "change_pct": "-0.28%"}
      ]
    }
  ]
}
```

> Redis 缓存 5 分钟。数据源：腾讯财经，失败时回退到东方财富。

---

## 八、热搜基金模块 `/api/hot-search`

> 公开接口，无需登录。

### 8.1 获取热搜基金

```
GET /api/hot-search/funds
```

- **响应 `200`：**

```json
{
  "data": [
    {"fund_code": "...", "fund_name": "...", "change_1y": "12.34%"}
  ],
  "last_update": "2026-05-21T07:30:00Z"
}
```

> 功能开关：`settings.HOT_SEARCH_FEATURE_ENABLED`，关闭时返回 `{"data": [], "feature_enabled": false}`。

---

## 九、建议反馈模块 `/api/feedback`

### 9.1 提交反馈

```
POST /api/feedback/
```

- **认证：** 需要
- **限流：** 5次/分钟
- **请求体：**

```json
{"content": "建议内容 (1-300字符)"}
```

- **响应 `200`：**

```json
{
  "id": 1,
  "user_id": 1,
  "content": "建议内容",
  "created_at": "2026-05-21T08:00:00Z"
}
```

---

## 十、公告模块 `/api/announcements`

> 公开接口，无需登录。

### 10.1 获取公告列表

```
GET /api/announcements/
```

- **查询参数：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `position` | int | 否 | null | 0=首页，1=关于我们 |
| `pinned` | bool | 否 | null | true=仅置顶 |

- **响应 `200`：** `List[AnnouncementOut]`

```json
[
  {
    "id": 1,
    "title": "系统升级通知",
    "content": "详细内容...",
    "display_position": 0,
    "is_pinned": true,
    "created_at": "2026-05-21T00:00:00Z"
  }
]
```

> 排序规则：置顶优先，然后按创建时间倒序。

---

## 附录：认证说明

**Token 格式：** JWT（HS256 算法），有效期 30 分钟（配置项 `ACCESS_TOKEN_EXPIRE_MINUTES`）。

**请求方式：** 在 HTTP Header 中携带：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**小程序封装：** `utils/request.js` 已自动注入 token，401 时自动跳转登录页，422 时弹出错误提示。直接使用 `get/post/put/del` 方法即可，无需手动处理 token。

**颜色规范：**
- 正收益/上涨：`#ff4d4f`（红色）
- 负收益/下跌：`#52c41a`（绿色）
