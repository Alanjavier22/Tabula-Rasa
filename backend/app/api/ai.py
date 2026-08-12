from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pydantic import BaseModel
from typing import List, Optional
import json
import base64
import logging
from datetime import datetime, timedelta
import google.genai as genai
from google.genai import types
from app.services.ai_models import REASONING_MODEL, MULTIMODAL_MODEL, LITE_MODEL
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.config import Config
from app.models.category import Category
from app.models.transaction import Transaction
import os
from app.services.ai_prompts import get_current_time_context, CORE_RULES
from collections import defaultdict
from typing import List, Optional, Any, cast

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ai", 
    tags=["AI"],
    dependencies=[Depends(get_current_device)]
)

def get_gemini_key(db: Session) -> str:
    config_entry = db.query(Config).filter(Config.key == "gemini_api_key").first()
    if config_entry and config_entry.value:
        return str(config_entry.value)
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key:
        return env_key
    raise HTTPException(status_code=400, detail="Gemini API Key no configurada. Por favor, añádela en Configuración.")


class CategoryInput(BaseModel):
    id: str
    name: str


class TransactionInput(BaseModel):
    id: str
    description: str
    amount: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    date: str
    category_id: Optional[str] = None


class SuggestionRequest(BaseModel):
    transactions: List[TransactionInput]
    categories: List[CategoryInput]


class CategorySuggestion(BaseModel):
    transaction_id: str
    suggested_category_id: str
    confidence: float
    reasoning: str


class WhatIfProjection(BaseModel):
    month: int
    baseline_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    projected_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float


class WhatIfScenarioRequest(BaseModel):
    user_prompt: str
    avg_monthly_spend: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    current_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    transactions: List[TransactionInput]
    # Additional financial context for better simulations
    monthly_income: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    fixed_expenses: int  # BLINDAJE DE CENTAVOS: int (cents) no float (rent, utilities, etc.)
    total_debt: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    monthly_debt_payment: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    monthly_cash_flow: int  # BLINDAJE DE CENTAVOS: int (cents) no float (income - expenses)
    goals: Optional[List[dict]] = []


class WhatIfScenarioResponse(BaseModel):
    scenario_title: str
    summary: str
    one_time_impact: int = 0 # in cents
    monthly_impact_change: int = 0 # in cents
    impact_type: str = "expense" # "expense", "saving", "investment", "income"
    risk_score: int = 1
    optimization_tip: Optional[str] = None
    projection: List[WhatIfProjection]
    key_assumptions: List[str] = []


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


class SuggestedScenario(BaseModel):
    title: str
    description: str
    user_prompt: str


class SuggestedScenariosResponse(BaseModel):
    scenarios: List[SuggestedScenario]


async def call_gemini_json(prompt: str, api_key: str, response_schema: Optional[type] = None, model: str = LITE_MODEL) -> dict:
    """
    Shared utility function to call Gemini API with strict production rules.
    """
    try:
        client = genai.Client(api_key=api_key)
        
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )
        
        if not response.text:
            raise HTTPException(status_code=500, detail="Gemini returned an empty response")
            
        return json.loads(response.text)
    except TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON response")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API error: {str(e)}")


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


class ImpactAnalysis(BaseModel):
    scenario_title: str
    summary: str
    one_time_impact: int
    monthly_impact_change: int
    impact_type: str
    risk_score: int
    estimated_roi_annual: float = 0.0
    optimization_tip: str
    key_assumptions: List[str]
    projection: List[WhatIfProjection]


@router.post("/simulate-what-if", response_model=WhatIfScenarioResponse)
async def simulate_what_if(
    request: WhatIfScenarioRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered What-If scenario simulation v5.0: The Oracle Engine (Dynamic Projections).
    """
    api_key = get_gemini_key(db)
    
    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are the 'Financial Oracle Engine'. Your task is to perform a DYNAMIC financial simulation for 12 months.

CURRENT STATE:
- Net Worth: ${request.current_net_worth / 100:,.2f}
- Base Monthly Cash Flow: ${request.monthly_cash_flow / 100:,.2f} (Income - Expenses)
- Avg Monthly Spend: ${request.avg_monthly_spend / 100:,.2f}

FINANCIAL GOALS:
{request.goals if request.goals else "No predefined goals."}

USER SCENARIO:
{request.user_prompt}

YOUR MISSION:
1. 'projection': GENERATE the 12-month net worth projection YOURSELF. 
2. 'summary': Professional analysis in SPANISH. Mention impact on GOALS.
3. 'key_assumptions': List 2-3 assumptions you made.

STRICT RULES:
- All money amounts in CENTS.
- The projection MUST have exactly 12 months.
"""
    
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=REASONING_MODEL,
            contents=system_prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=ImpactAnalysis
            )
        )
        
        if not response.text:
             raise ValueError("Empty response from Oracle Engine")
             
        impact_data = json.loads(response.text)
        return WhatIfScenarioResponse(
            scenario_title=impact_data.get("scenario_title", "Simulación Dinámica"),
            summary=impact_data.get("summary", "Sin resumen"),
            one_time_impact=impact_data.get("one_time_impact", 0),
            monthly_impact_change=impact_data.get("monthly_impact_change", 0),
            impact_type=impact_data.get("impact_type", "expense"),
            risk_score=impact_data.get("risk_score", 1),
            optimization_tip=impact_data.get("optimization_tip"),
            projection=impact_data.get("projection", []),
            key_assumptions=impact_data.get("key_assumptions", [])
        )
    except Exception as e:
        logger.error(f"Error in Oracle Engine: {e}")
        return WhatIfScenarioResponse(
            scenario_title="Error de Simulación",
            summary=f"El Motor Oracle no pudo proyectar el escenario: {str(e)}",
            projection=[WhatIfProjection(month=m, baseline_net_worth=request.current_net_worth, projected_net_worth=request.current_net_worth) for m in range(1, 13)]
        )


@router.get("/whatif/suggest-scenarios", response_model=List[SuggestedScenario])
async def suggest_whatif_scenarios(db: Session = Depends(get_db)):
    """
    Genera 3 sugerencias dinámicas de simulación basadas en los patrones de gasto reales.
    """
    api_key = get_gemini_key(db)
    from sqlalchemy import func
    
    # Obtener top gastos del último mes
    month_ago = datetime.now() - timedelta(days=30)
    top_expenses = db.query(
        Category.name, 
        func.sum(Transaction.amount).label("total")
    ).join(Transaction).filter(
        Transaction.date >= month_ago,
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False
    ).group_by(Category.name).order_by(func.sum(Transaction.amount).desc()).limit(5).all()
    
    expenses_context = "\n".join([f"- {name}: ${total/100:,.2f}" for name, total in top_expenses])
    
    system_prompt = f"""
    Eres un estratega financiero experto. Basado en estos gastos reales del último mes, sugiere 3 escenarios 'What-If' (¿Qué pasaría si...?) realistas y significativos para el usuario.
    
    GASTOS TOP DEL USUARIO:
    {expenses_context}
    
    REGLAS DE REDACCIÓN Y FORMATO (CRÍTICO):
    1. El título (`title`) debe ser muy breve (máximo 4 palabras), descriptivo y directo (ej: "AHORRO EN COMIDA", "ELIMINAR SUSCRIPCIONES").
    2. La descripción (`description`) debe ser una sola frase corta, directa y sumamente entendible (máximo 15-18 palabras). Di exactamente qué se hace y el beneficio directo sin rodeos teóricos o palabras rebuscadas (ej: "Reducir a la mitad tus compras de ropa para ahorrar $89 al mes e invertir el sobrante").
    3. El campo `user_prompt` debe ser la acción de simulación exacta que se enviará al simulador (ej: "Reducir mi gasto en Compras un 50%").
    4. Toda la salida debe ser en ESPAÑOL.
    """
    
    try:
        response_data = await call_gemini_json(system_prompt, api_key, response_schema=SuggestedScenariosResponse, model=REASONING_MODEL)
        scenarios = response_data.get("scenarios", [])
        return [SuggestedScenario(**s) if isinstance(s, dict) else s for s in scenarios][:3]
    except Exception as e:
        logger.error(f"Error sugiriendo escenarios: {e}")
        return [
            SuggestedScenario(title="Ahorro en Comida", description="¿Qué pasa si cocino más en casa?", user_prompt="Reducir mi gasto en Restaurantes y Comida un 30%"),
            SuggestedScenario(title="Inversión Mensual", description="Simular inversión recurrente", user_prompt="Invertir $100 adicionales cada mes en un fondo con 8% de retorno"),
            SuggestedScenario(title="Eliminar Suscripciones", description="Limpiar gastos hormiga", user_prompt="Eliminar todas mis suscripciones de streaming y ahorrar ese dinero")
        ]


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


class AudioToTxnRequest(BaseModel):
    audio_base64: str
    audio_format: str = "webm"


class TransactionExtracted(BaseModel):
    description: str
    amount: int  # cents
    transaction_type: str  # "expense" or "income"
    date: str  # ISO YYYY-MM-DD
    category_id: Optional[str] = None
    account_id: Optional[str] = None


class AudioToTxnResponse(BaseModel):
    transactions: List[TransactionExtracted]


@router.post("/audio-to-txns", response_model=AudioToTxnResponse)
async def audio_to_txns(
    request: AudioToTxnRequest,
    db: Session = Depends(get_db)
):
    api_key = get_gemini_key(db)
    try:
        client = genai.Client(api_key=api_key)
        today_str = datetime.now().strftime("%Y-%m-%d")
        from app.models.account import Account
        categories = db.query(Category).filter(Category.is_deleted == False).all()
        accounts = db.query(Account).filter(Account.is_deleted == False, Account.is_active == True).all()
        cat_ctx = "\n".join([f"- {c.id}: {c.name}" for c in categories])
        acc_ctx = "\n".join([f"- {a.id}: {a.name}" for a in accounts])

        system_instruction = (
            f"Eres un asistente financiero experto. Extrae de este audio las transacciones financieras. Hoy es {today_str}. "
            f"\nCATEGORÍAS:\n{cat_ctx}\nCUENTAS:\n{acc_ctx}\n"
        )
        audio_bytes = base64.b64decode(request.audio_base64)
        response = client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [system_instruction, types.Part.from_bytes(data=audio_bytes, mime_type=f"audio/{request.audio_format}")]),
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=AudioToTxnResponse, temperature=0.1)
        )
        if not response.text:
            raise ValueError("Empty audio response")
            
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando audio: {str(e)}")


@router.post("/parse-receipt", response_model=AudioToTxnResponse)
async def parse_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    api_key = get_gemini_key(db)
    try:
        client = genai.Client(api_key=api_key)
        today_str = datetime.now().strftime("%Y-%m-%d")
        system_instruction = f"Eres un auditor experto extrayendo datos de recibos. Hoy es {today_str}. Reglas: Montos en CENTAVOS, fecha YYYY-MM-DD."
        image_bytes = await file.read()
        response = client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [system_instruction, types.Part.from_bytes(data=image_bytes, mime_type=file.content_type or "image/jpeg")]),
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=AudioToTxnResponse, temperature=0.1)
        )
        if not response.text:
            raise ValueError("Empty receipt response")
            
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analizando recibo: {str(e)}")


@router.get("/test-component")
async def test_component(component: str, db: Session = Depends(get_db)):
    """
    DIAGNOSTIC: Test if an AI component is responding correctly.
    """
    api_key = get_gemini_key(db)
    client = genai.Client(api_key=api_key)
    try:
        prompt = f"Test {component} component. Respond OK."
        response = client.models.generate_content(model=LITE_MODEL, contents=prompt)
        text = response.text or "OK"
        return {"status": "success", "message": text.strip()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
