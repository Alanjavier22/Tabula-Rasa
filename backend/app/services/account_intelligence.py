import json
import hashlib
import logging
import asyncio
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import google.genai as genai
from google.genai import types
from app.services.ai_models import LITE_MODEL
from database import SessionLocal
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.category import Category
from app.services.account_statement_parser import convert_to_csv_string, local_extract_transactions

logger = logging.getLogger(__name__)

class ExtractedAccountTransaction(BaseModel):
    date: str = Field(description="Fecha de la transacción en formato YYYY-MM-DD")
    description: str = Field(description="Descripción o detalle del movimiento")
    amount_cents: int = Field(description="Monto en centavos (valor absoluto). Ej: 10.50 -> 1050")
    transaction_type: str = Field(description="'expense' para retiros/pagos/egresos, 'income' para depósitos/ingresos")
    category_id: Optional[str] = Field(description="Omitir este campo", default=None)
    category_name: Optional[str] = Field(description="Omitir este campo", default=None)
    beneficiary: Optional[str] = Field(description="Beneficiario u originador si está disponible en el documento", default=None)
    balance_cents: Optional[int] = Field(description="Saldo efectivo/contable resultante después de este movimiento en centavos", default=None)

class AccountParsingResponse(BaseModel):
    bank_name: str = Field(description="Nombre del banco deducido del documento")
    account_type: str = Field(description="Tipo de cuenta (Ahorros, Corriente, etc.)")
    period_start: Optional[str] = Field(description="Fecha de inicio del reporte YYYY-MM-DD")
    period_end: Optional[str] = Field(description="Fecha de fin del reporte YYYY-MM-DD")
    total_income_cents: Optional[int] = Field(description="Suma total de ingresos en centavos")
    total_expense_cents: Optional[int] = Field(description="Suma total de egresos en centavos")
    transactions: List[ExtractedAccountTransaction]

class AccountIntelligenceService:
    def __init__(self, db_session=None):
        self.db = db_session or SessionLocal()

    def _get_api_key(self) -> Optional[str]:
        config = self.db.query(Config).filter(Config.key == "gemini_api_key").first()
        if config and config.value:
            return str(config.value)
        return None

    def generate_fingerprint(self, date: str, description: str, amount_cents: int, account_id: str, balance_cents: Optional[int] = None, suffix: str = "") -> str:
        """Generates a unique hash to prevent duplicates, including balance to disambiguate identical transactions."""
        raw_str = f"{date}|{description.strip().upper()}|{amount_cents}|{account_id}|{balance_cents or ''}|{suffix}"
        return hashlib.sha256(raw_str.encode()).hexdigest()

    async def parse_account_document(self, file_data: bytes, filename: str, account_id: str, expected_bank_name: Optional[str] = None) -> Dict[str, Any]:
        api_key = self._get_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY no configurada en el sistema.")

        client = genai.Client(api_key=api_key)
        
        parsed_data: Dict[str, Any] = {"transactions": []}
        
        # --- NUEVO: Extracción Híbrida (Local First) ---
        logger.info("[AccountIntelligence] Intentando extracción heurística local...")
        local_transactions = local_extract_transactions(file_data, filename)
        
        if isinstance(local_transactions, dict) and local_transactions.get("transactions"):
            tx_count = len(local_transactions["transactions"])
            logger.info(f"[AccountIntelligence] ÉXITO LOCAL: Se extrajeron {tx_count} transacciones sin usar IA.")
            parsed_data = local_transactions
        else:
            logger.info("[AccountIntelligence] Extracción local falló o no encontró datos. Pasando a IA (Tier 3)...")
            # 1. Convertir archivo a texto crudo para la IA
            raw_csv_text = convert_to_csv_string(file_data, filename)
            system_instruction = f"""Eres un auditor financiero experto en Ecuador. Tu tarea es EXTRAER transacciones de cuentas de ahorro/corriente a partir de datos en crudo (CSV/Excel convertido a texto).
            
            El texto provisto puede contener cabeceras basura, resúmenes, y luego una tabla de movimientos.
            Debes IGNORAR la basura y enfocarte solo en la tabla real de movimientos.
            
            IMPORTANTE: Se espera que el documento sea del banco: {expected_bank_name or "Desconocido"}. 
            Si ves nombres de otros bancos en las descripciones de las transacciones (ej: "RET. PACIFICO", "BANRED", "PICHINCHA"), NO asumas que el documento es de esos bancos. Estos son solo intermediarios o beneficiarios. El emisor real es {expected_bank_name or "el banco principal"}.

            REGLAS CRÍTICAS:
            1. MONTO: Extrae el monto exacto en centavos (ej: $15.20 -> 1520). Siempre en valor ABSOLUTO positivo.
            2. TIPO: Si es ingreso/depósito usa 'income'. Si es egreso/retiro usa 'expense'.
            3. FECHAS: Convierte cualquier fecha al formato estandarizado YYYY-MM-DD.
            4. DESCRIPCIÓN: Une columnas de detalle si es necesario para dar contexto, pero mantenlo limpio.
            5. FILTRADO: NO incluyas filas de saldos iniciales, finales, o cabeceras de tabla como si fueran transacciones.
            6. CATEGORIZACIÓN: NO categorices las transacciones. Deja los campos de categoría vacíos. Solo extrae la data cruda.
            7. SALDO: Extrae el saldo efectivo/contable (balance) resultante después de cada movimiento en centavos. Este es CRITICO para diferenciar consumos idénticos.
            8. BENEFICIARIO: Extrae el campo "Beneficiario" o "Destinatario" de cada movimiento. Puede ser un nombre de persona (ej: "ALARCON MONTERO DANIEL ISAAC"), comercio (ej: "DLC UBER RIDES SA009..."), número de tarjeta (ej: "376653XXXXXX0754"), o número de teléfono/cuenta. Este dato es CRÍTICO para la categorización inteligente.
            """

            prompt = "Analiza el siguiente extracto bancario en crudo y extrae todas las transacciones financieras reales.\n\n" + raw_csv_text

            # 3. Llamada a Gemini con Reintentos (Exponential Backoff más agresivo)
            import time
            max_retries = 8
            last_error = None
            
            for attempt in range(max_retries):
                try:
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=LITE_MODEL,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            response_mime_type="application/json",
                            response_schema=AccountParsingResponse,
                            temperature=0.1
                        )
                    )
                    # Si llegamos aquí, la llamada fue exitosa
                    if not response.text:
                        raise ValueError("Gemini returned an empty response")
                        
                    parsed_data = json.loads(response.text)
                    break
                except Exception as e:
                    last_error = e
                    # Si es un error de cuota o disponibilidad (503, 429, etc.), esperamos más
                    if attempt < max_retries - 1:
                        # Espera incremental: 5s, 10s, 15s, 20s...
                        wait_time = (attempt + 1) * 5 
                        logger.warning(f"[IA] Gemini ocupado ({e}). Reintento {attempt + 1}/{max_retries} en {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        raise ValueError(f"IA no disponible tras {max_retries} intentos. Google reporta: {str(e)}")
        
        # ── TIER 4: Batch Categorization ──
        # We process all transactions in one go using the new batch engine
        from app.services.categorizer import categorize_batch
        
        # Preparar lista para el categorizador
        batch_input = [
            {
                'description': tx['description'],
                'amount': tx['amount_cents'],
                'transaction_type': tx['transaction_type'],
                'beneficiary': tx.get('beneficiary', '')
            }
            for tx in parsed_data['transactions']
        ]
        
        # Obtener categorías en bloque
        cat_results = categorize_batch(batch_input, self.db)
        
        # Enriquecer transacciones con los resultados del lote
        categories_dict = {str(c.id): c.name for c in self.db.query(Category).all()}
        
        enriched_transactions = []
        seen_in_batch = {}

        for idx, tx in enumerate(parsed_data['transactions']):
            # Identificamos duplicados internos para asignar un sufijo y que tengan fingerprints únicos
            # Esto es vital para transacciones idénticas (mismo monto y balance) el mismo día.
            batch_key = f"{tx['date']}_{tx['amount_cents']}_{tx['description'].strip().upper()}_{tx.get('balance_cents')}"
            occurrence_count = seen_in_batch.get(batch_key, 0)
            seen_in_batch[batch_key] = occurrence_count + 1
            
            suffix = f"_{occurrence_count}" if occurrence_count > 0 else ""
            fp = self.generate_fingerprint(tx['date'], tx['description'], tx['amount_cents'], account_id, tx.get('balance_cents'), suffix)
            
            tx_dict = tx.copy()
            tx_dict['fingerprint'] = fp
            
            # Usar resultado del batch
            cat_tuple = cat_results.get(idx)
            if cat_tuple:
                cat_id, clarification = cat_tuple
                tx_dict['category_id'] = cat_id
                tx_dict['needs_clarification'] = clarification
                if cat_id in categories_dict:
                    tx_dict['category_name'] = categories_dict[cat_id]
            
            enriched_transactions.append(tx_dict)

        # Re-evaluar duplicados con el fingerprint final en una sola query IN (...)
        # en vez de una query por transacción dentro del loop de arriba.
        all_fingerprints = [tx_dict['fingerprint'] for tx_dict in enriched_transactions]
        existing_fingerprints = {
            row[0] for row in self.db.query(Transaction.fingerprint).filter(
                Transaction.fingerprint.in_(all_fingerprints), Transaction.is_deleted == False
            ).all()
        }
        for tx_dict in enriched_transactions:
            tx_dict['is_duplicate'] = tx_dict['fingerprint'] in existing_fingerprints

        parsed_data['transactions'] = enriched_transactions
        return parsed_data
