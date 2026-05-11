from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pydantic import BaseModel
from typing import List, Optional
import json
import base64
from datetime import datetime
import google.genai as genai
from google.genai import types
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.config import Config
from app.models.category import Category
import os
from app.services.ai_prompts import get_current_time_context, CORE_RULES

router = APIRouter(
    prefix="/api/ai", 
    tags=["AI"],
    dependencies=[Depends(get_current_device)]
)

def get_gemini_key(db: Session) -> str:
    config_entry = db.query(Config).filter(Config.key == "gemini_api_key").first()
    if config_entry and config_entry.value:
        return config_entry.value
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


class WhatIfScenarioResponse(BaseModel):
    scenario_title: str
    summary: str
    one_time_impact: int = 0 # in cents
    monthly_impact_change: int = 0 # in cents
    projection: List[WhatIfProjection]


class ZombieSubscription(BaseModel):
    description: str
    estimated_amount: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    confidence: float
    reasoning: str


class SpendingSpike(BaseModel):
    category_id: str
    normal_average: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    current_spike: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    reasoning: str


class AnomalyScanRequest(BaseModel):
    transactions: List[TransactionInput]
    subscriptions: List[dict]
    categories: Optional[List[CategoryInput]] = None
    goals: Optional[List[dict]] = None


class AnomalyScanResponse(BaseModel):
    zombie_subscriptions: List[ZombieSubscription]
    spending_spikes: List[SpendingSpike]


async def call_gemini_json(prompt: str, api_key: str, response_schema: Optional[type] = None) -> dict:
    """
    Shared utility function to call Gemini API with strict production rules.
    """
    try:
        client = genai.Client(api_key=api_key)
        
        response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )
        
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
    
    Proxy endpoint that:
    1. Receives sanitized transactions from frontend
    2. Calls LLM with structured system prompt
    3. Returns category suggestions with confidence scores
    4. Forces LLM to use only provided category IDs (no hallucinations)
    """
    
    api_key = get_gemini_key(db)
    
    # Build category context for LLM
    category_context = "\n".join([
        f"- {cat.id}: {cat.name}"
        for cat in request.categories
    ])
    
    # Build transaction context
    transaction_context = "\n".join([
        f"ID: {txn.id} | Description: {txn.description} | Amount: {txn.amount}"
        for txn in request.transactions
    ])
    
    # Structured system prompt enforcing strict category ID usage
    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are a financial transaction categorizer. Your task is to classify transactions into the provided categories.

AVAILABLE CATEGORIES (use ONLY these IDs):
{category_context}

STRICT RULES:
1. You MUST return ONLY category IDs from the list above.
2. If a transaction is highly ambiguous (e.g. "Transfer" without context), suggest the most likely ID but explain the ambiguity in "reasoning".
3. Return confidence score (0.0 to 1.0) based on description clarity.
4. Provide brief reasoning for each classification.
5. Return valid JSON array.

TRANSACTIONS TO CLASSIFY:
{transaction_context}
"""
    
    suggestions = await call_gemini_json(system_prompt, api_key, response_schema=List[CategorySuggestion])
    
    return suggestions


@router.post("/simulate-what-if", response_model=WhatIfScenarioResponse)
async def simulate_what_if(
    request: WhatIfScenarioRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered What-If scenario simulation with deterministic math.
    """
    api_key = get_gemini_key(db)
    
    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are an expert financial impact analyzer. Analyze the user's scenario and identify the ONE-TIME cost/income and the MONTHLY change in cash flow for a 12-month horizon.

CURRENT FINANCIAL STATE:
- Current Net Worth: ${request.current_net_worth / 100:,.2f} USD
- Monthly Cash Flow: ${request.monthly_cash_flow / 100:,.2f} USD

USER SCENARIO:
{request.user_prompt}

ANALYSIS REQUIREMENTS:
1. Identify 'one_time_impact': How much does this cost or earn RIGHT NOW? (Use negative for costs).
2. Identify 'monthly_impact_change': How much does this change the monthly cash flow? (e.g., a new subscription is a negative change).
3. ALL JSON values MUST be in CENTS (multiply by 100).
4. Provide summary in SPANISH explaining the impact and the recovery time clearly.
5. Provide a scenario_title in SPANISH.
"""
    
    try:
        client = genai.Client(api_key=api_key)
        
        # We define a temporary internal schema for the AI to return just the impacts
        class ImpactAnalysis(BaseModel):
            scenario_title: str
            summary: str
            one_time_impact: int
            monthly_impact_change: int

        response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
            contents=system_prompt,
            config=types.GenerateContentConfig(
                temperature=0.2, # Very low temperature for math-like stability
                response_mime_type="application/json",
                response_schema=ImpactAnalysis
            )
        )
        
        impact_data = json.loads(response.text)
        
        # DETERMINISTIC MATH: Calculate the 12-month projection in code
        projection = []
        current_baseline = request.current_net_worth
        current_projected = request.current_net_worth + impact_data.get("one_time_impact", 0)
        
        base_cash_flow = request.monthly_cash_flow
        new_cash_flow = base_cash_flow + impact_data.get("monthly_impact_change", 0)
        
        for month in range(1, 13):
            current_baseline += base_cash_flow
            current_projected += new_cash_flow
            
            projection.append({
                "month": month,
                "baseline_net_worth": current_baseline,
                "projected_net_worth": current_projected
            })
            
        return WhatIfScenarioResponse(
            scenario_title=impact_data["scenario_title"],
            summary=impact_data["summary"],
            one_time_impact=impact_data["one_time_impact"],
            monthly_impact_change=impact_data["monthly_impact_change"],
            projection=projection
        )
        
    except Exception as e:
        print(f"Error in WhatIf simulation: {e}")
        # Fallback
        return WhatIfScenarioResponse(
            scenario_title="Error en simulación",
            summary="No se pudo procesar la simulación matemática correctamente.",
            one_time_impact=0,
            monthly_impact_change=0,
            projection=[
                WhatIfProjection(
                    month=m, 
                    baseline_net_worth=request.current_net_worth, 
                    projected_net_worth=request.current_net_worth
                ) for m in range(1, 25)
            ]
        )


@router.post("/scan-anomalies", response_model=AnomalyScanResponse)
async def scan_anomalies(
    request: AnomalyScanRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered anomaly detection for zombie subscriptions and spending spikes.
    
    Proxy endpoint that:
    1. Receives recent transactions and current subscriptions
    2. Calls LLM with forensic auditor system prompt
    3. Detects zombie subscriptions (recurring charges not in subscription list)
    4. Detects spending spikes (category spend exceeds historical average)
    """
    
    api_key = get_gemini_key(db)
    
    # Build category mapping
    category_map = {}
    if request.categories:
        for cat in request.categories:
            category_map[cat.id] = cat.name
    else:
        # Fallback to description proxy if not provided
        for txn in request.transactions:
            if txn.category_id and txn.category_id not in category_map:
                category_map[txn.category_id] = txn.description[:50]
    
    category_context = "\n".join([
        f"- ID: {cat_id} | Nombre: {name}"
        for cat_id, name in category_map.items()
    ])
    
    subscription_context = "\n".join([
        f"- {sub.get('name', 'Unknown')}: ${sub.get('amount', 0):.2f}"
        for sub in request.subscriptions
    ])
    
    goal_context = "\n".join([
        f"- {g.get('name', 'Meta')}: Objetivo ${g.get('target_amount', 0)/100:.2f} | Actual ${g.get('current_amount', 0)/100:.2f}"
        for g in (request.goals or [])
    ])

    # Build category mapping for easy lookup
    cat_lookup = {cat.id: cat.name for cat in (request.categories or [])}

    transaction_context = "\n".join([
        f"ID: {txn.id} | Desc: {txn.description} | Cat: {cat_lookup.get(txn.category_id, 'Sin Categoría')} | Amt: {txn.amount} | Date: {txn.date}"
        for txn in request.transactions
    ])
    
    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are a forensic financial auditor. Your task is to detect anomalies (spending spikes and zombie subscriptions).

CONTEXTO DE SUBSCRIPCIONES (Gastos recurrentes conocidos):
{subscription_context}

CONTEXTO DE METAS (Para identificar ahorros/retiros de metas):
{goal_context}

MAPEO DE CATEGORÍAS DISPONIBLES:
{category_context}

RECENT TRANSACTIONS (Data to analyze):
{transaction_context}

STRICT AUDIT RULES:
1. ZOMBIE SUBSCRIPTIONS: Identify recurring charges (~30 days) that are NOT in the 'CONTEXTO DE SUBSCRIPCIONES'.
2. SPENDING SPIKES: Detect when a category's total spend significantly exceeds its normal average. 
3. CREDIT CARD PAYMENTS (CRITICAL): If a transaction category (Cat) is 'Transferencia', 'Pago de Deuda', or the description indicates a Credit Card Payment (e.g., "Pago tarjeta"), IGNORE it for 'Spending Spikes'. Debt payments are NOT consumption spikes.
4. CATEGORY INTEGRITY: Do not attribute a 'Pago tarjeta' to 'Salud Médica' even if you see a medical subscription. They are different things.
5. CONTEXT AWARENESS: If an expense matches a Goal name, it is a planned movement, not an anomaly.
6. Output MUST be in SPANISH.
7. Amounts in JSON MUST be in CENTS (multiply by 100).
"""
    
    anomalies = await call_gemini_json(system_prompt, api_key, response_schema=AnomalyScanResponse)
    
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
        
        # Fetch context
        from app.models.account import Account
        categories = db.query(Category).filter(Category.is_deleted == False).all()
        accounts = db.query(Account).filter(Account.is_deleted == False, Account.is_active == True).all()
        
        cat_ctx = "\n".join([f"- {c.id}: {c.name}" for c in categories])
        acc_ctx = "\n".join([f"- {a.id}: {a.name}" for a in accounts])

        system_instruction = (
            f"Eres un asistente financiero experto. Extrae de este audio las transacciones financieras. Hoy es {today_str}. "
            f"\nCATEGORÍAS:\n{cat_ctx}\nCUENTAS:\n{acc_ctx}\n"
            "Reglas críticas:\n"
            "1. El monto (amount) debe ser un entero en CENTAVOS (ej. $25.00 -> 2500).\n"
            "2. transaction_type debe ser 'expense' o 'income'.\n"
            "3. La fecha (date) debe ser YYYY-MM-DD.\n"
            "4. category_id y account_id: Mapea a los IDs reales proporcionados si se mencionan.\n"
        )
        
        audio_bytes = base64.b64decode(request.audio_base64)
        
        response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
            contents=[
                system_instruction,
                types.Part.from_bytes(data=audio_bytes, mime_type=f"audio/{request.audio_format}")
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AudioToTxnResponse,
                temperature=0.1
            )
        )
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
        
        system_instruction = (
            f"Eres un auditor experto extrayendo datos de recibos. Hoy es {today_str}. "
            "Reglas críticas:\n"
            "1. Extrae el TOTAL final a pagar. El monto debe ser entero en CENTAVOS (ej. Total $25.50 -> 2550).\n"
            "2. transaction_type es siempre 'expense'.\n"
            "3. Extrae la fecha del recibo (YYYY-MM-DD). Si no hay fecha legible, usa hoy.\n"
            "4. description debe ser el nombre del comercio."
        )
        
        image_bytes = await file.read()
        
        response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
            contents=[
                system_instruction,
                types.Part.from_bytes(data=image_bytes, mime_type=file.content_type or "image/jpeg")
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AudioToTxnResponse,
                temperature=0.1
            )
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analizando recibo: {str(e)}")
@router.get("/test-component")
async def test_component(component: str, db: Session = Depends(get_db)):
    """
    DIAGNOSTIC: Test if an AI component is responding correctly using mock data.
    """
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        return {"status": "error", "message": "API Key not configured"}

    client = genai.Client(api_key=config.value)
    
    try:
        if component == "sentinel":
            # Test Sentinel logic with dummy context
            prompt = "Eres un guardián financiero. Di 'OK' si recibes este mensaje de prueba."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}
            
        elif component == "anomaly":
            # Test Anomaly detection logic
            prompt = "Analiza este gasto de $500 en 'Dulces' cuando el mes pasado fue $5. Resume en 1 frase."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}

        elif component == "fiscal":
            # Test Fiscal intelligence
            prompt = "Calcula el 15% de IVA para $100. Responde solo el número."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}

        elif component == "whatif":
            # Test Simulation logic
            prompt = "Si ahorro $100 mensuales por 12 meses con 0% interes, ¿cuanto tengo? Responde solo el numero."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}

        elif component == "audio":
            # Test Audio/OCR prompt logic
            prompt = "Eres un transcriptor. De esta frase: 'Gaste 5 dolares en pan', extrae monto y concepto en JSON."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}

        elif component == "categorization":
            # Test Semantic Mapping
            prompt = "Categoriza 'Netflix' en una palabra (ej. Entretenimiento, Comida, Salud)."
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt
            )
            return {"status": "success", "message": response.text.strip()}

        return {"status": "error", "message": "Unknown component"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
