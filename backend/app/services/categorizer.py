import os
import json
import time
import sys
import hashlib
from typing import Optional
from database import SessionLocal
import google.genai as genai
from google.genai import types
from pydantic import BaseModel, Field
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType, PaymentMethod, ExpenseType
from app.services.privacy import mask_description

# Configure UTF-8 encoding for stdout to handle emojis on Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')


# AI bypass flag for cold load migration
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"


class AICategorizationResponse(BaseModel):
    category_name: str = Field(description="El NOMBRE EXACTO de la categoría seleccionada de la lista proporcionada. Debe coincidir exactamente con uno de los nombres de la lista.")
    confidence: float = Field(description="Nivel de confianza de la predicción, entre 0.0 y 1.0.")
    is_anomaly: bool = Field(description="True si el monto o la descripción son inusuales para esta categoría.")
    reasoning: str = Field(description="Breve justificación de la elección de la categoría.")


def get_rule_based_category(description: str, db_session) -> Optional[int]:
    """
    Deterministic rules for high-confidence patterns.
    Bypasses AI for internal transfers and reversals.
    """
    desc_upper = (description or "").upper()
    
    rules = [
        # pattern, target_category_name
        (["TRANSFERENCIA INTERNA", "TRANSFERENCIA ENTRE MIS CTAS", "META BCO GUAYAQUIL", "AHORRO META"], "Transferencia Interna"),
        (["REVERSO", "DEVOLUCION", "AJUSTE POR DIFERENCIA"], "Devoluciones / Ajustes"),
    ]
    
    for patterns, cat_name in rules:
        if any(p in desc_upper for p in patterns):
            cat = db_session.query(Category).filter(Category.name == cat_name).first()
            if not cat:
                cat = Category(name=cat_name, description=f"Categoria de sistema para {cat_name.lower()}")
                db_session.add(cat)
                db_session.commit()
                db_session.refresh(cat)
            return cat.id
    return None


def get_semantic_category(description: str, amount: int, db_session=None, transaction_type: str = None) -> Optional[int]:
    """
    Auto-categorize transaction based on semantic meaning of description and amount.
    Uses Rule-based logic first, then Gemini AI as a fallback.
    """
    if not description:
        return None
        
    db = db_session or SessionLocal()
    try:
        # 1. Rule-based categorization (FAST & ATOMIC)
        rule_cat_id = get_rule_based_category(description, db)
        if rule_cat_id:
            return rule_cat_id

        # 2. Bypass AI during cold load migration if enabled
        if not AI_ENABLED:
            otros_cat = db.query(Category).filter(Category.name == "Otros").first()
            return otros_cat.id if otros_cat else None

        # 3. Obtain current categories from DB
        categories = db.query(Category).all()
        if not categories:
            return None
            
        category_map = [{"id": cat.id, "name": cat.name, "description": cat.description or ""} for cat in categories]
        
        # 4. Check API Key
        from app.models.config import Config
        config_entry = db.query(Config).filter(Config.key == "gemini_api_key").first()
        api_key = config_entry.value if config_entry else None
        
        if not api_key:
            otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
            return otros_cat.id if otros_cat else categories[0].id
            
        # 5. Prompt setup
        type_context = ""
        if transaction_type == "expense" or transaction_type == "Gasto":
            type_context = "ESTA TRANSACCIÓN ES UN GASTO. BAJO NINGÚN CONCEPTO elijas categorías exclusivas de 'Ingresos'."
        elif transaction_type == "income" or transaction_type == "Ingreso":
            type_context = "ESTA TRANSACCIÓN ES UN INGRESO. NO elijas categorías exclusivas de 'Gastos'."

        system_instruction = (
            "Eres un categorizador financiero especializado en Ecuador. "
            "Clasifica la transacción en UNA de estas categorías exactas: "
            f"{json.dumps(category_map, ensure_ascii=False)}.\n\n"
            f"{type_context}\n\n"
            "PRUDENCIA FINANCIERA:\n"
            "- Si la descripción indica REVERSO, DEVOLUCIÓN o AJUSTE, usa 'Devoluciones / Ajustes'.\n"
            "- Si indica movimiento entre cuentas propias o METAS, usa 'Transferencia Interna'.\n"
            "- IMPORTANTE: Debes devolver el NOMBRE EXACTO de la categoría.\n\n"
            "CONTEXTO ECUATORIANO:\n"
            "- Supermaxi, Mi Comisariato, Prati, AQUÍ, La Favorita, Tía, Mega, Kywi -> Comestibles\n"
            "- IESS, SRI, Banco del Pacífico, Banco Pichincha, Banco Guayaquil -> Financiero/Salud/Impuestos\n"
            "- Uber, Cabify -> Transporte\n"
        )
        
        sanitized_description = mask_description(description)
        prompt = f"Descripción: '{sanitized_description}' | Monto: ${amount / 100:.2f}"
        
        client = genai.Client(api_key=api_key)
        
        # Retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=system_instruction + "\n\n" + prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=AICategorizationResponse,
                    )
                )
                break
            except Exception as e:
                if "503" in str(e) or "UNAVAILABLE" in str(e):
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                raise
        
        result = json.loads(response.text)
        pred_name = result["category_name"]
        confidence = result["confidence"]
        
        if confidence < 0.70:
            otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
            return otros_cat.id if otros_cat else categories[0].id

        category_by_name = {cat.name: cat for cat in categories}
        if pred_name in category_by_name:
            return category_by_name[pred_name].id
        
        otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
        return otros_cat.id if otros_cat else categories[0].id
        
    except Exception:
        otros_cat = db.query(Category).filter(Category.name == "Otros").first()
        return otros_cat.id if otros_cat else None
    finally:
        if not db_session:
            db.close()


def categorize_batch(transactions: list, db_session=None) -> dict:
    """
    Categorize multiple transactions.
    Uses Rule-based logic for the whole batch first.
    """
    if not transactions:
        return {}
    
    db = db_session or SessionLocal()
    try:
        results = {}
        pending_ai = []
        
        # 1. Rule-based pass for all
        for i, tx in enumerate(transactions):
            rule_id = get_rule_based_category(tx.get('description', ''), db)
            if rule_id:
                results[i] = rule_id
            else:
                pending_ai.append((i, tx))
        
        if not pending_ai:
            return results

        # 2. AI pass for remaining (simplified for now to individual calls to maintain logic)
        for idx, tx in pending_ai:
            results[idx] = get_semantic_category(
                description=tx.get('description', ''),
                amount=tx.get('amount', 0),
                db_session=db,
                transaction_type=tx.get('transaction_type')
            )
            
        return results
    finally:
        if not db_session:
            db.close()


def calculate_fingerprint(description: str, amount: int, date: str, transaction_type: str = None, account_id: str = None) -> str:
    payload = f"{description}|{amount}|{date}|{transaction_type}|{account_id}"
    return hashlib.sha256(payload.encode()).hexdigest()


def detect_duplicates(description: str, amount: int, date: str, db, transaction_type: str = None, running_balance: int = None, account_id: str = None, fingerprint: str = None) -> bool:
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
