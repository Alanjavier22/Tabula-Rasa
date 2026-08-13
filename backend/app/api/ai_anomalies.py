"""
Auditoría forense asistida por IA: suscripciones zombie y picos de gasto
sobre 6 meses de historial. Se monta bajo /api/ai vía api/ai.py.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional, Any, cast
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


@router.post("/scan-anomalies", response_model=AnomalyScanResponse)
async def scan_anomalies(
    request: AnomalyScanRequest,
    db: Session = Depends(get_db)
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

    # 1. CATEGORY AUDIT: Calculate real 6-month averages
    cat_history = defaultdict(list)
    for t in all_txns:
        cat_history[t.category_id].append(t.amount)

    cat_baselines = {}
    for cid, amounts in cat_history.items():
        if len(amounts) > 1:
            cat_baselines[cid] = sum(amounts) / len(amounts)

    # 2. PRICE HIKE DETECTION: Look for recurring charges that increased
    desc_history = defaultdict(list)
    for t in all_txns:
        desc_history[t.description.lower()].append(t.amount)

    price_hikes = []
    for desc, prices in desc_history.items():
        if len(prices) >= 2:
            last_price = prices[-1]
            prev_price = prices[-2]
            if last_price > prev_price * 1.05: # > 5% increase
                 price_hikes.append(f"- INCREMENTO DETECTADO: '{desc}' subió de ${prev_price/100:,.2f} a ${last_price/100:,.2f}.")

    # 3. ZOMBIE & MISCATEGORIZATION AUDIT
    cat_lookup = {cat.id: cat.name for cat in (request.categories or [])}
    audit_evidence = []

    for txn in request.transactions:
        # Use a fallback key to ensure dict.get receives a string
        safe_cid = txn.category_id or "Uncategorized"
        # Cast safe_cid to Any to bypass Column vs str ambiguity in cat_baselines
        baseline = cat_baselines.get(cast(Any, safe_cid), 0)
        if baseline > 0 and txn.amount > baseline * 1.8: # 80% spike over 6-month avg
            audit_evidence.append(
                f"- PICO EN {cat_lookup.get(safe_cid, 'Categoría')}: ${txn.amount/100:,.2f} (Promedio 6 meses: ${baseline/100:,.2f})"
            )
        audit_evidence.append(f"CHECK_SEMANTIC: Desc='{txn.description}' Cat='{cat_lookup.get(safe_cid, 'Sin Categoría')}'")

    zombie_leads = []
    for desc, amnts in desc_history.items():
        if len(amnts) >= 3: # Appears monthly for at least a quarter
            is_sub = any(desc in s.get('name', '').lower() for s in request.subscriptions)
            if not is_sub:
                zombie_leads.append(f"- POSIBLE ZOMBIE: '{desc}' detectado por 3 meses consecutivos (${amnts[-1]/100:,.2f}).")

        subscription_context = "\n".join([f"- {sub.get('name', 'Unknown')}: ${sub.get('amount', 0):.2f}" for sub in request.subscriptions])

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
