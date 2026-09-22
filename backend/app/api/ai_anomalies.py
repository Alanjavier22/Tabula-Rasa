"""
Auditoría forense asistida por IA: suscripciones zombie y picos de gasto
sobre 6 meses de historial. Se monta bajo /api/ai vía api/ai.py.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Annotated, List, Optional, Any, cast
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session
from database import get_db
from app.models.transaction import Transaction
from app.services.ai_models import REASONING_MODEL
from app.services.ai_prompts import get_current_time_context, CORE_RULES
from app.api.ai_shared import get_gemini_key, call_gemini_json, CategoryInput, TransactionInput

router = APIRouter()


class ZombieSubscription(BaseModel):
    description: str
    merchant_name: Optional[str] = None # Deducido por IA
    estimated_amount: int
    confidence: float
    reasoning: str


class SpendingSpike(BaseModel):
    category_id: str
    normal_average: int
    current_spike: int
    percent_deviation: float # e.g. 400.0
    reasoning: str


class AnomalyScanRequest(BaseModel):
    transactions: List[TransactionInput]
    subscriptions: List[dict]
    categories: Optional[List[CategoryInput]] = None
    goals: Optional[List[dict]] = None


class AnomalyScanResponse(BaseModel):
    zombie_subscriptions: List[ZombieSubscription]
    spending_spikes: List[SpendingSpike]


def _build_transaction_histories(all_txns: list[Transaction]) -> tuple[dict, dict]:
    cat_history = defaultdict(list)
    desc_history = defaultdict(list)
    for transaction in all_txns:
        cat_history[transaction.category_id].append(transaction.amount)
        desc_history[transaction.description.lower()].append(transaction.amount)
    cat_baselines = {
        category_id: sum(amounts) / len(amounts)
        for category_id, amounts in cat_history.items()
        if len(amounts) > 1
    }
    return cat_baselines, desc_history


def _build_price_hikes(desc_history: dict) -> list[str]:
    price_hikes = []
    for description, prices in desc_history.items():
        if len(prices) < 2:
            continue
        previous_price, last_price = prices[-2:]
        if last_price > previous_price * 1.05:
            price_hikes.append(
                f"- INCREMENTO DETECTADO: '{description}' subió de "
                f"${previous_price/100:,.2f} a ${last_price/100:,.2f}."
            )
    return price_hikes


def _build_audit_evidence(request: AnomalyScanRequest, cat_baselines: dict) -> list[str]:
    cat_lookup = {cat.id: cat.name for cat in (request.categories or [])}
    evidence = []
    for transaction in request.transactions:
        safe_category_id = transaction.category_id or "Uncategorized"
        baseline = cat_baselines.get(cast(Any, safe_category_id), 0)
        if baseline > 0 and transaction.amount > baseline * 1.8:
            evidence.append(
                f"- PICO EN {cat_lookup.get(safe_category_id, 'Categoría')}: "
                f"${transaction.amount/100:,.2f} "
                f"(Promedio 6 meses: ${baseline/100:,.2f})"
            )
        evidence.append(
            f"CHECK_SEMANTIC: Desc='{transaction.description}' "
            f"Cat='{cat_lookup.get(safe_category_id, 'Sin Categoría')}'"
        )
    return evidence


def _build_zombie_leads(request: AnomalyScanRequest, desc_history: dict) -> list[str]:
    zombie_leads = []
    for description, amounts in desc_history.items():
        if len(amounts) < 3:
            continue
        is_subscription = any(
            description in subscription.get('name', '').lower()
            for subscription in request.subscriptions
        )
        if not is_subscription:
            zombie_leads.append(
                f"- POSIBLE ZOMBIE: '{description}' detectado por 3 meses consecutivos "
                f"(${amounts[-1]/100:,.2f})."
            )
    return zombie_leads


@router.post("/scan-anomalies", response_model=AnomalyScanResponse)
async def scan_anomalies(
    request: AnomalyScanRequest,
    db: Annotated[Session, Depends(get_db)]
):
    """
    AI-powered Forensic Audit v4.0: Deep SQL History (6 months) + Price Spike Detection.
    """
    api_key = get_gemini_key(db)
    six_months_ago = datetime.now() - timedelta(days=180)

    # FETCH DEEP HISTORY: Get 6 months of data directly from DB
    all_txns = db.query(Transaction).filter(
        Transaction.date >= six_months_ago.strftime("%Y-%m-%d"),
        Transaction.is_deleted == False
    ).order_by(Transaction.date.asc()).all()

    cat_baselines, desc_history = _build_transaction_histories(all_txns)
    price_hikes = _build_price_hikes(desc_history)
    audit_evidence = _build_audit_evidence(request, cat_baselines)
    zombie_leads = _build_zombie_leads(request, desc_history)

    system_prompt = f"""{get_current_time_context()}
{CORE_RULES}

You are the 'Sovereign Financial Auditor'. Your mission is to perform a HIGH-INTEGRITY forensic analysis.

EVIDENCIAS MATEMÁTICAS (6 MESES):
{chr(10).join(audit_evidence[:30])}

ALZAS DE PRECIOS Y REPETICIONES:
{chr(10).join(price_hikes)}
{chr(10).join(zombie_leads)}

STRICT BUSINESS LOGIC & INTELLIGENCE:
1. DISCARD NONSENSE: If an evidence looks like a SALARY (high amount, 'S.A.', 'Viamatica', 'Payroll'), DISCARD IT. Salaries are NOT subscriptions.
2. DISCARD NOISE: Ignore any 'IVA' or tax-only charges under $5.00.
3. DEDUCE WITH CAUTION: Only provide a 'merchant_name' if you are 95% certain based on the string.
4. CRITICAL THINKING: You have the power to IGNORE any mathematical evidence if, as a senior auditor, you deem it irrelevant or a false positive.
5. 'spending_spikes': Only report spikes that represent UNUSUAL behavior.
6. 'zombie_subscriptions': Only report recurring expenses that look like LEAKED money (Streaming, Apps, Gyms, Services).

Output in SPANISH. Be elegant, brief, and highly strategic.
"""

    anomalies = await call_gemini_json(system_prompt, api_key, response_schema=AnomalyScanResponse, model=REASONING_MODEL)
    return anomalies
