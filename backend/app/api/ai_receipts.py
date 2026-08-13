"""
Extracción de transacciones desde audio (nota de voz) o imagen de recibo,
usando el modelo multimodal de Gemini. Se monta bajo /api/ai vía api/ai.py.

Nota: no vive en ai_audio.py a propósito. Ambos routers comparten el mismo
prefijo /api/ai (ai.router se registra antes que ai_audio.router en
main.py, así que en caso de choque de ruta gana este módulo), pero
ai_audio.py define su propio get_gemini_key sin fallback a la variable de
entorno GEMINI_API_KEY, mientras que estos dos endpoints sí la usan
(vía app.api.ai_shared.get_gemini_key). Fusionarlos habría cambiado ese
fallback silenciosamente.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from typing import List, Optional, Any, cast
import json
import base64
from datetime import datetime
from sqlalchemy.orm import Session
from google.genai import types
import google.genai as genai
from app.services.ai_models import MULTIMODAL_MODEL
from database import get_db
from app.models.category import Category
from app.api.ai_shared import get_gemini_key

router = APIRouter()


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
