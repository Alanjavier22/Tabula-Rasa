from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
import google.genai as genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Optional, Any, cast
from app.services.ai_models import MULTIMODAL_MODEL
import os
from app.models.config import Config

router = APIRouter(
    prefix="/api/ai", 
    tags=["AI Vision"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)

class ReceiptSplit(BaseModel):
    description: str
    amount: int  # Cents
    suggested_category_id: Optional[str] = None
    reasoning: str

class ReceiptParseResponse(BaseModel):
    merchant: str
    date: str  # YYYY-MM-DD
    total_amount: int  # Cents
    splits: List[ReceiptSplit]
    confidence: float

@router.post("/parse-receipt", response_model=ReceiptParseResponse)
async def parse_receipt(file: UploadFile = File(...), db: Session = Depends(get_db)):
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    client = genai.Client(api_key=cast(str, config.value))
    
    try:
        content_bytes = await file.read()
        mime_type = file.content_type or "image/jpeg"
        
        # We only accept images and PDFs
        if not mime_type.startswith("image/") and mime_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Only images and PDFs are supported for receipt parsing")

        system_instruction = (
            "Eres un experto analizador de recibos y facturas. Tu trabajo es extraer los datos clave "
            "y separar la factura en 'splits' lógicos (ej. separar alimentos de artículos de limpieza). "
            "IMPORTANTE: Retorna montos SIEMPRE EN CENTAVOS (multiplica por 100 y quita decimales). "
            "La fecha debe ser YYYY-MM-DD."
        )

        response = client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [
                types.Part.from_bytes(data=content_bytes, mime_type=mime_type),
                types.Part.from_text(text="Extrae los datos de esta factura.")
            ]),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "merchant": {"type": "string"},
                        "date": {"type": "string"},
                        "total_amount": {"type": "integer"},
                        "splits": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {"type": "string"},
                                    "amount": {"type": "integer"},
                                    "reasoning": {"type": "string"}
                                },
                                "required": ["description", "amount", "reasoning"]
                            }
                        },
                        "confidence": {"type": "number"}
                    },
                    "required": ["merchant", "date", "total_amount", "splits", "confidence"]
                }
            )
        )
        
        import json
        response_text = (response.text or "").strip()
        if not response_text:
            response_text = "{}"
        result = json.loads(response_text)
        return ReceiptParseResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analizando recibo: {str(e)}")
