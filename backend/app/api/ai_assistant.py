from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import google.genai as genai
from database import get_db, SessionLocal
from app.models.account import Account
from app.models.budget import Budget
from app.models.transaction import Transaction
from app.models.category import Category
from pydantic import BaseModel
from datetime import datetime, timezone
from app.services.transaction_service import create_transaction_with_splits
from app.models.iou import IOU, IOUType, IOUStatus
from app.services.privacy import mask_description

# AI bypass flag for cold load migration
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"

router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"], redirect_slashes=False)


class ChatRequest(BaseModel):
    message: str
    cash_flow_context: Optional[dict] = None  # Safe-to-Spend context from frontend (cents)
    assets_context: Optional[dict] = None  # Assets context from frontend (cents)


class FunctionCallResponse(BaseModel):
    response: str
    function_calls: Optional[List[dict]] = None
    has_mutations: bool = False


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
        Transaction.date >= datetime(current_year, current_month, 1, tzinfo=timezone.utc)
    ).all()
    
    actual_spent = sum(t.amount for t in transactions)
    remaining = budget.amount - actual_spent
    percent_used = (actual_spent / budget.amount * 100) if budget.amount > 0 else 0
    
    return {
        "category": category.name,
        "budget_amount": budget.amount,
        "actual_spent": actual_spent,
        "remaining": remaining,
        "percent_used": round(percent_used, 2)
    }


def get_account_balance(db: Session, account_name: str) -> dict:
    """Get current balance for a specific account"""
    account = db.query(Account).filter(Account.name.ilike(f"%{account_name}%")).first()
    if not account:
        return {"error": f"Cuenta '{account_name}' no encontrada"}
    
    return {
        "account_name": account.name,
        "account_type": account.account_type,
        "balance": account.balance,
        "is_active": account.is_active
    }


def get_total_balance(db: Session) -> dict:
    """Get total balance across all active checking and savings accounts"""
    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings"])
    ).all()
    
    total_balance = sum(acc.balance for acc in accounts)
    
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


# FAIL-FAST: Write capabilities removed from AI. AI is now read-only auditor.
# The following functions were removed:
# - create_expense_transaction (lines 154-191)
# - create_iou (lines 193-224)
# AI can only query and analyze data, not modify it.


@router.post("/chat")
async def chat_with_assistant(request: ChatRequest):
    """
    Chat with AI assistant using function calling.
    The assistant can call local functions to QUERY data only (READ-ONLY).
    NO WRITE OPERATIONS ALLOWED - AI is a financial auditor, not an executor.
    Bypassed during cold load migration (AI_ENABLED=false).
    """
    # Bypass AI during cold load migration
    if not AI_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="AI assistant disabled during cold load migration. Set AI_ENABLED=true to enable."
        )
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    try:
        genai.configure(api_key=api_key)
        
        # Define the tools/functions available to the AI (READ-ONLY ONLY)
        tools = [
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
                        "description": "Search for categories by keyword to obtain their integer IDs. USE THIS FIRST if you don't know the exact category ID.",
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
                        "description": "Search for bank accounts or credit cards by keyword to obtain their integer IDs. USE THIS FIRST if you don't know the exact account ID.",
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
                    }
                ]
            }
        ]
        
        system_instruction = (
            "Eres un AUDITOR FINANCIERO READ-ONLY. Tu función es CONSULTAR y ANALIZAR información financiera, "
            "NO tienes permiso para CREAR, MODIFICAR o ELIMINAR ningún registro (transacciones, cuentas, presupuestos, IOUs). "
            "Si el usuario te pide registrar un gasto o crear una transacción, debes NEGARTE EDUCADAMENTE y explicarle que "
            "como auditor solo puedes analizar datos existentes. "
            "Si el usuario pide buscar información, usa las herramientas de consulta provistas. "
            "Para consultas sobre Safe-to-Spend, flujo de caja o proyecciones, usa `get_cash_flow_context`. "
            "Para consultas sobre activos físicos (vehículos, equipos), usa `get_assets_context`. "
            "TU ROL: Auditor Financiero - SOLO LECTURA."
        )

        model = genai.GenerativeModel(
            "gemini-3.1-flash-lite-preview",
            tools=tools,
            system_instruction=system_instruction
        )
        
        # Function to execute tool calls (READ-ONLY ONLY)
        def execute_function_call(function_call: dict) -> dict:
            function_name = function_call.name
            args = function_call.args
            
            # Context manager ensures session is closed/returned to pool instantly after query
            with SessionLocal() as db:
                if function_name == "get_budget_status":
                    return get_budget_status(db, args["category_name"])
                elif function_name == "get_account_balance":
                    return get_account_balance(db, args["account_name"])
                elif function_name == "get_total_balance":
                    return get_total_balance(db)
                elif function_name == "search_categories":
                    return search_categories(db, args["keyword"])
                elif function_name == "search_accounts":
                    return search_accounts(db, args["keyword"])
                elif function_name == "get_cash_flow_context":
                    return get_cash_flow_context(request.cash_flow_context or {})
                elif function_name == "get_assets_context":
                    return get_assets_context(request.assets_context or {})
                else:
                    return {"error": f"Unknown function: {function_name}"}
        
        # Start the conversation
        chat = model.start_chat()
        
        # Sanitize user message to remove PII before sending to AI
        sanitized_message = mask_description(request.message)
        
        # Send the sanitized user message
        response = chat.send_message(sanitized_message)
        
        function_calls_made = []
        
        # Handle function calls
        # We need a loop in case the model wants to call multiple functions sequentially (like searching, then creating)
        max_turns = 3
        turn = 0
        
        while response.candidates and response.candidates[0].content.parts and response.candidates[0].content.parts[0].function_call and turn < max_turns:
            function_call = response.candidates[0].content.parts[0].function_call
            function_calls_made.append({
                "name": function_call.name,
                "args": dict(function_call.args)
            })
            
            # Execute the function
            function_result = execute_function_call(function_call)
            
            # Send the function result back
            response = chat.send_message(
                genai.protos.FunctionResponse(
                    name=function_call.name,
                    response=function_result
                )
            )
            turn += 1
            
        # FAIL-FAST: No mutation tracking needed since AI is read-only
        return {
            "response": response.text,
            "function_calls": function_calls_made if function_calls_made else None,
            "has_mutations": False  # Always false - AI is read-only
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in AI assistant: {str(e)}")
