"""Helpers and models shared by the /api/ai sub-routers."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json
from google.genai import types
from google.genai import errors
from app.services.ai_models import LITE_MODEL, with_gemini_retry_async
from app.services.gemini_gateway import create_gemini_client, get_configured_gemini_key


def get_gemini_key(db: Session) -> str:
    api_key = get_configured_gemini_key(db)
    if api_key:
        return api_key
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
        client = create_gemini_client(api_key)

        response = await with_gemini_retry_async(lambda: client.models.generate_content(
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
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON response")
    except errors.APIError as e:
        code = getattr(e, "code", None)
        if code in {401, 403}:
            raise HTTPException(status_code=401, detail="Error de autenticación con la API de Gemini.")
        if code == 429:
            raise HTTPException(status_code=429, detail="Límite temporal de la API de Gemini. Intenta nuevamente en unos segundos.")
        if code and code >= 500:
            raise HTTPException(status_code=503, detail="El servicio de Google Gemini está temporalmente no disponible.")
        raise HTTPException(status_code=502, detail="Gemini rechazó la solicitud.")
    except Exception as e:
        raise HTTPException(status_code=502, detail="No se pudo completar la solicitud a Gemini.") from e
