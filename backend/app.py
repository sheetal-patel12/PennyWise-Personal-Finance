import os
from datetime import datetime, date
from calendar import monthrange
from collections import defaultdict

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()
app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///expense_tracker.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * 24 * 7

CORS(app, resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")}})
db = SQLAlchemy(app)
jwt = JWTManager(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    kind = db.Column(db.String(20), nullable=False)  # expense or income
    category = db.Column(db.String(60), nullable=False)
    txn_date = db.Column(db.Date, nullable=False, default=date.today)
    note = db.Column(db.String(500), default="")


class Budget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    category = db.Column(db.String(60), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    month = db.Column(db.String(7), nullable=False)  # YYYY-MM


class Subscription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    billing_cycle = db.Column(db.String(20), nullable=False, default="Monthly")
    next_renewal = db.Column(db.Date, nullable=False)
    category = db.Column(db.String(60), default="Entertainment")
    active = db.Column(db.Boolean, default=True)


def current_user_id():
    return int(get_jwt_identity())


def error(message, status=400):
    return jsonify({"error": message}), status


def transaction_json(t):
    return {
        "id": t.id, "title": t.title, "amount": t.amount, "kind": t.kind,
        "category": t.category, "date": t.txn_date.isoformat(), "note": t.note or ""
    }


def subscription_json(s):
    return {
        "id": s.id, "name": s.name, "amount": s.amount,
        "billing_cycle": s.billing_cycle, "next_renewal": s.next_renewal.isoformat(),
        "category": s.category, "active": s.active
    }


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "message": "Expense Tracker API is running"})


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not name or not email or len(password) < 8:
        return error("Name, valid email, and password of at least 8 characters are required.")
    if User.query.filter_by(email=email).first():
        return error("An account with this email already exists.", 409)
    user = User(name=name, email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return error("Incorrect email or password.", 401)
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}})


@app.get("/api/dashboard")
@jwt_required()
def dashboard():
    uid = current_user_id()
    today = date.today()
    start = today.replace(day=1)
    txns = Transaction.query.filter_by(user_id=uid).filter(Transaction.txn_date >= start).all()
    income = sum(t.amount for t in txns if t.kind == "income")
    expenses = sum(t.amount for t in txns if t.kind == "expense")
    by_category = defaultdict(float)
    for t in txns:
        if t.kind == "expense":
            by_category[t.category] += t.amount
    subscriptions = Subscription.query.filter_by(user_id=uid, active=True).all()
    monthly_subscriptions = sum(
        s.amount * (1 if s.billing_cycle == "Monthly" else 52 / 12 if s.billing_cycle == "Weekly" else 1 / 12)
        for s in subscriptions
    )
    recent = Transaction.query.filter_by(user_id=uid).order_by(Transaction.txn_date.desc(), Transaction.id.desc()).limit(6).all()
    return jsonify({
        "month": today.strftime("%B %Y"), "income": round(income, 2),
        "expenses": round(expenses, 2), "balance": round(income-expenses, 2),
        "monthly_subscription_estimate": round(monthly_subscriptions, 2),
        "category_breakdown": [{"category": k, "amount": round(v, 2)} for k, v in by_category.items()],
        "recent_transactions": [transaction_json(t) for t in recent]
    })


@app.route("/api/transactions", methods=["GET", "POST"])
@jwt_required()
def transactions():
    uid = current_user_id()
    if request.method == "GET":
        q = Transaction.query.filter_by(user_id=uid)
        kind = request.args.get("kind")
        if kind in ("income", "expense"):
            q = q.filter_by(kind=kind)
        return jsonify([transaction_json(t) for t in q.order_by(Transaction.txn_date.desc(), Transaction.id.desc()).all()])
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    category = (data.get("category") or "").strip()
    kind = data.get("kind")
    try:
        amount = float(data.get("amount"))
        txn_date = date.fromisoformat(data.get("date") or date.today().isoformat())
    except (TypeError, ValueError):
        return error("Enter a valid amount and date.")
    if not title or not category or kind not in ("income", "expense") or amount <= 0:
        return error("Title, category, positive amount, and transaction type are required.")
    t = Transaction(user_id=uid, title=title, amount=amount, kind=kind, category=category,
                    txn_date=txn_date, note=(data.get("note") or "")[:500])
    db.session.add(t)
    db.session.commit()
    return jsonify(transaction_json(t)), 201


@app.route("/api/transactions/<int:item_id>", methods=["PUT", "DELETE"])
@jwt_required()
def transaction_detail(item_id):
    t = Transaction.query.filter_by(id=item_id, user_id=current_user_id()).first()
    if not t:
        return error("Transaction not found.", 404)
    if request.method == "DELETE":
        db.session.delete(t)
        db.session.commit()
        return jsonify({"message": "Transaction deleted."})
    data = request.get_json(silent=True) or {}
    try:
        if "amount" in data:
            t.amount = float(data["amount"])
            if t.amount <= 0: raise ValueError()
        if "date" in data: t.txn_date = date.fromisoformat(data["date"])
    except (TypeError, ValueError):
        return error("Invalid amount or date.")
    for key in ("title", "category", "note"):
        if key in data: setattr(t, key, str(data[key])[:500])
    if data.get("kind") in ("income", "expense"): t.kind = data["kind"]
    db.session.commit()
    return jsonify(transaction_json(t))


@app.route("/api/budgets", methods=["GET", "POST"])
@jwt_required()
def budgets():
    uid = current_user_id()
    if request.method == "GET":
        month = request.args.get("month", date.today().strftime("%Y-%m"))
        try:
            month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
        except ValueError:
            return error("Month must use YYYY-MM format.")
        next_month_year = month_start.year + (1 if month_start.month == 12 else 0)
        next_month_num = 1 if month_start.month == 12 else month_start.month + 1
        month_end = date(next_month_year, next_month_num, 1)
        rows = Budget.query.filter_by(user_id=uid, month=month).all()
        result = []
        for b in rows:
            spent = db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0)).filter(
                Transaction.user_id == uid, Transaction.kind == "expense",
                Transaction.category == b.category,
                Transaction.txn_date >= month_start,
                Transaction.txn_date < month_end
            ).scalar() or 0
            result.append({"id": b.id, "category": b.category, "amount": b.amount,
                           "spent": float(spent), "month": b.month})
        return jsonify(result)
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount"))
        month = data.get("month") or date.today().strftime("%Y-%m")
        datetime.strptime(month, "%Y-%m")
    except (TypeError, ValueError):
        return error("Enter a valid budget amount and month.")
    category = (data.get("category") or "").strip()
    if not category or amount <= 0: return error("Category and positive budget amount are required.")
    b = Budget.query.filter_by(user_id=uid, category=category, month=month).first()
    if b: b.amount = amount
    else:
        b = Budget(user_id=uid, category=category, amount=amount, month=month)
        db.session.add(b)
    db.session.commit()
    return jsonify({"id": b.id, "category": b.category, "amount": b.amount, "month": b.month}), 201


@app.route("/api/subscriptions", methods=["GET", "POST"])
@jwt_required()
def subscriptions():
    uid = current_user_id()
    if request.method == "GET":
        rows = Subscription.query.filter_by(user_id=uid).order_by(Subscription.next_renewal.asc()).all()
        return jsonify([subscription_json(s) for s in rows])
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount"))
        renewal = date.fromisoformat(data.get("next_renewal"))
    except (TypeError, ValueError):
        return error("Enter a valid amount and next renewal date.")
    name = (data.get("name") or "").strip()
    cycle = data.get("billing_cycle") or "Monthly"
    if not name or amount <= 0 or cycle not in ("Weekly", "Monthly", "Yearly"):
        return error("Name, positive amount, and valid billing cycle are required.")
    s = Subscription(user_id=uid, name=name, amount=amount, billing_cycle=cycle,
                     next_renewal=renewal, category=data.get("category") or "Entertainment",
                     active=bool(data.get("active", True)))
    db.session.add(s)
    db.session.commit()
    return jsonify(subscription_json(s)), 201


@app.route("/api/subscriptions/<int:item_id>", methods=["PUT", "DELETE"])
@jwt_required()
def subscription_detail(item_id):
    s = Subscription.query.filter_by(id=item_id, user_id=current_user_id()).first()
    if not s: return error("Subscription not found.", 404)
    if request.method == "DELETE":
        db.session.delete(s); db.session.commit()
        return jsonify({"message": "Subscription deleted."})
    data = request.get_json(silent=True) or {}
    try:
        if "amount" in data:
            s.amount = float(data["amount"])
            if s.amount <= 0: raise ValueError()
        if "next_renewal" in data: s.next_renewal = date.fromisoformat(data["next_renewal"])
    except (TypeError, ValueError):
        return error("Invalid amount or renewal date.")
    for key in ("name", "billing_cycle", "category"):
        if key in data: setattr(s, key, data[key])
    if "active" in data: s.active = bool(data["active"])
    db.session.commit()
    return jsonify(subscription_json(s))


@app.post("/api/ai/insights")
@jwt_required()
def ai_insights():
    uid = current_user_id()
    today = date.today()
    start = today.replace(day=1)

    txns = Transaction.query.filter_by(user_id=uid).filter(
        Transaction.txn_date >= start
    ).all()

    expenses = [t for t in txns if t.kind == "expense"]
    income = sum(t.amount for t in txns if t.kind == "income")
    total = sum(t.amount for t in expenses)

    cats = defaultdict(float)
    for t in expenses:
        cats[t.category] += t.amount

    subs = Subscription.query.filter_by(
        user_id=uid, active=True
    ).all()

    summary = {
        "month": today.strftime("%B %Y"),
        "income": round(income, 2),
        "expenses": round(total, 2),
        "savings": round(income - total, 2),
        "category_spending": dict(cats),
        "active_subscriptions": [
            {
                "name": s.name,
                "amount": s.amount,
                "cycle": s.billing_cycle
            }
            for s in subs
        ]
    }

    api_key = os.getenv("GROQ_API_KEY")

    if api_key:
        try:
            from groq import Groq

            client = Groq(api_key=api_key)

            prompt = (
                "You are a practical personal budgeting assistant. "
                "Analyze the user's monthly financial data. "
                "Give 3-5 concise, supportive and specific suggestions. "
                "Suggest ways to save money and manage subscriptions. "
                "Do not shame the user. Mention that this is general "
                "budgeting guidance, not professional financial advice. "
                "Financial data: " + str(summary)
            )

            response = client.chat.completions.create(
                model=os.getenv(
                    "GROQ_MODEL",
                    "openai/gpt-oss-20b"
                ),
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.4,
                max_tokens=600
            )

            insights = response.choices[0].message.content

            return jsonify({
                "source": "Groq AI",
                "insights": insights,
                "summary": summary
            })

        except Exception:
            app.logger.exception("Groq AI request failed")

            return jsonify({
                "source": "Rule-based fallback",
                "insights": fallback_insights(summary),
                "notice": "Groq was unavailable; showing local analysis.",
                "summary": summary
            })

    return jsonify({
        "source": "Rule-based fallback",
        "insights": fallback_insights(summary),
        "summary": summary
    })



def fallback_insights(summary):
    lines = []
    expenses = summary["expenses"]
    income = summary["income"]
    if income > 0:
        ratio = expenses / income * 100
        lines.append(f"You have used about {ratio:.1f}% of this month's recorded income on expenses.")
        if expenses > income:
            lines.append("Your recorded expenses are higher than income. Review optional spending and upcoming bills.")
        else:
            lines.append(f"Your recorded balance is ₹{summary['savings']:.2f}. Consider assigning part of it to a savings goal.")
    else:
        lines.append("Add income transactions to compare spending with your monthly income.")
    if summary["category_spending"]:
        top = max(summary["category_spending"], key=summary["category_spending"].get)
        lines.append(f"Your highest spending category is {top} (₹{summary['category_spending'][top]:.2f}). Check whether this matches your plan.")
    if summary["active_subscriptions"]:
        lines.append(f"You have {len(summary['active_subscriptions'])} active subscriptions. Review renewals and cancel services you no longer use.")
    else:
        lines.append("No active subscriptions are recorded. Add them to track renewal costs.")
    lines.append("These are general budgeting suggestions, not financial advice.")
    return "\n\n".join(lines)


with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
