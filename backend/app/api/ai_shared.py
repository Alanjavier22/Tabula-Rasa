"""
Helpers y modelos Pydantic compartidos entre los sub-routers de /api/ai
(ai_categories.py, ai_whatif.py, ai_anomalies.py, ai_receipts.py).

Nota: existe un get_gemini_key casi idéntico en ai_audio.py, pero con una
diferencia real de comportamiento — ese NO cae a la variable de entorno
GEMINI_API_KEY si no hay key en la tabla config, este sí. Se mantienen
separados a propósito para no alterar el fallback de ninguno de los dos
grupos de endpoints al partir ai.py.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json
import os
import google.genai as genai
from google.genai import types
from app.services.ai_models import LITE_MODEL, with_gemini_retry
from app.models.config import Config


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


async def call_gemini_json(prompt: str, api_key: str, response_schema: Optional[type] = None, model: str = LITE_MODEL) -> dict:
    """
    Shared utility function to call Gemini API with strict production rules.
    """
    try:
        client = genai.Client(api_key=api_key)

        response = with_gemini_retry(lambda: client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        ))

        if not response.text:
            raise HTTPException(status_code=500, detail="Gemini returned an empty response")

        return json.loads(response.text)
    except TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON response")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API error: {str(e)}")
