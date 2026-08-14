import json
import logging
from typing import Optional, cast

import google.genai as genai
from google.genai import types
from pydantic import BaseModel, Field

from app.services.ai_models import LITE_MODEL, with_gemini_retry

logger = logging.getLogger(__name__)

SRI_CATEGORIES = [
    "Alimentación",
    "Educación, Arte y Cultura",
    "Salud",
    "Vivienda",
    "Vestimenta",
    "Turismo",
    "No Deducible",
]


class SRIBatchItem(BaseModel):
    index: int = Field(description="El índice original de la transacción en la lista proporcionada.")
    sri_category: str = Field(description="Categoría SRI asignada.")


class SRIBatchResponse(BaseModel):
    items: list[SRIBatchItem] = Field(description="Lista de resultados de clasificación SRI.")


def sri_classify_batch(transactions: list, db_session, api_key: Optional[str] = None) -> dict[int, str]:
    """
    Clasifica un lote de transacciones (expense) en categorías deducibles del SRI Ecuador.
    Calcado del patrón de categorize_batch: un solo generate_content por chunk de 80.

    transactions: lista de dicts {'description': str, 'category_name': str}
    Devuelve {index: sri_category}.
    """
    if not transactions:
        return {}

    if not api_key:
        from app.models.config import Config
        config_entry = db_session.query(Config).filter(Config.key == "gemini_api_key").first()
        api_key = config_entry.value if config_entry and config_entry.value else None

    if not api_key:
        return {}

    client = genai.Client(api_key=cast(str, api_key))
    results: dict[int, str] = {}

    chunk_size = 80
    items = list(enumerate(transactions))
    chunks = [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]

    system_instruction = f"""
    Eres un experto tributario en Ecuador.
    Clasifica cada transacción en una de estas categorías del SRI:
    {json.dumps(SRI_CATEGORIES, ensure_ascii=False)}

    Guía rápida:
    - Supermercados, Restaurantes -> Alimentación
    - Farmacias, Hospitales, Médicos -> Salud
    - Arriendo, Alícuota, Ferretería (reparaciones), Luz, Agua -> Vivienda
    - Colegios, Libros, Gimnasio, Cursos -> Educación, Arte y Cultura
    - Ropa, Zapatos -> Vestimenta
    - Hoteles, Pasajes aéreos -> Turismo
    - Todo lo demás -> No Deducible

    Mantén el índice original de cada transacción para mapear correctamente.
    """

    for chunk in chunks:
        tx_list_str = "\n".join([
            f"- ID:{idx} | Desc: '{tx.get('description', '')}' | Categoría interna: '{tx.get('category_name', '')}'"
            for idx, tx in chunk
        ])

        try:
            response = with_gemini_retry(lambda: client.models.generate_content(
                model=LITE_MODEL,
                contents=system_instruction + "\n\nLISTA A PROCESAR:\n" + tx_list_str,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=SRIBatchResponse,
                    temperature=0.1
                )
            ))
            response_text = (response.text or "{}").strip()
            batch_results = json.loads(response_text)

            for item in batch_results.get("items", []):
                idx = item.get("index")
                sri_category = item.get("sri_category")
                if idx is not None and sri_category in SRI_CATEGORIES:
                    results[idx] = sri_category
        except Exception as e:
            logger.warning(f"[SRIClassifier] Error en batch: {e}")
            continue

    return results

class SRIClassifier:
    """
    Clasificador especializado en el SRI de Ecuador.
    Agrupa gastos en las categorías deducibles oficiales.
    """
    
    SRI_CATEGORIES = SRI_CATEGORIES

    # Mapeo oficial SRI para Declaración de Impuesto a la Renta
    SRI_CONCEPTS = {
        "Educación, Arte y Cultura": "5040",
        "Salud": "3290",
        "Alimentación": "3300",
        "Vivienda": "3310",
        "Vestimenta": "3320",
        "Turismo": "3325",
        "Total Deducciones": "3330",
        "RUC Contador": "100"
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)

    def classify(self, description: str, category_name: str = "") -> str:
        """Determina a qué grupo del SRI pertenece un gasto."""
        
        system_instruction = f"""
        Eres un experto tributario en Ecuador. 
        Clasifica la transacción en una de estas categorías del SRI:
        {json.dumps(self.SRI_CATEGORIES, ensure_ascii=False)}
        
        Guía rápida:
        - Supermercados, Restaurantes -> Alimentación
        - Farmacias, Hospitales, Médicos -> Salud
        - Arriendo, Alícuota, Ferretería (reparaciones), Luz, Agua -> Vivienda
        - Colegios, Libros, Gimnasio, Cursos -> Educación, Arte y Cultura
        - Ropa, Zapatos -> Vestimenta
        - Hoteles, Pasajes aéreos -> Turismo
        - Todo lo demás -> No Deducible
        """
        
        prompt = f"Transacción: '{description}' (Categoría interna: {category_name})"
        
        try:
            response = self.client.models.generate_content(
                model=LITE_MODEL,
                contents=system_instruction + "\n\n" + prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "object",
                        "properties": {
                            "sri_category": {"type": "string", "enum": self.SRI_CATEGORIES},
                            "reason": {"type": "string"}
                        },
                        "required": ["sri_category"]
                    }
                )
            )
            response_text = (response.text or "{}").strip()
            result = json.loads(response_text)
            return result.get("sri_category", "No Deducible")
        except Exception as e:
            logger.warning(f"Error in SRI classification: {e}")
            return "No Deducible"
