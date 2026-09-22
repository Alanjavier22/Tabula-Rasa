import os
import json
import time
import sys
import hashlib
import logging
from typing import Optional, Any, cast
from database import SessionLocal
import google.genai as genai
from google.genai import types
from app.services.ai_models import LITE_MODEL
from pydantic import BaseModel, Field
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType, PaymentMethod, ExpenseType
from app.services.privacy import mask_description

logger = logging.getLogger(__name__)

# Configure UTF-8 encoding for stdout to handle emojis on Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')


# AI bypass flag for cold load migration
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"


class AICategorizationBatchItem(BaseModel):
    index: int = Field(description="El índice original de la transacción en la lista proporcionada.")
    category_id: str = Field(description="El ID ÚNICO de la categoría seleccionada.")
    confidence: float = Field(description="Nivel de confianza de la predicción, entre 0.0 y 1.0.")
    reasoning: str = Field(description="Breve justificación de la elección.")
    needs_clarification: bool = Field(default=False, description="¿La IA tiene dudas y requiere que el usuario confirme?")


class AICategorizationBatchResponse(BaseModel):
    items: list[AICategorizationBatchItem] = Field(description="Lista de resultados de categorización.")


def normalize_description(description: str) -> str:
    """Normalize a transaction description for pattern matching."""
    import re
    import unicodedata
    text = (description or "").strip().upper()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"\s+", " ", text).strip()
    return text


# Descriptions that are too generic to be useful as pattern keys
GENERIC_DESCRIPTIONS = {
    "COMPRA POS INTERNACIONAL", "COMPRA MAESTRO LOCAL",
    "IVA SERVICIO DIGITAL AH", "IVA 15% COMISIÓN", "IVA 15% COMISION",
}


def is_generic_description(description: str) -> bool:
    """Check if a description is too generic to be a useful pattern key."""
    return normalize_description(description) in GENERIC_DESCRIPTIONS


def get_pattern_based_category(description: str, db_session, beneficiary: Optional[str] = None) -> Optional[str]:
    """
    LAYER 1: Pattern Memory (DB lookup).
    Checks the category_patterns table for a matching pattern.
    Returns the category_id if found, None otherwise.
    
    Matching strategy:
      1. Exact match on beneficiary (if available) — most specific
      2. Exact match on the full normalized description
      3. Partial match: any stored pattern is contained in description OR beneficiary
    """
    from app.models.category_pattern import CategoryPattern
    from datetime import datetime, timezone
    
    desc_normalized = normalize_description(description)
    benef_normalized = normalize_description(beneficiary) if beneficiary else None
    
    if not desc_normalized:
        return None
    
    def _mark_hit(pattern_obj):
        pattern_obj.hit_count += 1
        pattern_obj.last_used_at = datetime.now(timezone.utc)
        try:
            db_session.flush()
        except Exception:
            pass
    
    # 1. Exact match on beneficiary (highest specificity)
    if benef_normalized:
        exact_benef = db_session.query(CategoryPattern).filter(
            CategoryPattern.pattern == benef_normalized
        ).first()
        if exact_benef:
            _mark_hit(exact_benef)
            return exact_benef.category_id
    
    # 2. Exact match on description
    exact = db_session.query(CategoryPattern).filter(
        CategoryPattern.pattern == desc_normalized
    ).first()
    if exact:
        _mark_hit(exact)
        return exact.category_id
    
    # 3. Partial match: check if any stored pattern is a substring of description OR beneficiary
    all_patterns = db_session.query(CategoryPattern).order_by(
        CategoryPattern.source.desc(),  # 'user' > 'system'
        CategoryPattern.hit_count.desc()
    ).all()
    
    # Build the search text: description + beneficiary combined
    search_text = desc_normalized
    if benef_normalized:
        search_text = f"{desc_normalized} {benef_normalized}"
    
    for pat in all_patterns:
        if pat.pattern in search_text:
            _mark_hit(pat)
            return pat.category_id
    
    return None


def learn_category_pattern(db_session, description: str, category_id: str, beneficiary: Optional[str] = None):
    """
    Learn a new pattern from a user's manual recategorization.
    
    Smart key selection:
      - If description is generic AND beneficiary exists → learn from beneficiary
      - Otherwise → learn from description
    """
    from app.models.category_pattern import CategoryPattern
    
    # Decide the best pattern key
    if beneficiary and is_generic_description(description):
        pattern_key = _extract_beneficiary_key(beneficiary)
    else:
        pattern_key = normalize_description(description)
    
    if not pattern_key or not category_id:
        return
    
    existing = db_session.query(CategoryPattern).filter(
        CategoryPattern.pattern == pattern_key
    ).first()
    
    if existing:
        existing.category_id = category_id
        existing.source = "user"
        existing.hit_count += 1
    else:
        new_pattern = CategoryPattern(
            pattern=pattern_key,
            category_id=category_id,
            source="user",
            hit_count=1
        )
        db_session.add(new_pattern)
    
    try:
        db_session.flush()
    except Exception:  # pragma: no cover
        logger.exception("[Categorizer] Error learning pattern")  # pragma: no cover


def _extract_beneficiary_key(beneficiary: str) -> str:
    """
    Extract the meaningful part of a beneficiary string for pattern matching.
    
    Examples:
      'DLC UBER RIDES         SA009MDSK1ENNP           4121' → 'DLC UBER RIDES'
      'GOOGLE SPOTIFY MUSIC   MO009MDSER2YNN'             → 'GOOGLE SPOTIFY MUSIC'
      '376653XXXXXX0754'                                    → '376653XXXXXX0754'
    """
    import re
    normalized = normalize_description(beneficiary)
    if not normalized:
        return ""
    
    # Split on large whitespace gaps (5+ spaces) — common bank formatting
    parts = re.split(r'\s{5,}', normalized)
    if parts:
        meaningful = parts[0].strip()
        # Remove trailing transaction codes (alphanumeric with 3+ digits)
        meaningful = re.sub(r'\s+[A-Z]{0,3}\d{3}[A-Z0-9]*+$', '', meaningful).strip()
        if meaningful:
            return meaningful
    
    return normalized



def get_semantic_category(description: str, amount: int, db_session=None, transaction_type: Optional[str] = None) -> Optional[str]:
    """
    Fallback for single-transaction categorization (UI usage).

    ``categorize_batch`` devuelve pares ``(category_id, needs_clarification)``
    para conservar la señal de revisión humana. Este adaptador se utiliza en
    flujos que solo necesitan el ID y no debe propagar el par directamente a
    SQLAlchemy.
    """
    results = categorize_batch([{'description': description, 'amount': amount, 'transaction_type': transaction_type}], db_session, throttle=False)
    result = results.get(0)
    if not result:
        return None

    category_id, _needs_clarification = result
    return category_id


def get_heuristic_category(description: str, db) -> Optional[str]:
    """
    LAYER 0: Fast Heuristic Rules for the Ecuadorian market.
    """
    desc = normalize_description(description)
    
    rules = {
        "PAGO DE TARJETA DE CREDITO": "Obligaciones Financieras",
        "INTERESES GANADOS": "Ahorro e Inversión",
        "META ACREDITADA": "Ahorro e Inversión",
        "RETIRO DE TU META": "Transferencia Interna",
        "TRANSFERENCIA INTERNA": "Transferencia Interna",
        "IVA SERVICIO DIGITAL": "Movilidad",
        "SUELDO": "Ingresos",
        "CAJ/AUTO.RET.": "Retiros en Efectivo",
        "RECAUD. TIENDEC": "Compras Personales y Retail",
        "DE PRATI": "Compras Personales y Retail",
        "MEGAMAXI": "Alimentación",
        "SUPERMAXI": "Alimentación",
    }
    
    for pattern, cat_name in rules.items():
        if pattern in desc:
            cat = db.query(Category).filter(Category.name.ilike(f"%{cat_name}%")).first()
            return str(cat.id) if cat else None
    return None


def _categorize_locally(transactions: list, db) -> tuple[dict, list]:
    results = {}
    pending_ai = []
    for index, transaction in enumerate(transactions):
        description = transaction.get('description', '')
        beneficiary = transaction.get('beneficiary', '')
        heuristic_id = get_heuristic_category(
            description,
            db,
        )
        if heuristic_id:
            results[index] = (heuristic_id, False)
            continue

        pattern_id = get_pattern_based_category(description, db, beneficiary)
        if pattern_id:
            results[index] = (pattern_id, False)
        else:
            pending_ai.append((index, transaction))
    return results, pending_ai


def _assign_fallback_categories(results: dict, transactions: list, category_id: str) -> None:
    for index, _ in transactions:
        results[index] = (category_id, True)


def _other_category_id(categories: list) -> str:
    return str(next((category.id for category in categories if 'Otros' in category.name), categories[0].id))


def _build_ai_instruction(category_map: list[dict]) -> str:
    return (
        "Eres un categorizador financiero experto para el mercado de ECUADOR. Tu objetivo es clasificar transacciones bancarias con precisión quirúrgica.\n\n"
        f"CATEGORÍAS DISPONIBLES (ID y Nombre):\n{json.dumps(category_map, ensure_ascii=False)}\n\n"
        "INSTRUCCIONES TÉCNICAS:\n"
        "1. Usa el 'id' de la categoría para responder.\n"
        "2. Prioriza el campo 'Beneficiario' si está presente, ya que contiene el comercio real.\n"
        "3. Si la descripción es genérica (ej: COMPRA POS INTERNACIONAL), el beneficiario es la clave.\n\n"
        "GUÍA DE CLASIFICACIÓN PRIORITARIA (ECUADOR):\n"
        "- 'Pago de tarjeta de crédito' o números de tarjeta (ej: 3766..., 4110...) -> 'Obligaciones Financieras'.\n"
        "- 'CIRCULOS', 'RELOJ', 'PIKEOS', 'FIBU' (Cobros compartidos) -> 'Ingresos' (si son positivos) o 'Alimentación' (si son negativos).\n"
        "- 'TRANSFERENCIA INTERNA' o 'Otras cuentas' -> 'Transferencia Interna'.\n"
        "- 'IVA SERVICIO DIGITAL' siempre va en la misma categoría que la compra original (ej: IVA UBER -> Movilidad).\n"
        "- 'RECAUD. TIENDEC', 'DE PRATI', 'MEGAMAXI', 'MARATHON' -> 'Compras Personales y Retail'.\n"
        "- 'SUELDO', 'ROL', 'FIBU' (ingreso) -> 'Ingresos'.\n"
        "- 'RET. CAJERO', 'ATM' -> 'Retiros en Efectivo'.\n"
        "- 'Meta acreditada', 'Intereses Meta' -> 'Ahorro e Inversión'.\n"
        "- 'REVERSO', 'DEVOLUCION' -> 'Devoluciones / Ajustes'.\n"
        "STRICT RULES:\n"
        "1. reasoning: Breve (máximo 15 palabras).\n"
        "2. category_id: Usa ÚNICAMENTE los IDs proporcionada.\n"
        "3. index: Mantén el índice original para mapear correctamente.\n"
        "4. Si no estás seguro o la descripción es ambigua (ej: 'COMPRA VARIOS'), usa el ID de la categoría 'Otros' y pon 'needs_clarification' en true.\n"
        "5. Si el nombre del comercio en el beneficiario no te es familiar, marca 'needs_clarification' en true.\n"
    )


def _apply_batch_results(
    results: dict,
    batch_results: dict,
    category_by_id: dict,
    other_category_id: str,
) -> None:
    for item in batch_results.get('items', []):
        index = item.get('index')
        confidence = item.get('confidence', 0)
        category_id = item.get('category_id')
        if index is None:
            continue
        if confidence >= 0.45 and category_id in category_by_id:
            clarification = item.get('needs_clarification', False) or confidence < 0.70
            results[index] = (category_id, clarification)
        else:
            results[index] = (other_category_id, True)


def _categorize_chunk_with_ai(
    client,
    categories: list,
    chunk: list,
    system_instruction: str,
    transaction_text: str,
    results: dict,
) -> None:
    max_retries = 5
    retry_count = 0
    while retry_count < max_retries:
        try:
            response = client.models.generate_content(
                model=LITE_MODEL,
                contents=system_instruction + "\n\nLISTA A PROCESAR:\n" + transaction_text,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AICategorizationBatchResponse,
                    temperature=0.1,
                ),
            )
            batch_results = json.loads((response.text or "{}").strip())
            category_by_id = {str(category.id): category for category in categories}
            other_category_id = _other_category_id(categories)
            _apply_batch_results(results, batch_results, category_by_id, other_category_id)
            break
        except Exception as error:
            is_retryable = ("503" in str(error) or "UNAVAILABLE" in str(error)) and retry_count < max_retries
            if is_retryable:
                retry_count += 1
                wait_time = (retry_count + 1) * 4
                logger.warning(f"[Categorizer] Gemini ocupado (503). Reintentando en {wait_time}s... ({retry_count}/{max_retries})")
                time.sleep(wait_time)
                continue

            logger.exception("[Categorizer] Error en Batch AI")  # pragma: no cover
            _assign_fallback_categories(results, chunk, _other_category_id(categories))
            break

    other_category_id = _other_category_id(categories)
    for index, _ in chunk:
        if index not in results:
            results[index] = (other_category_id, True)


def _categorize_pending_with_ai(
    client,
    categories: list,
    pending_ai: list,
    results: dict,
    throttle: bool,
) -> dict:
    category_map = [
        {'id': str(category.id), 'name': category.name, 'description': category.description or ''}
        for category in categories
    ]
    system_instruction = _build_ai_instruction(category_map)
    chunks = [pending_ai[index:index + 80] for index in range(0, len(pending_ai), 80)]
    logger.info(f"[Categorizer] Iniciando procesamiento de {len(pending_ai)} transacciones en {len(chunks)} lotes...")

    for chunk_index, chunk in enumerate(chunks):
        if throttle:
            wait_time = 1 if chunk_index > 0 else 0.5
            logger.info(f"[Categorizer] Throttling: Esperando {wait_time}s...")
            time.sleep(wait_time)

        transaction_text = "\n".join([
            f"- ID:{index} | Desc: '{mask_description(transaction.get('description', ''))}' | Beneficiario: '{transaction.get('beneficiary', '')}' | Monto: ${transaction.get('amount', 0) / 100:.2f} | Tipo: {transaction.get('transaction_type')}"
            for index, transaction in chunk
        ])
        _categorize_chunk_with_ai(
            client,
            categories,
            chunk,
            system_instruction,
            transaction_text,
            results,
        )
    return results


def categorize_batch(transactions: list, db_session=None, throttle: bool = True) -> dict:
    """
    Categorize multiple transactions efficiently using Rule-based logic + Batch AI.
    """
    if not transactions:
        return {}

    db = db_session or SessionLocal()
    try:
        results, pending_ai = _categorize_locally(transactions, db)
        if not pending_ai or not AI_ENABLED:
            if not AI_ENABLED and pending_ai:
                otros_cat = db.query(Category).filter(Category.name == "Otros (🔄)").first()
                fallback_id = str(otros_cat.id) if otros_cat else "unknown"
                _assign_fallback_categories(results, pending_ai, fallback_id)
            return results

        categories = db.query(Category).all()
        if not categories:
            return results

        from app.models.config import Config
        config_entry = db.query(Config).filter(Config.key == "gemini_api_key").first()
        api_key = config_entry.value if config_entry and config_entry.value else None

        if not api_key:
            _assign_fallback_categories(results, pending_ai, _other_category_id(categories))
            return results

        client = genai.Client(api_key=cast(str, api_key))
        return _categorize_pending_with_ai(client, categories, pending_ai, results, throttle)
    finally:
        if not db_session:
            db.close()


def calculate_fingerprint(description: str, amount: int, date: str, transaction_type: Optional[str] = None, account_id: Optional[str] = None) -> str:
    payload = f"{description}|{amount}|{date}|{transaction_type}|{account_id}"
    return hashlib.sha256(payload.encode()).hexdigest()


def detect_duplicates(description: str, amount: int, date: str, db, transaction_type: Optional[str] = None, running_balance: Optional[int] = None, account_id: Optional[str] = None, fingerprint: Optional[str] = None) -> bool:
    if not fingerprint:
        fingerprint = calculate_fingerprint(description, amount, date, transaction_type, account_id)
    
    exists_by_hash = db.query(Transaction).filter(
        Transaction.fingerprint == fingerprint,
        Transaction.is_deleted == False
    ).first()
    
    if exists_by_hash:
        return True

    if running_balance is not None and transaction_type is not None:
        exists_by_legacy = db.query(Transaction).filter(
            Transaction.amount == amount,
            Transaction.date == date,
            Transaction.transaction_type == transaction_type,
            Transaction.running_balance == running_balance,
            Transaction.is_deleted == False
        ).first()
        return exists_by_legacy is not None
    
    return False


def parse_date(date_str: str) -> str:
    from datetime import datetime
    formats = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"]
    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.isoformat()
        except ValueError:
            continue
    return date_str
