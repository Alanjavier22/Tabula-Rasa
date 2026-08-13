from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Dict, Callable, Awaitable, Union, cast
import inspect
import os
import google.genai as genai
from app.services.ai_models import AGENT_MODEL
from google.genai import types
from database import get_db, SessionLocal
from app.api.auth import get_current_device
from pydantic import BaseModel
from app.services.ai_prompts import get_current_time_context, CORE_RULES, get_persona_prompt
from app.services.ai_assistant_tools import (
    AI_ASSISTANT_TOOL_DECLARATIONS,
    get_budget_status,
    get_all_budgets_status,
    get_account_balance,
    get_total_balance,
    search_categories,
    search_accounts,
    get_cash_flow_context,
    get_assets_context,
    get_import_history,
    get_monthly_summary,
    get_active_goals,
    get_upcoming_reminders,
    get_active_subscriptions,
    get_debt_summary,
    get_net_worth_history,
    get_credit_card_details,
    get_audit_report,
    get_duplicate_transactions,
    get_recent_transactions,
    get_fiscal_summary,
    get_financial_executive_summary,
    get_sentinel_health,
)

# AI bypass flag for cold load migration
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"

router = APIRouter(
    prefix="/ai-assistant", 
    tags=["ai-assistant"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class ChatRequest(BaseModel):
    message: str
    cash_flow_context: Optional[dict] = None  # Safe-to-Spend context from frontend (cents)
    assets_context: Optional[dict] = None  # Assets context from frontend (cents)
    document_base64: Optional[str] = None
    document_mime_type: Optional[str] = None


class FunctionCallResponse(BaseModel):
    response: str
    function_calls: Optional[List[dict]] = None
    has_mutations: bool = False


# FAIL-FAST: Write capabilities removed from AI. AI is now read-only auditor.
# The following functions were removed:
# - create_expense_transaction (lines 154-191)
# - create_iou (lines 193-224)
# AI can only query and analyze data, not modify it.


from app.models.config import Config

@router.post("/chat")
async def chat_with_assistant(request: ChatRequest, db: Session = Depends(get_db)):
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
    
    # Check DB first, fallback to env var
    config_api_key = db.query(Config).filter(Config.key == "gemini_api_key").first()
    raw_api_key = config_api_key.value if config_api_key and config_api_key.value else os.getenv("GEMINI_API_KEY")
    api_key = cast(str, raw_api_key) if raw_api_key else None
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    try:
        
        # Herramientas disponibles para la IA (solo lectura) — schema en services/ai_assistant_tools.py
        tools = AI_ASSISTANT_TOOL_DECLARATIONS
        
        # --- SYSTEM PROMPT CONSTRUCTION ---
        time_context = get_current_time_context()
        config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
        persona_value = str(config_persona.value) if config_persona and config_persona.value else "professional"
        persona_instruction = get_persona_prompt(persona_value)

        system_instruction = f"""{time_context}
{CORE_RULES}

ROL PRINCIPAL: Eres un AUDITOR FINANCIERO READ-ONLY. Tu función es CONSULTAR y ANALIZAR información financiera existente. 

FUENTE DE LA VERDAD: La ÚNICA fuente de la verdad es la data que reposa en la base de datos a través de las herramientas proporcionadas. 
- NUNCA alucines o inventes datos que no existan.
- Si una herramienta no devuelve datos, di "No tengo registros sobre esto". No intentes adivinar por compromiso.

PROHIBICIÓN ABSOLUTA DE ESCRITURA: NO tienes permiso para CREAR, MODIFICAR o ELIMINAR registros reales en la base de datos (transacciones, cuentas, presupuestos, IOUs, activos, metas, recordatorios). 

CONFIRMACIONES Y ACCIONES PROACTIVAS:
- Si consideras que el usuario debería crear una meta o un recordatorio, SUGIÉRELO en texto.
- Explica que tú no puedes crearlo directamente por seguridad, y que el usuario debe confirmarlo manualmente en la interfaz.

CAPACIDADES PERMITIDAS:
- Análisis de escenarios hipotéticos ("¿Qué pasa si...?").
- Proyecciones basadas en datos históricos.
- Búsqueda de discrepancias o anomalías.
- Explicación de estados de cuenta y presupuestos.

{persona_instruction}

GUÍA DE HERRAMIENTAS:
- Para consultas sobre el mes actual o flujo de caja general, usa `get_cash_flow_context`.
- Para preguntas sobre meses anteriores, usa `get_monthly_summary`.
- Para activos físicos, usa `get_assets_context`.
- Para deudas, usa `get_debt_summary`.
- Para tendencias de patrimonio neto, usa `get_net_worth_history`.
- Para auditoría de datos (duplicados, SRI), usa `get_audit_report` (resumen) o `get_duplicate_transactions` (detalle).
- Para ver qué está pasando 'ahora mismo' con el gasto, usa `get_recent_transactions`.
- Para temas de impuestos y SRI Ecuador, usa `get_fiscal_summary`.
- Para ver el estado general del sistema y alertas proactivas, usa `get_sentinel_health`.
- Si no conoces un ID de categoría o cuenta, usa las herramientas de búsqueda (`search_categories`, `search_accounts`) antes de responder.
"""

        client = genai.Client(api_key=api_key)
        
        chat = client.chats.create(
            model=AGENT_MODEL,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=tools
            )
        )
        
        # Function to execute tool calls (READ-ONLY ONLY)
        async def execute_function_call(function_call: Any) -> Any:
            function_name = getattr(function_call, 'name', None)
            args = getattr(function_call, 'args', {})
            
            # Context manager ensures session is closed/returned to pool instantly after query
            with SessionLocal() as db:
                # Registro nombre -> handler perezoso. Cada tool tiene su propia firma
                # (algunas leen args, otras el api_key, otras el contexto del request),
                # por eso son closures de cero argumentos en vez de un dict[nombre, func] plano.
                handlers: Dict[str, Callable[[], Union[Any, Awaitable[Any]]]] = {
                    "get_budget_status": lambda: get_budget_status(db, args["category_name"]),
                    "get_account_balance": lambda: get_account_balance(db, args["account_name"]),
                    "get_total_balance": lambda: get_total_balance(db),
                    "search_categories": lambda: search_categories(db, args["keyword"]),
                    "search_accounts": lambda: search_accounts(db, args["keyword"]),
                    "get_cash_flow_context": lambda: get_cash_flow_context(request.cash_flow_context or {}),
                    "get_assets_context": lambda: get_assets_context(request.assets_context or {}),
                    "get_monthly_summary": lambda: get_monthly_summary(db, args["month"], args["year"]),
                    "get_active_goals": lambda: get_active_goals(db),
                    "get_upcoming_reminders": lambda: get_upcoming_reminders(db, args.get("days_ahead", 30)),
                    "get_active_subscriptions": lambda: get_active_subscriptions(db),
                    "get_debt_summary": lambda: get_debt_summary(db),
                    "get_net_worth_history": lambda: get_net_worth_history(db, args.get("limit", 12)),
                    "get_credit_card_details": lambda: get_credit_card_details(db),
                    "get_audit_report": lambda: get_audit_report(db),
                    "get_duplicate_transactions": lambda: get_duplicate_transactions(db),
                    "get_recent_transactions": lambda: get_recent_transactions(db, args.get("limit", 15)),
                    "get_fiscal_summary": lambda: get_fiscal_summary(db),
                    "get_all_budgets_status": lambda: get_all_budgets_status(db),
                    "get_sentinel_health": lambda: get_sentinel_health(db, api_key),
                    "get_financial_executive_summary": lambda: get_financial_executive_summary(db, api_key),
                    "get_import_history": lambda: get_import_history(db, args.get("limit", 10)),
                }

                handler = handlers.get(function_name)
                if handler is None:
                    return {"error": f"Unknown function: {function_name}"}

                result = handler()
                if inspect.isawaitable(result):
                    result = await result
                return result
        
        # Chat is already started via client.chats.create()
        
        # Send the user message (with document if provided)
        if request.document_base64:
            import base64
            doc_bytes = base64.b64decode(request.document_base64)
            mime_type = request.document_mime_type or "application/pdf"
            doc_part = types.Part.from_bytes(data=doc_bytes, mime_type=mime_type)
            response = chat.send_message([doc_part, request.message])
        else:
            response = chat.send_message(request.message)
        
        function_calls_made = []
        
        # Handle function calls
        # We need a loop in case the model wants to call multiple functions sequentially (like searching, then creating)
        max_turns = 3
        turn = 0
        
        while response.function_calls and turn < max_turns:
            tool_responses = []
            for fc in response.function_calls:
                function_calls_made.append({
                    "name": fc.name,
                    "args": dict(fc.args or {})
                })
                
                # Execute the function
                function_result = await execute_function_call(fc)
                
                # Add to tool responses
                tool_responses.append(
                    types.Part.from_function_response(
                        name=cast(str, fc.name),
                        response=function_result
                    )
                )
            
            # Send the function results back to the model
            response = chat.send_message(cast(Any, tool_responses))
            turn += 1
            
        # FAIL-FAST: No mutation tracking needed since AI is read-only
        return {
            "response": response.text,
            "function_calls": function_calls_made if function_calls_made else None,
            "has_mutations": False  # Always false - AI is read-only
        }

    except Exception as e:
        # Handle specific Gemini API errors with user-friendly messages
        error_str = str(e).lower()
        if "503" in error_str or "service unavailable" in error_str:
            raise HTTPException(
                status_code=503,
                detail="El servicio de Google Gemini está temporalmente no disponible. Por favor intenta nuevamente en unos segundos."
            )
        elif "429" in error_str or "quota" in error_str or "rate limit" in error_str:
            raise HTTPException(
                status_code=429,
                detail="Has excedido el límite de la API de Gemini. Por favor espera un momento antes de continuar."
            )
        elif "api key" in error_str or "authentication" in error_str:
            raise HTTPException(
                status_code=401,
                detail="Error de autenticación con la API de Gemini. Verifica tu API Key en configuración."
            )
        else:
            raise HTTPException(status_code=500, detail=f"Error en el asistente IA: {str(e)}")
