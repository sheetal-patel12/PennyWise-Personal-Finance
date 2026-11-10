# Personal Expense & Subscription Tracker

A full-stack personal finance tracker built with React + Vite, Flask, SQLAlchemy, and MySQL.
It also runs locally with SQLite if no MySQL connection is configured. Optional Google Gemini integration provides AI spending insights.

## Features
- Register, login, and JWT-protected API
- Add, edit, delete, and filter income/expense transactions
- Expense categories and monthly summaries
- Monthly budget creation and budget status
- Subscription tracking with next renewal dates
- Dashboard with totals and category breakdown
- Optional Gemini-powered spending insights
- Responsive React interface

## Requirements
- Python 3.10+
- Node.js 18+
- MySQL 8 (optional for first run; SQLite is used by default)

## 1. Backend setup (Windows CMD)
```cmd
cd backend
py -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```
Edit `backend\.env`:
- For SQLite, leave `DATABASE_URL` as-is.
- For MySQL, create a database named `expense_tracker`, then set:
  `DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/expense_tracker`
- Add your Gemini key to `GEMINI_API_KEY` if you want AI insights. Never share this key or commit `.env`.

Start backend:
```cmd
python app.py
```
Backend: http://127.0.0.1:5000
Health check: http://127.0.0.1:5000/api/health

## 2. Frontend setup (new CMD window)
```cmd
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## Demo mode
Register an account from the UI. The app stores your own records in the configured database.
If Gemini is not configured, the AI insights endpoint returns a helpful rule-based analysis so the rest of the app still works.

## API overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET|POST /api/transactions`
- `PUT|DELETE /api/transactions/<id>`
- `GET|POST /api/budgets`
- `GET|POST /api/subscriptions`
- `PUT|DELETE /api/subscriptions/<id>`
- `POST /api/ai/insights`

## Security notes
- Set a long random `SECRET_KEY` before deployment.
- Keep `.env` private.
- Use HTTPS in production.
- This is a learning/portfolio project, not financial, tax, or investment advice.
