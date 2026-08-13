"""
Categorización de transacciones asistida por IA. Se monta bajo /api/ai
vía api/ai.py.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
from database import get_db
from app.services.ai_prompts import get_current_time_context, CORE_RULES
from app.api.ai_shared import get_gemini_key, call_gemini_json, CategoryInput, TransactionInput

router = APIRouter()


class SuggestionRequest(BaseModel):
    transactions: List[TransactionInput]
    categories: List[CategoryInput]


class CategorySuggestion(BaseModel):
    transaction_id: str
    suggested_category_id: str
    confidence: float
    reasoning: str


@router.post("/suggest-categories", response_model=List[CategorySuggestion])
async def suggest_categories(
    request: SuggestionRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered transaction categorization with Human-in-the-Loop safety.
    """
    api_key = get_gemini_key(db)

    category_context = "\n".join([f"- {cat.id}: {cat.name}" for cat in request.categories])
    transaction_context = "\n".join([f"ID: {txn.id} | Description: {txn.description} | Amount: {txn.amount}" for txn in request.transactions])

    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are a financial transaction categorizer. Your task is to classify transactions into the provided categories.

AVAILABLE CATEGORIES (use ONLY these IDs):
{category_context}

STRICT RULES:
1. You MUST return ONLY category IDs from the list above.
2. Confidence score (0.0 to 1.0) based on description clarity.
3. Return valid JSON array.

TRANSACTIONS TO CLASSIFY:
{transaction_context}
"""
    suggestions = await call_gemini_json(system_prompt, api_key, response_schema=List[CategorySuggestion])
    return suggestions
