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
from app.services.embedding_service import EmbeddingService
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
    return (description or "").strip().upper()


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
    except Exception as e:
        logger.error(f"[Categorizer] Error learning pattern: {e}")

    # Also store an embedding for this pattern for semantic matching
    try:
        from app.models.config import Config
        config_entry = db_session.query(Config).filter(Config.key == "gemini_api_key").first()
        if config_entry and config_entry.value:
            emb_service = EmbeddingService(api_key=str(config_entry.value))
            combined = f"{description} {beneficiary}".strip() if beneficiary else description
            if not is_generic_description(description):
                emb_service.store_pattern_embedding(combined, category_id, db_session)
    except Exception as e:
        logger.warning(f"[Categorizer] Error storing pattern embedding: {e}")


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
        meaningful = re.sub(r'\s+[A-Z]{0,3}\d{3,}[A-Z0-9]*$', '', meaningful).strip()
        if meaningful:
            return meaningful
    
    return normalized



def get_semantic_category(description: str, amount: int, db_session=None, transaction_type: Optional[str] = None) -> Optional[int]:
    """
    Fallback for single-transaction categorization (UI usage).
    """
    results = categorize_batch([{'description': description, 'amount': amount, 'transaction_type': transaction_type}], db_session)
    return results.get(0)


def get_heuristic_category(description: str, db, transaction_type: str = 'expense') -> Optional[str]:
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


def categorize_batch(transactions: list, db_session=None) -> dict:
    """
    Categorize multiple transactions efficiently using Rule-based logic + Batch AI.
    """
    if not transactions:
        return {}
    
    db = db_session or SessionLocal()
    try:
        results = {}
        pending_ai = []
        
        # 1. Local Processing (Tiers 0 & 1)
        for i, tx in enumerate(transactions):
            desc = tx.get('description', '')
            benef = tx.get('beneficiary', '')
            
            # Tier 0: Heuristics (Instant)
            heuristic_id = get_heuristic_category(desc, db, tx.get('transaction_type'))
            if heuristic_id:
                results[i] = (heuristic_id, False) # Heuristics are 100% certain
                continue

            # Tier 1: Pattern Memory (DB lookup)
            pattern_id = get_pattern_based_category(desc, db, benef)
            if pattern_id:
                results[i] = (pattern_id, False) # Learned patterns are 100% certain
            else:
                pending_ai.append((i, tx))
        
        if not pending_ai or not AI_ENABLED:
            # Handle AI_ENABLED=False fallback
            if not AI_ENABLED and pending_ai:
                otros_cat = db.query(Category).filter(Category.name == "Otros (🔄)").first()
                for idx, _ in pending_ai:
                    cat_id = str(otros_cat.id) if otros_cat else "unknown"
                    results[idx] = (cat_id, True)
            return results

        # 2. Prepare AI context
        categories = db.query(Category).all()
        if not categories:
            return results
            
        category_map = [{"id": str(cat.id), "name": cat.name, "description": cat.description or ""} for cat in categories]
        
        from app.models.config import Config
        config_entry = db.query(Config).filter(Config.key == "gemini_api_key").first()
        api_key = config_entry.value if config_entry and config_entry.value else None
        
        if not api_key:
            # Fallback to 'Otros' if no API key
            otros_cat = next((c for c in categories if "Otros" in c.name), categories[0])
            for idx, _ in pending_ai:
                results[idx] = (str(otros_cat.id), True)
            return results

        client = genai.Client(api_key=cast(str, api_key))
        embedding_service = EmbeddingService(api_key=cast(str, api_key))
        
        # Pre-pass: Cache embeddings for all non-generic transactions
        # This ensures the anomaly detector has embeddings to work with
        # Optimized: batch API calls for cache misses instead of N individual calls
        try:
            from app.models.transaction_embedding import TransactionEmbedding
            from app.services.embedding_service import EmbeddingService as EmbSvc
            
            cache_misses = []
            for i, tx in enumerate(transactions):
                desc = tx.get('description', '')
                if desc and not is_generic_description(desc) and i not in results:
                    benef = tx.get('beneficiary', '')
                    combined = f"{desc} {benef}".strip() if benef else desc
                    desc_hash = EmbSvc._description_hash(combined)
                    cached = db.query(TransactionEmbedding).filter(
                        TransactionEmbedding.description_hash == desc_hash
                    ).first()
                    if cached:
                        continue
                    cache_misses.append(combined)
            
            if cache_misses:
                embeddings = embedding_service.embed_batch(cache_misses)
                for desc, emb in zip(cache_misses, embeddings):
                    if emb is None:
                        continue
                    desc_hash = EmbSvc._description_hash(desc)
                    try:
                        new_record = TransactionEmbedding(
                            description_hash=desc_hash,
                            description=desc.strip(),
                            embedding=json.dumps(emb),
                            source="transaction",
                        )
                        db.add(new_record)
                        db.flush()
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"[Categorizer] Pre-pass embedding cache failed: {e}")
        
        # TIER 1.5: Embedding Similarity
        # Try semantic matching before resorting to batch AI
        try:
            still_pending = []
            
            for idx, tx in pending_ai:
                desc = tx.get('description', '')
                benef = tx.get('beneficiary', '')
                
                if is_generic_description(desc):
                    still_pending.append((idx, tx))
                    continue
                
                combined = f"{desc} {benef}".strip() if benef else desc
                match = embedding_service.find_similar_pattern(combined, db, threshold=0.85)
                if match:
                    cat_id, score = match
                    results[idx] = (cat_id, score < 0.92)
                else:
                    still_pending.append((idx, tx))
            
            pending_ai = still_pending
            logger.info(f"[Categorizer] Tier 1.5 (Embeddings): {len(results)} categorized, {len(pending_ai)} still pending AI")
        except Exception as e:
            logger.warning(f"[Categorizer] Tier 1.5 embedding matching failed, continuing to batch AI: {e}")
        
        if not pending_ai:
            return results
        
        # Tier 4: Batch Processing with Throttling to respect 15 RPM
        # Usamos un tamaño de lote de 80: Ideal para precisión en modelos Lite y cuotas RPM
        chunk_size = 80
        chunks = [pending_ai[i:i + chunk_size] for i in range(0, len(pending_ai), chunk_size)]
        
        logger.info(f"[Categorizer] Iniciando procesamiento de {len(pending_ai)} transacciones en {len(chunks)} lotes...")

        for i, chunk in enumerate(chunks):
            # Throttling: Pausa obligatoria para no saturar los 15 RPM (incluso en el primer lote para dar aire tras Tier 3)
            wait_time = 6 if i > 0 else 3
            logger.info(f"[Categorizer] Throttling: Esperando {wait_time}s para respetar cuota API...")
            time.sleep(wait_time)
            
            # Create a compact prompt for the batch (include beneficiary for context)
            tx_list_str = "\n".join([
                f"- ID:{idx} | Desc: '{mask_description(tx.get('description', ''))}' | Beneficiario: '{tx.get('beneficiary', '')}' | Monto: ${tx.get('amount', 0) / 100:.2f} | Tipo: {tx.get('transaction_type')}"
                for idx, tx in chunk
            ])

            system_instruction = (
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

            max_retries = 5
            retry_count = 0
            while retry_count < max_retries:
                try:
                    response = client.models.generate_content(
                        model=LITE_MODEL,
                        contents=system_instruction + "\n\nLISTA A PROCESAR:\n" + tx_list_str,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=AICategorizationBatchResponse,
                            temperature=0.1
                        )
                    )
                    
                    response_text = (response.text or "{}").strip()
                    batch_results = json.loads(response_text)
                    category_by_id = {str(cat.id): cat for cat in categories}
                    otros_cat_id = str(next((c.id for c in categories if "Otros" in c.name), categories[0].id))

                    for item in batch_results.get("items", []):
                        idx = item.get("index")
                        conf = item.get("confidence", 0)
                        cat_id = item.get("category_id")
                        
                        if idx is not None:
                            # Estructura del resultado: (category_id, needs_clarification)
                            if conf >= 0.45 and cat_id in category_by_id:
                                # Si la confianza es media (0.45 a 0.70), marcamos para aclaración aunque hayamos elegido una
                                clarification = item.get("needs_clarification", False) or (conf < 0.70)
                                results[idx] = (cat_id, clarification)
                                
                                # Learn embedding pattern from high-confidence AI results
                                if conf >= 0.70:
                                    tx = next((t for i, t in chunk if i == idx), None)
                                    if tx and not is_generic_description(tx.get('description', '')):
                                        try:
                                            combined = f"{tx.get('description', '')} {tx.get('beneficiary', '')}".strip()
                                            embedding_service.store_pattern_embedding(combined, cat_id, db)
                                        except Exception:
                                            pass
                            else:
                                results[idx] = (otros_cat_id, True)
                    
                    break # Success! Exit retry loop
                
                except Exception as e:
                    if ("503" in str(e) or "UNAVAILABLE" in str(e)) and retry_count < max_retries:
                        retry_count += 1
                        wait_time = (retry_count + 1) * 4 # Backoff: 8s, 12s, 16s...
                        logger.warning(f"[Categorizer] Gemini ocupado (503). Reintentando en {wait_time}s... ({retry_count}/{max_retries})")
                        time.sleep(wait_time)
                    else:
                        logger.error(f"[Categorizer] Error en Batch AI: {e}")
                        # Fallback to 'Otros' for this chunk
                        otros_cat_id = str(next((c.id for c in categories if "Otros" in c.name), categories[0].id))
                        for idx, _ in chunk:
                            results[idx] = (otros_cat_id, True)
                        break # Other errors don't trigger retry

            # Final check: if we hit max retries or some other exit, ensure chunk is categorized
            otros_cat_id = str(next((c.id for c in categories if "Otros" in c.name), categories[0].id))
            for idx, _ in chunk:
                if idx not in results:
                    results[idx] = (otros_cat_id, True)

        return results
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
