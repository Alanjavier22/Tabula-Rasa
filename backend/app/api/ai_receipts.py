"""
Extracción de transacciones desde audio (nota de voz) o imagen de recibo,
usando el modelo multimodal de Gemini. Se monta bajo /api/ai vía api/ai.py.

Nota: no vive en ai_audio.py a propósito. Ambos routers comparten el mismo
prefijo /api/ai (ai.router se registra antes que ai_audio.router en
main.py, así que en caso de choque de ruta gana este módulo). Ambos usan ahora
la misma resolución de key y configuración de cliente.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from typing import List, Optional, Any, cast, Literal
import json
import base64
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from google.genai import types
from app.services.ai_models import MULTIMODAL_MODEL, with_gemini_retry_async
from app.services.gemini_gateway import create_gemini_client
from database import get_db
from app.models.category import Category
from app.api.ai_shared import get_gemini_key

router = APIRouter()
AI_RECEIPTS_ERROR_RESPONSES = {
    400: {"description": "Invalid receipt request."},
    413: {"description": "Receipt payload is too large."},
    500: {"description": "Receipt processing failed."},
}
logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_AUDIO_BASE64_CHARS = 16_777_216
MAX_RECEIPT_BYTES = 12 * 1024 * 1024


class AudioToTxnRequest(BaseModel):
    audio_base64: str = Field(
        ..., min_length=1, max_length=MAX_AUDIO_BASE64_CHARS
    )
    audio_format: Literal["webm", "wav", "mp3", "m4a", "ogg"] = "webm"


class TransactionExtracted(BaseModel):
    description: str
    amount: int  # cents
    transaction_type: str  # "expense" or "income"
    date: str  # ISO YYYY-MM-DD
    category_id: Optional[str] = None
    account_id: Optional[str] = None


class AudioToTxnResponse(BaseModel):
    transactions: List[TransactionExtracted]


@router.post("/audio-to-txns", response_model=AudioToTxnResponse, responses=AI_RECEIPTS_ERROR_RESPONSES)
async def audio_to_txns(
    request: AudioToTxnRequest,
    db: Session = Depends(get_db)
):
    api_key = get_gemini_key(db)
    try:
        client = create_gemini_client(api_key)
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
        try:
            audio_bytes = base64.b64decode(request.audio_base64, validate=True)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="audio_base64 no es válido") from error
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="El audio supera el tamaño máximo permitido")
        response = await with_gemini_retry_async(lambda: client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [system_instruction, types.Part.from_bytes(data=audio_bytes, mime_type=f"audio/{request.audio_format}")]),
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=AudioToTxnResponse, temperature=0.1)
        ))
        if not response.text:
            raise ValueError("Empty audio response")

        return json.loads(response.text)
    except HTTPException:
        raise
    except json.JSONDecodeError as error:
        logger.exception("Gemini returned invalid audio JSON")
        raise HTTPException(status_code=500, detail="La IA no devolvió un formato válido.") from error
    except Exception as error:
        logger.exception("Gemini audio processing failed")
        raise HTTPException(status_code=500, detail="No se pudo procesar el audio.") from error


@router.post("/parse-receipt", response_model=AudioToTxnResponse, responses=AI_RECEIPTS_ERROR_RESPONSES)
async def parse_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    api_key = get_gemini_key(db)
    try:
        client = create_gemini_client(api_key)
        today_str = datetime.now().strftime("%Y-%m-%d")
        system_instruction = f"Eres un auditor experto extrayendo datos de recibos. Hoy es {today_str}. Reglas: Montos en CENTAVOS, fecha YYYY-MM-DD."
        image_bytes = await file.read(MAX_RECEIPT_BYTES + 1)
        if len(image_bytes) > MAX_RECEIPT_BYTES:
            raise HTTPException(status_code=413, detail="El recibo supera el tamaño máximo permitido")
        response = await with_gemini_retry_async(lambda: client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [system_instruction, types.Part.from_bytes(data=image_bytes, mime_type=file.content_type or "image/jpeg")]),
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=AudioToTxnResponse, temperature=0.1)
        ))
        if not response.text:
            raise ValueError("Empty receipt response")

        return json.loads(response.text)
    except HTTPException:
        raise
    except json.JSONDecodeError as error:
        logger.exception("Gemini returned invalid receipt JSON")
        raise HTTPException(status_code=500, detail="La IA no devolvió un formato válido.") from error
    except Exception as error:
        logger.exception("Gemini receipt processing failed")
        raise HTTPException(status_code=500, detail="No se pudo analizar el recibo.") from error
