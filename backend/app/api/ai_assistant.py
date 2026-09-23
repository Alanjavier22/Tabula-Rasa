from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional, Any, Dict, Callable, Awaitable, cast
import inspect
import base64
import binascii
import logging
import os
from app.services.ai_models import AGENT_MODEL, with_gemini_retry_async
from google.genai import types
from database import get_db, SessionLocal
from app.api.auth import get_current_device
from pydantic import BaseModel, Field, field_validator
from app.services.ai_prompts import get_current_time_context, CORE_RULES, get_persona_prompt
from app.api.ai_shared import get_gemini_key
from app.services.gemini_gateway import create_gemini_client
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
logger = logging.getLogger(__name__)
MAX_DOCUMENT_BYTES = 12 * 1024 * 1024
SUPPORTED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
}

AI_ASSISTANT_ERROR_RESPONSES = {
    400: {"description": "Invalid assistant request."},
    413: {"description": "Uploaded document is too large."},
    401: {"description": "Assistant authentication failed."},
    429: {"description": "Assistant rate limit exceeded."},
    500: {"description": "Assistant processing failed."},
    503: {"description": "Assistant service unavailable."},
}


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=12_000)
    cash_flow_context: Optional[dict] = None  # Safe-to-Spend context from frontend (cents)
    assets_context: Optional[dict] = None  # Assets context from frontend (cents)
    document_base64: Optional[str] = Field(None, max_length=16_777_216)
    document_mime_type: Optional[str] = None

    @field_validator("document_mime_type")
    @classmethod
    def validate_document_mime_type(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in SUPPORTED_DOCUMENT_MIME_TYPES:
            raise ValueError("Tipo de documento no soportado")
        return value


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


def _build_system_instruction(db: Session) -> str:
    config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
    persona_value = str(config_persona.value) if config_persona and config_persona.value else "professional"
    persona_instruction = get_persona_prompt(persona_value)
    return f"""{get_current_time_context()}
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


def _build_tool_handlers(
    db: Session,
    request: ChatRequest,
    api_key: str,
    args: dict,
) -> Dict[str, Callable[[], Any | Awaitable[Any]]]:
    return {
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


async def _execute_function_call(function_call: Any, request: ChatRequest, api_key: str) -> Any:
    function_name = getattr(function_call, 'name', None)
    args = getattr(function_call, 'args', {})
    with SessionLocal() as db:
        handler = _build_tool_handlers(db, request, api_key, args).get(function_name)
        if handler is None:
            return {"error": f"Unknown function: {function_name}"}
        result = handler()
        if inspect.isawaitable(result):
            result = await result
        return result


async def _send_initial_message(chat, request: ChatRequest):
    if request.document_base64:
        try:
            doc_bytes = base64.b64decode(request.document_base64, validate=True)
        except (ValueError, binascii.Error) as error:
            raise HTTPException(status_code=400, detail="El documento base64 no es válido") from error
        if len(doc_bytes) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="El documento supera el tamaño máximo permitido")
        mime_type = request.document_mime_type or "application/pdf"
        doc_part = types.Part.from_bytes(data=doc_bytes, mime_type=mime_type)
        return await with_gemini_retry_async(lambda: chat.send_message([doc_part, request.message]))
    return await with_gemini_retry_async(lambda: chat.send_message(request.message))


async def _run_chat_turns(response, chat, request: ChatRequest, api_key: str) -> tuple[Any, list[dict]]:
    function_calls_made = []
    for _ in range(3):
        if not response.function_calls:
            break
        tool_responses = []
        for function_call in response.function_calls:
            function_calls_made.append({
                "name": function_call.name,
                "args": dict(function_call.args or {}),
            })
            function_result = await _execute_function_call(function_call, request, api_key)
            tool_responses.append(types.Part.from_function_response(
                name=cast(str, function_call.name),
                response=function_result,
            ))
        response = await with_gemini_retry_async(
            lambda tool_responses=tool_responses: chat.send_message(cast(Any, tool_responses))
        )
    return response, function_calls_made


def _raise_assistant_error(error: Exception) -> None:
    error_str = str(error).lower()
    code = getattr(error, "code", None)
    logger.exception("Gemini assistant request failed", exc_info=error)
    if (
        code in {408, 500, 502, 503, 504}
        or any(f"{status}" in error_str for status in (408, 500, 502, 503, 504))
        or "service unavailable" in error_str
    ):
        raise HTTPException(
            status_code=503,
            detail="El servicio de Google Gemini está temporalmente no disponible. Por favor intenta nuevamente en unos segundos."
        )
    if code == 429 or "429" in error_str or "quota" in error_str or "rate limit" in error_str:
        raise HTTPException(
            status_code=429,
            detail="Has excedido el límite de la API de Gemini. Por favor espera un momento antes de continuar."
        )
    if "api key" in error_str or "authentication" in error_str:
        raise HTTPException(
            status_code=401,
            detail="Error de autenticación con la API de Gemini. Verifica tu API Key en configuración."
        )
    raise HTTPException(status_code=500, detail="No se pudo completar la respuesta del asistente IA.") from error


@router.post("/chat", responses=AI_ASSISTANT_ERROR_RESPONSES)
async def chat_with_assistant(request: ChatRequest, db: Annotated[Session, Depends(get_db)]):
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
    api_key = get_gemini_key(db)

    try:
        client = create_gemini_client(api_key)
        chat = client.chats.create(
            model=AGENT_MODEL,
            config=types.GenerateContentConfig(
                system_instruction=_build_system_instruction(db),
                tools=AI_ASSISTANT_TOOL_DECLARATIONS,
            )
        )
        response = await _send_initial_message(chat, request)
        response, function_calls_made = await _run_chat_turns(response, chat, request, api_key)
        return {
            "response": response.text,
            "function_calls": function_calls_made if function_calls_made else None,
            "has_mutations": False,
        }

    except Exception as e:
        _raise_assistant_error(e)
