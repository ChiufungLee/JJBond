# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JJBond is a fund (mutual fund) portfolio management tool that allows users to track their fund investments. It consists of:
- **Backend**: FastAPI (Python) REST API
- **Database**: MySQL with SQLAlchemy ORM
- **Cache**: Redis for caching fund data from external APIs
- **Frontend**: WeChat Mini Program (微信小程序) in `miniprogram/`

## Commands

### Run the backend server
```bash
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8888
```

### Install dependencies
```bash
pip install fastapi uvicorn sqlalchemy pymysql pydantic-settings python-dotenv passlib bcrypt python-jose[cryptography] redis aiohttp requests beautifulsoup4 lxml
```

## Architecture

### Backend Structure
```
├── main.py              # FastAPI app entry point, registers routers
├── core/
│   ├── config.py        # Settings (DATABASE_URL, JWT, CORS) from .env
│   ├── database.py      # SQLAlchemy engine, SessionLocal, Redis client
│   └── dependencies.py  # OAuth2 authentication dependency
├── models/              # SQLAlchemy ORM models
│   ├── user.py          # User, UserFund models
│   └── base.py          # Base class for models
├── schemas/             # Pydantic request/response schemas
├── routers/             # API endpoint handlers
│   ├── auth.py          # /api/auth/* - register, login
│   ├── user.py          # /api/user/* - user management
│   └── funds.py         # /api/funds/* - CRUD, search, calculate portfolio
├── crud/                # Database CRUD operations
├── utils/
│   ├── jwt.py           # JWT token creation/verification
│   ├── password.py      # Password hashing
│   ├── fund_calculator.py    # Fetches fund data from external API, calculates portfolio
│   └── fund_data_manager.py  # Local fund data management (JSON file)
└── data/funds.json      # Local fund data cache
```

### Key Data Flow
1. **Authentication**: JWT-based, OAuth2PasswordBearer flow. Tokens via `/api/auth/login`.
2. **Fund Data**: Fetched from 天天基金 (fundgz.1234567.com.cn) external API, cached in Redis for 5-15 minutes.
3. **User Funds**: Stored in MySQL `user_funds` table (fund_code, cost_price, shares).

### API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login, returns JWT token
- `GET /api/funds/` - Get user's fund list
- `POST /api/funds/` - Add fund to portfolio
- `PUT /api/funds/{id}` - Update fund
- `DELETE /api/funds/{id}` - Delete fund
- `GET /api/funds/calculate` - Calculate portfolio summary (revenue, profit/loss)
- `GET /api/funds/search?q=keyword` - Search funds

### Environment Variables (.env)
```
DATABASE_URL=mysql+pymysql://user:pass@localhost/fund_web_db
SECRET_KEY=your-secret-key
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Mini Program

The `miniprogram/` directory contains a WeChat Mini Program frontend:
- `pages/` - Page components (login, funds list, search, etc.)
- `components/` - Reusable components (fund-card, summary-card)
- `utils/` - Request utilities, auth helpers
- `app.js` - App configuration with API base URL

API base URL is configured in `miniprogram/app.js` as `globalData.baseUrl`.
