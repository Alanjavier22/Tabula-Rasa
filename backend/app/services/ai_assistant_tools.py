"""
Herramientas de solo lectura (function-calling de Gemini) para el endpoint
POST /ai-assistant/chat. Cada función responde una pregunta puntual sobre el
estado financiero; el asistente decide cuáles invocar según la conversación.

AI_ASSISTANT_TOOL_DECLARATIONS es el schema que se le pasa a Gemini y debe
mantenerse en sync con las funciones de este módulo: agregar una tool nueva
implica agregar la función Y su declaración acá.
"""
from typing import List, cast
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.account import Account
from app.models.budget import Budget
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.import_log import ImportLog


def get_budget_status(db: Session, category_name: str) -> dict:
    """Get budget status for a specific category"""
    category = db.query(Category).filter(Category.name.ilike(f"%{category_name}%")).first()
    if not category:
        return {"error": f"Categoría '{category_name}' no encontrada"}

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    budget = db.query(Budget).filter(
        Budget.category_id == category.id,
        Budget.month == current_month,
        Budget.year == current_year
    ).first()

    if not budget:
        return {"error": f"No hay presupuesto configurado para '{category.name}' este mes"}

    # Calculate actual spending for this category this month
    transactions = db.query(Transaction).filter(
        Transaction.category_id == category.id,
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= datetime(current_year, current_month, 1, tzinfo=timezone.utc)
    ).all()

    actual_spent = cast(int, sum(t.amount for t in transactions))
    budget_amt = cast(int, budget.amount)
    remaining = budget_amt - actual_spent
    percent_used = (actual_spent / budget_amt * 100) if budget_amt > 0 else 0

    return {
        "category": str(category.name),
        "budget_amount": budget_amt,
        "actual_spent": actual_spent,
        "remaining": remaining,
        "percent_used": round(percent_used, 2)
    }


def get_all_budgets_status(db: Session) -> dict:
    """Get budget status for all categories this month"""
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    budgets = db.query(Budget).filter(
        Budget.month == current_month,
        Budget.year == current_year
    ).all()

    results = []
    for b in budgets:
        # Calculate actual spending for this category
        transactions = db.query(Transaction).filter(
            Transaction.category_id == b.category_id,
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= datetime(current_year, current_month, 1, tzinfo=timezone.utc)
        ).all()
        actual_spent = cast(int, sum(t.amount for t in transactions))
        budget_amt = cast(int, b.amount)
        results.append({
            "category": b.category.name if b.category else "Unknown",
            "budget_amount": budget_amt,
            "actual_spent": actual_spent,
            "remaining": budget_amt - actual_spent,
            "percent_used": round(actual_spent / budget_amt * 100, 2) if budget_amt > 0 else 0
        })
    return {"budgets": results}


def get_account_balance(db: Session, account_name: str) -> dict:
    """Get current balance for a specific account"""
    account = db.query(Account).filter(Account.name.ilike(f"%{account_name}%")).first()
    if not account:
        return {"error": f"Cuenta '{account_name}' no encontrada"}

    return {
        "account_name": str(account.name),
        "account_type": str(account.account_type),
        "balance": cast(int, account.balance),
        "is_active": bool(account.is_active)
    }


def get_total_balance(db: Session) -> dict:
    """Get total balance across all active checking and savings accounts"""
    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings"])
    ).all()

    total_balance = cast(int, sum(acc.balance for acc in accounts))

    return {
        "total_balance": total_balance,
        "account_count": len(accounts)
    }


def search_categories(db: Session, keyword: str) -> dict:
    """Search for categories by name to get their IDs"""
    try:
        categories = db.query(Category).filter(Category.name.ilike(f"%{keyword}%")).all()
        if not categories:
            return {"error": f"No se encontraron categorías coincidiendo con '{keyword}'"}
        return {"results": [{"id": cat.id, "name": cat.name} for cat in categories]}
    except Exception as e:
        return {"error": f"Error buscando categorías: {str(e)}"}


def search_accounts(db: Session, keyword: str) -> dict:
    """Search for accounts by name to get their IDs"""
    try:
        accounts = db.query(Account).filter(Account.name.ilike(f"%{keyword}%")).all()
        if not accounts:
            return {"error": f"No se encontraron cuentas coincidiendo con '{keyword}'"}
        return {"results": [{"id": acc.id, "name": acc.name, "type": acc.account_type} for acc in accounts]}
    except Exception as e:
        return {"error": f"Error buscando cuentas: {str(e)}"}


def get_cash_flow_context(cash_flow_data: dict) -> dict:
    """Get Safe-to-Spend context from frontend (already in cents, pre-sanitized)"""
    try:
        return {
            "current_balance_cents": cash_flow_data.get("current_balance_cents", 0),
            "safe_to_spend_30d": cash_flow_data.get("safe_to_spend_30d", 0),
            "safe_to_spend_60d": cash_flow_data.get("safe_to_spend_60d", 0),
            "safe_to_spend_90d": cash_flow_data.get("safe_to_spend_90d", 0),
            "projected_income_30d": cash_flow_data.get("projected_income_30d", 0),
            "projected_expenses_30d": cash_flow_data.get("projected_expenses_30d", 0),
            "seasonal_adjustment_30d": cash_flow_data.get("seasonal_adjustment_30d", 0),
            "subscriptions_due_30d": cash_flow_data.get("subscriptions_due_30d", 0),
            "ious_pending_30d": cash_flow_data.get("ious_pending_30d", 0),
        }
    except Exception as e:
        return {"error": f"Error obteniendo contexto cash flow: {str(e)}"}


def get_assets_context(assets_data: dict) -> dict:
    """Get assets context from frontend (current values in cents)"""
    try:
        return {
            "assets_total_value_cents": assets_data.get("assets_total_value_cents", 0),
            "assets_details": assets_data.get("assets_details", []),
        }
    except Exception as e:
        return {"error": f"Error obteniendo contexto assets: {str(e)}"}


def get_import_history(db: Session, limit: int = 10) -> List[dict]:
    """Get the recent history of imported files and statements"""
    logs = db.query(ImportLog).order_by(ImportLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "filename": log.filename,
            "account_id": log.account_id,
            "imported_count": log.imported_count,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "issuer_identity": log.issuer_identity
        }
        for log in logs
    ]


def get_monthly_summary(db: Session, month: int, year: int) -> dict:
    """Get a summary of income, expenses and categories for a specific month/year"""
    try:
        month_str = f"{year:04d}-{month:02d}"
        transactions = db.query(Transaction).filter(
            Transaction.date.like(f"{month_str}%"),
            Transaction.is_deleted == False
        ).all()

        if not transactions:
            return {"error": f"No hay transacciones registradas para {month:02d}/{year}"}

        income = sum(t.amount for t in transactions if t.transaction_type == 'income')
        expenses = sum(t.amount for t in transactions if t.transaction_type == 'expense')

        # Group by category name
        category_cache = {}
        expense_by_cat = {}
        for t in transactions:
            if t.transaction_type == 'expense':
                if t.category_id not in category_cache:
                    cat = db.query(Category).filter(Category.id == t.category_id).first()
                    category_cache[t.category_id] = cat.name if cat else "Sin Categoría"
                cname = category_cache[t.category_id]
                expense_by_cat[cname] = expense_by_cat.get(cname, 0) + t.amount

        return {
            "month": month,
            "year": year,
            "total_income_cents": income,
            "total_expenses_cents": expenses,
            "net_balance_cents": income - expenses,
            "expenses_by_category_cents": expense_by_cat
        }
    except Exception as e:
        return {"error": f"Error obteniendo resumen mensual: {str(e)}"}


def get_active_goals(db: Session) -> dict:
    """Get a list of all active financial goals and their progress"""
    from app.models.goal import Goal, GoalStatus
    goals = db.query(Goal).filter(Goal.status == GoalStatus.ACTIVE, Goal.is_deleted == False).all()
    return {
        "goals": [
            {
                "id": g.id,
                "name": g.name,
                "target_amount": cast(int, g.target_amount),
                "current_amount": cast(int, g.current_amount),
                "progress_pct": round(cast(int, g.current_amount) / cast(int, g.target_amount) * 100, 2) if cast(int, g.target_amount) > 0 else 0,
                "target_date": g.target_date.isoformat() if g.target_date else None
            } for g in goals
        ]
    }


def get_upcoming_reminders(db: Session, days_ahead: int = 30) -> dict:
    """Get reminders due within the next N days"""
    from app.models.reminder import Reminder, ReminderStatus
    from datetime import timedelta
    end_date = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    reminders = db.query(Reminder).filter(
        Reminder.due_date <= end_date,
        Reminder.status == ReminderStatus.PENDING,
        Reminder.is_deleted == False
    ).all()
    return {
        "reminders": [
            {
                "id": r.id,
                "name": r.name,
                "amount": r.amount,
                "due_date": r.due_date.isoformat(),
                "frequency": r.frequency.value
            } for r in reminders
        ]
    }


def get_active_subscriptions(db: Session) -> dict:
    """Get a list of all active subscriptions and their costs"""
    from app.models.subscription import Subscription
    subs = db.query(Subscription).filter(Subscription.is_active == True, Subscription.is_deleted == False).all()
    return {
        "subscriptions": [
            {
                "id": s.id,
                "name": s.name,
                "amount": s.amount,
                "frequency": s.frequency.value,
                "next_billing": s.next_billing_date.isoformat() if s.next_billing_date else None
            } for s in subs
        ]
    }


def get_debt_summary(db: Session) -> dict:
    """Get summary of IOUs and Debt Shares (who owes whom)"""
    from app.models.iou import IOU, IOUStatus
    from app.models.debt_share import DebtShare

    ious = db.query(IOU).filter(IOU.status == IOUStatus.PENDING).all()
    debt_shares = db.query(DebtShare).filter(DebtShare.status == "pending").all()

    return {
        "ious": [
            {"id": i.id, "person": i.person_name, "amount": i.amount, "type": i.iou_type.value}
            for i in ious
        ],
        "debt_shares": [
            {"id": d.id, "person": d.person_name, "amount": d.amount, "description": d.description}
            for d in debt_shares
        ]
    }


def get_net_worth_history(db: Session, limit: int = 12) -> dict:
    """Get historical net worth snapshots to analyze trends"""
    from app.models.net_worth_snapshot import NetWorthSnapshot
    snapshots = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_deleted == False
    ).order_by(NetWorthSnapshot.year.desc(), NetWorthSnapshot.month.desc()).limit(limit).all()

    return {
        "history": [
            {
                "period": f"{s.year}-{s.month:02d}",
                "net_worth": s.net_worth,
                "assets": s.total_assets,
                "liabilities": s.total_liabilities
            } for s in snapshots
        ]
    }


def get_credit_card_details(db: Session) -> dict:
    """Get detailed information about credit card statements and cut-off dates"""
    from app.models.credit_card_statement import CreditCardStatement
    from app.models.account import Account

    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.is_deleted == False,
        CreditCardStatement.status != "paid"
    ).all()

    results = []
    for s in statements:
        acc = db.query(Account).filter(Account.id == s.account_id).first()
        results.append({
            "card_name": acc.name if acc else "Unknown",
            "statement_balance": s.statement_balance,
            "user_share": s.user_share,
            "amount_paid": s.amount_paid,
            "due_date": s.payment_due_date.isoformat() if s.payment_due_date else None,
            "cut_off_date": s.cut_off_date.isoformat() if s.cut_off_date else None,
            "status": s.status.value if hasattr(s.status, 'value') else s.status
        })
    return {"active_statements": results}


def get_audit_report(db: Session) -> dict:
    """Get a summary of the current data quality (duplicates, SRI classification)"""
    from app.models.transaction import Transaction

    total = db.query(Transaction).filter(Transaction.is_deleted == False).count()
    unclassified_sri = db.query(Transaction).filter(
        Transaction.is_deleted == False,
        Transaction.sri_category == None
    ).count()

    potential_duplicates = db.query(Transaction).filter(
        Transaction.is_deleted == False,
        Transaction.audit_status == "duplicate"
    ).count()

    return {
        "total_transactions": total,
        "sri_coverage_pct": round((total - unclassified_sri) / total * 100, 2) if total > 0 else 0,
        "duplicate_candidates_count": potential_duplicates
    }


def get_duplicate_transactions(db: Session) -> dict:
    """List transactions marked as potential duplicates for review"""
    txns = db.query(Transaction).filter(
        Transaction.is_deleted == False,
        Transaction.audit_status == "duplicate"
    ).order_by(Transaction.date.desc()).limit(15).all()

    return {
        "duplicates": [
            {
                "id": t.id,
                "date": t.date.isoformat(),
                "description": t.description,
                "amount": t.amount,
                "category": t.category.name if t.category else "None"
            } for t in txns
        ]
    }


def get_recent_transactions(db: Session, limit: int = 15) -> dict:
    """Get the most recent transactions to understand current spending context"""
    txns = db.query(Transaction).filter(
        Transaction.is_deleted == False
    ).order_by(Transaction.date.desc()).limit(limit).all()

    return {
        "transactions": [
            {
                "date": t.date.isoformat(),
                "description": t.description,
                "amount": t.amount,
                "type": t.transaction_type.value,
                "category": t.category.name if t.category else "None"
            } for t in txns
        ]
    }


def get_fiscal_summary(db: Session) -> dict:
    """Get current fiscal/tax projections (IVA, Retenciones) for SRI compliance"""
    from app.api.fiscal import get_fiscal_report
    from datetime import date, timedelta

    # Current month range
    today = date.today()
    start_date = today.replace(day=1).isoformat()
    # End of month
    if today.month == 12:
        end_date = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end_date = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    end_date = end_date.isoformat()

    report = get_fiscal_report(start_date, end_date, category_ids=None, db=db)
    return {
        "period": f"{start_date} to {end_date}",
        "total_income": float(report.totals.total_income),
        "total_expenses": float(report.totals.total_expenses),
        "iva_projected": float(report.totals.iva_projected),
        "retencion_projected": float(report.totals.retencion_projected),
        "tax_burden_estimate": float(report.totals.iva_projected - report.totals.retencion_projected)
    }


async def get_financial_executive_summary(db: Session, api_key: str) -> dict:
    """
    Get a 360-degree executive summary of the entire financial state.
    Includes Net Worth, Runway, Liquidity, Sentinel Health, and Projections.
    This is the highest-level 'consciousness' tool for the AI.
    """
    from app.services.sentinel_service import SentinelService
    from app.services.forecaster import get_financial_projection
    from app.services.insights_builders import _build_liquidity_summary

    sentinel = SentinelService(db, api_key)
    health_report = await sentinel.generate_health_report()
    projection = get_financial_projection(db, months=3)
    liquidity = _build_liquidity_summary(db)

    return {
        "health_score": health_report.get("health_score"),
        "status_summary": health_report.get("status_summary"),
        "runway_months": projection.get("runway_months"),
        "net_liquid_cents": liquidity.get("net_liquid"),
        "top_concerns": health_report.get("top_concerns"),
        "recommended_action": health_report.get("recommended_action"),
        "projected_balance_3_months": cast(int, projection["timeline"][-1]["projected_balance"]) if projection.get("timeline") else 0
    }


async def get_sentinel_health(db: Session, api_key: str) -> dict:
    """Get the latest health report and warnings from the Sentinel Agent"""
    from app.services.sentinel_service import SentinelService
    sentinel = SentinelService(db, api_key)
    return await sentinel.generate_health_report()


# Schema de function-calling que se le pasa a Gemini (client.chats.create).
# Debe mantenerse en sync con las funciones de arriba: el nombre acá es el
# que llega en `function_call.name` y se resuelve contra el dispatch table
# construido en api/ai_assistant.py.
AI_ASSISTANT_TOOL_DECLARATIONS = [
    {
        "function_declarations": [
            {
                "name": "get_budget_status",
                "description": "Get the budget status for a specific category including budget amount, actual spent, and remaining",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category_name": {
                            "type": "string",
                            "description": "The name of the category (e.g., 'Comida', 'Transporte')"
                        }
                    },
                    "required": ["category_name"]
                }
            },
            {
                "name": "get_all_budgets_status",
                "description": "Get budget status for ALL categories this month. Useful for a bird's eye view of spending.",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_import_history",
                "description": "Get the history of imported statements and CSV files. Use this to answer questions about when data was added or from which bank/card.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of recent imports to fetch (default 10)"
                        }
                    }
                }
            },
            {
                "name": "get_account_balance",
                "description": "Get the current balance for a specific account",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "account_name": {
                            "type": "string",
                            "description": "The name of the account (e.g., 'Banco Principal', 'Ahorros')"
                        }
                    },
                    "required": ["account_name"]
                }
            },
            {
                "name": "get_total_balance",
                "description": "Get the total balance across all checking and savings accounts",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "search_categories",
                "description": "Search for categories by keyword to obtain their UUID IDs. USE THIS FIRST if you don't know the exact category ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "keyword": {
                            "type": "string",
                            "description": "A keyword to search for, e.g., 'restaurante' or 'supermercado'"
                        }
                    },
                    "required": ["keyword"]
                }
            },
            {
                "name": "search_accounts",
                "description": "Search for bank accounts or credit cards by keyword to obtain their UUID IDs. USE THIS FIRST if you don't know the exact account ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "keyword": {
                            "type": "string",
                            "description": "A keyword to search for, e.g., 'tarjeta' or 'ahorros'"
                        }
                    },
                    "required": ["keyword"]
                }
            },
            {
                "name": "get_cash_flow_context",
                "description": "Get Safe-to-Spend context including current balance and 30/60/90 day projections. All values in cents.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "get_assets_context",
                "description": "Get physical assets context including total current value and individual asset details (purchase price, current value, depreciation status). All values in cents.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "get_monthly_summary",
                "description": "Get a historical summary of income, expenses, and top categories for a specific month and year. Useful when user asks about past performance (e.g., 'how did I do in April'). All values in cents.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": {
                            "type": "integer",
                            "description": "Month number (1-12)"
                        },
                        "year": {
                            "type": "integer",
                            "description": "Full year (e.g., 2026)"
                        }
                    },
                    "required": ["month", "year"]
                }
            },
            {
                "name": "get_active_goals",
                "description": "Get a list of all active financial goals and their progress",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_upcoming_reminders",
                "description": "Get reminders due within the next 30 days",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days_ahead": {"type": "integer", "description": "Number of days ahead to look (default 30)"}
                    }
                }
            },
            {
                "name": "get_active_subscriptions",
                "description": "Get a list of all active subscriptions and their costs",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_debt_summary",
                "description": "Get summary of IOUs and Debt Shares (who owes whom)",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_net_worth_history",
                "description": "Get historical net worth snapshots to analyze trends (limit 12 months by default)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "Number of months to look back"}
                    }
                }
            },
            {
                "name": "get_credit_card_details",
                "description": "Get detailed information about credit card statements and cut-off dates",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_audit_report",
                "description": "Get a summary of the current data quality (duplicates count, SRI classification %)",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_duplicate_transactions",
                "description": "List the specific transactions marked as potential duplicates for review",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_recent_transactions",
                "description": "Get the most recent 15-20 transactions to understand current spending patterns",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "Number of transactions to fetch (default 15)"}
                    }
                }
            },
            {
                "name": "get_fiscal_summary",
                "description": "Get current fiscal/tax summary including projected IVA and retenciones for the current month",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_sentinel_health",
                "description": "Get the latest health report, score and warnings from the Sentinel Agent orchestrator",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_financial_executive_summary",
                "description": "Get a 360-degree executive summary including net worth trends, runway (months of life), liquidity, sentinel score, and 3-month projections. USE THIS for strategic financial advice questions.",
                "parameters": {"type": "object", "properties": {}}
            }
        ]
    }
]
