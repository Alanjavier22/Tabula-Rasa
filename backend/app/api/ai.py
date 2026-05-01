from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
import json
import google.generativeai as genai

router = APIRouter()


class CategoryInput(BaseModel):
    id: str
    name: str


class TransactionInput(BaseModel):
    id: str
    description: str
    amount: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    date: str


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


class WhatIfScenarioResponse(BaseModel):
    scenario_title: str
    summary: str
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


class AnomalyScanResponse(BaseModel):
    zombie_subscriptions: List[ZombieSubscription]
    spending_spikes: List[SpendingSpike]


async def call_gemini_json(prompt: str, api_key: str) -> dict:
    """
    Shared utility function to call Gemini API with strict production rules.
    
    Configuration:
    - Temperature: 0.1 (deterministic, analytical)
    - Response MIME type: application/json (native JSON)
    - Timeout: 15 seconds (prevent server hangs)
    - Model: gemini-1.5-flash
    
    Error handling:
    - Timeout → 504 Gateway Timeout
    - JSON parse error → 500 Internal Server Error
    """
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3-flash')  # FASE 4: Updated to gemini-3-flash
        
        response = await model.generate_content_async(
            prompt,
            generation_config={
                "temperature": 0.1,
                "response_mime_type": "application/json",
            },
            timeout=15.0
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
    x_ai_api_key: Optional[str] = Header(None, alias="X-AI-API-Key")
):
    """
    AI-powered transaction categorization with Human-in-the-Loop safety.
    
    Proxy endpoint that:
    1. Receives sanitized transactions from frontend
    2. Calls LLM with structured system prompt
    3. Returns category suggestions with confidence scores
    4. Forces LLM to use only provided category IDs (no hallucinations)
    """
    
    if not x_ai_api_key:
        raise HTTPException(status_code=401, detail="AI API Key required")
    
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
    system_prompt = f"""You are a financial transaction categorizer. Your task is to classify transactions into categories.

REGLAS CRÍTICAS DE INTEGRIDAD:
1. MONEDA: Los montos son enteros representativos de CENTAVOS. 100 = 1.00 USD. No redondees a dólares.
2. IDENTIDAD: Los tokens [PERSON_N] y [ACCOUNT_N] son deterministas. Si un ID se repite, la entidad es la misma en todo el dataset.
3. PRIVACIDAD: No intentes deducir nombres reales. Opera solo sobre los tokens.
4. ALUCINACIÓN: Si los datos sanitizados no proporcionan suficiente contexto para una categoría, indica 'Contexto insuficiente' en lugar de inventar.

AVAILABLE CATEGORIES (use ONLY these IDs):
{category_context}

STRICT RULES:
1. You MUST return ONLY category IDs from the list above
2. Do NOT invent or hallucinate new category IDs
3. Return confidence score (0.0 to 1.0) based on description clarity
4. Provide brief reasoning for each classification
5. Return valid JSON array with this exact structure:
[
  {{
    "transaction_id": "string",
    "suggested_category_id": "string",
    "confidence": 0.0-1.0,
    "reasoning": "string"
  }}
]

TRANSACTIONS TO CLASSIFY:
{transaction_context}
"""
    
    suggestions = await call_gemini_json(system_prompt, x_ai_api_key)
    
    return suggestions


@router.post("/simulate-what-if", response_model=WhatIfScenarioResponse)
async def simulate_what_if(
    request: WhatIfScenarioRequest,
    x_ai_api_key: Optional[str] = Header(None, alias="X-AI-API-Key")
):
    """
    AI-powered What-If scenario simulation for financial projections.
    
    Proxy endpoint that:
    1. Receives user scenario prompt and financial data
    2. Calls LLM with mathematical advisor system prompt
    3. Returns 24-month linear projection (baseline vs optimized)
    4. Forces simple linear math: Net Worth + Monthly Savings * N months
    """
    
    if not x_ai_api_key:
        raise HTTPException(status_code=401, detail="AI API Key required")
    
    system_prompt = f"""You are a mathematical financial advisor. Your task is to project 24-month Net Worth scenarios.

CURRENT FINANCIAL STATE:
- Current Net Worth: ${request.current_net_worth:,.2f}
- Average Monthly Spend (target category): ${request.avg_monthly_spend:,.2f}

USER SCENARIO:
{request.user_prompt}

STRICT MATHEMATICAL RULES:
1. Calculate monthly savings from the habit change
2. Project 24 months using LINEAR math: Net Worth + (Monthly Savings * Month Number)
3. No complex stochastic calculations - simple linear projection only
4. Baseline projection: Net Worth stays flat (no habit change)
5. Projected projection: Net Worth + cumulative monthly savings
6. Return valid JSON with this exact structure:
{{
  "scenario_title": "string",
  "summary": "string",
  "projection": [
    {{
      "month": 1,
      "baseline_net_worth": number,
      "projected_net_worth": number
    }},
    ...
  ]
}}

REGLAS CRÍTICAS DE INTEGRIDAD:
1. MONEDA: Los montos son enteros representativos de CENTAVOS. 100 = 1.00 USD. No redondees a dólares.
2. IDENTIDAD: Los tokens [PERSON_N] y [ACCOUNT_N] son deterministas. Si un ID se repite, la entidad es la misma en todo el dataset.
3. PRIVACIDAD: No intentes deducir nombres reales. Opera solo sobre los tokens.
4. ALUCINACIÓN: Si los datos sanitizados no proporcionan suficiente contexto para una proyección, indica 'Contexto insuficiente' en lugar de inventar.

TRANSACTION CONTEXT:
{len(request.transactions)} transactions in target category
"""
    
    # TODO: Integrate actual LLM SDK (OpenAI/Gemini)
    # Replace mock with:
    # import openai
    # client = openai.OpenAI(api_key=x_ai_api_key)
    # response = client.chat.completions.create(
    #     model="gpt-4",
    #     messages=[{"role": "system", "content": system_prompt}],
    #     response_format={"type": "json_object"}
    # )
    # scenario = json.loads(response.choices[0].message.content)
    
    # Mock response for development
    monthly_savings = request.avg_monthly_spend * 0.5
    projection = []
    for month in range(1, 25):
        projection.append({
            "month": month,
            "baseline_net_worth": request.current_net_worth,
            "projected_net_worth": request.current_net_worth + (monthly_savings * month)
        })
    
    scenario = {
        "scenario_title": "Reduce Spending by 50%",
        "summary": f"Reducing monthly spend by ${monthly_savings:,.2f} adds ${monthly_savings * 24:,.2f} to Net Worth over 24 months.",
        "projection": projection
    }
    
    return scenario


@router.post("/scan-anomalies", response_model=AnomalyScanResponse)
async def scan_anomalies(
    request: AnomalyScanRequest,
    x_ai_api_key: Optional[str] = Header(None, alias="X-AI-API-Key")
):
    """
    AI-powered anomaly detection for zombie subscriptions and spending spikes.
    
    Proxy endpoint that:
    1. Receives recent transactions and current subscriptions
    2. Calls LLM with forensic auditor system prompt
    3. Detects zombie subscriptions (recurring charges not in subscription list)
    4. Detects spending spikes (category spend exceeds historical average)
    """
    
    if not x_ai_api_key:
        raise HTTPException(status_code=401, detail="AI API Key required")
    
    subscription_context = "\n".join([
        f"- {sub.get('name', 'Unknown')}: ${sub.get('amount', 0):.2f}"
        for sub in request.subscriptions
    ])
    
    transaction_context = "\n".join([
        f"ID: {txn.id} | Description: {txn.description} | Amount: ${txn.amount:.2f} | Date: {txn.date}"
        for txn in request.transactions
    ])
    
    system_prompt = f"""You are a forensic financial auditor. Your task is to detect financial anomalies.

REGLAS CRÍTICAS DE INTEGRIDAD:
1. MONEDA: Los montos son enteros representativos de CENTAVOS. 100 = 1.00 USD. No redondees a dólares.
2. IDENTIDAD: Los tokens [PERSON_N] y [ACCOUNT_N] son deterministas. Si un ID se repite, la entidad es la misma en todo el dataset.
3. PRIVACIDAD: No intentes deducir nombres reales. Opera solo sobre los tokens.
4. ALUCINACIÓN: Si los datos sanitizados no proporcionan suficiente contexto para una anomalía, indica 'Contexto insuficiente' en lugar de inventar.

CURRENT SUBSCRIPTIONS (registered):
{subscription_context}

RECENT TRANSACTIONS (last 90 days):
{transaction_context}

STRICT AUDIT RULES:

RULE 1 - ZOMBIE SUBSCRIPTIONS:
- Find transaction descriptions with identical amounts recurring at ~30-day intervals
- These recurring charges must NOT be present in the current subscriptions list
- Return high-confidence zombie subscriptions with estimated monthly amount
- Provide reasoning linking to specific transaction patterns

RULE 2 - SPENDING SPIKES:
- Identify categories where last 30-day spend irrationally exceeds historical average
- Calculate the excess amount (current_spike - normal_average)
- Provide reasoning explaining the spike context

Return valid JSON with this exact structure:
{{
  "zombie_subscriptions": [
    {{
      "description": "string",
      "estimated_amount": number,
      "confidence": 0.0-1.0,
      "reasoning": "string"
    }}
  ],
  "spending_spikes": [
    {{
      "category_id": "string",
      "normal_average": number,
      "current_spike": number,
      "reasoning": "string"
    }}
  ]
}}

If no anomalies detected, return empty arrays for both fields.
"""
    
    anomalies = await call_gemini_json(system_prompt, x_ai_api_key)
    
    return anomalies
