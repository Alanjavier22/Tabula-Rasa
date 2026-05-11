import json
import hashlib
import os
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
import google.genai as genai
from google.genai import types
from datetime import datetime, timezone
from database import SessionLocal
from sqlalchemy import func
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.import_log import ImportLog
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.category import Category

class ExtractedTransaction(BaseModel):
    date: str = Field(description="Fecha de la transacción en formato YYYY-MM-DD")
    description: str = Field(description="Descripción literal que aparece en el estado de cuenta")
    amount_cents: int = Field(description="Monto en centavos (ej: $10.50 -> 1050). Los pagos/abonos deben ser NEGATIVOS si reducen la deuda, los consumos POSITIVOS.")
    transaction_type: str = Field(description="'expense' para consumos, 'income' para pagos/abonos")
    category_name: Optional[str] = Field(description="El nombre de la categoría más adecuada (ej: Transporte, Comida, Entretenimiento)")
    is_deferred: bool = Field(description="True si es una cuota de un consumo diferido (ej: Cuota 3/12)")
    deferred_info: Optional[str] = Field(description="Información de la cuota si es diferido, ej: '3/12'")

class StatementParsingResponse(BaseModel):
    issuer_identity: str = Field(description="Nombre del banco y tipo de tarjeta detectado (ej: Banco Guayaquil Visa Platinum, Amex, Titanium Euphoria)")
    issuer_confidence: float = Field(description="Confianza en la identificación del emisor (0.0 a 1.0)")
    bank_name: str = Field(description="Nombre del banco detectado")
    card_type: str = Field(description="Tipo de tarjeta (Visa, Amex, etc.)")
    statement_period: str = Field(description="Periodo del estado de cuenta, ej: 'Abril 2026'")
    statement_month: int = Field(description="Mes numérico del estado de cuenta (1 a 12)")
    statement_year: int = Field(description="Año del estado de cuenta (ej: 2026)")
    statement_balance_cents: int = Field(description="Deuda total a pagar o 'Pago de Contado' en centavos (ej: $150.00 -> 15000)")
    payment_due_date: Optional[str] = Field(description="Fecha máxima de pago en formato YYYY-MM-DD")
    cut_off_date: Optional[str] = Field(description="Fecha de corte del estado de cuenta en formato YYYY-MM-DD")
    total_new_consumos_cents: int = Field(description="Suma total de consumos del mes en centavos")
    total_pagos_cents: int = Field(description="Suma total de pagos/abonos del mes en centavos")
    transactions: List[ExtractedTransaction]

class StatementIntelligenceService:
    def __init__(self, db_session=None):
        self.db = db_session or SessionLocal()

    def _get_api_key(self) -> Optional[str]:
        config = self.db.query(Config).filter(Config.key == "gemini_api_key").first()
        return config.value if config else None

    def generate_fingerprint(self, date: str, description: str, amount_cents: int, account_id: str) -> str:
        """Genera un hash único para evitar duplicados."""
        raw_str = f"{date}|{description.strip().upper()}|{amount_cents}|{account_id}"
        return hashlib.sha256(raw_str.encode()).hexdigest()

    async def parse_statement(self, file_path: str, account_id: str, expected_bank_name: str = None) -> Dict:
        """Usa Gemini 1.5 Flash para extraer transacciones de un PDF o Imagen."""
        api_key = self._get_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY no configurada en el sistema.")

        client = genai.Client(api_key=api_key)
        
        # Leemos el archivo para enviarlo a la IA
        with open(file_path, "rb") as f:
            file_data = f.read()

        # Obtener categorías actuales para que la IA sepa qué opciones tiene
        categories = self.db.query(Category).all()
        cat_list = [c.name for c in categories]

        system_instruction = f"""Eres un auditor financiero experto en Ecuador. Tu tarea es extraer con PRECISIÓN ABSOLUTA las transacciones de este estado de cuenta.
        
        IMPORTANTE: Se espera que este estado de cuenta sea del banco/emisor: {expected_bank_name or 'Desconocido'}.
        Si ves nombres de otros bancos en las descripciones de las transacciones (ej: pagos en cajeros de otro banco, transferencias a otras entidades), NO asumas que el documento es de esos bancos. El emisor real es {expected_bank_name or 'el banco principal'}.
        
        CATEGORÍAS DISPONIBLES: {", ".join(cat_list)}

        REGLAS CRÍTICAS:
        1. MONTO: Extrae el monto exacto. Multiplica por 100 para convertir a centavos (ej: 15.20 -> 1520).
        2. DEUDA TOTAL: Asegúrate de extraer el `statement_balance_cents` correcto (pago contado).
        3. FECHAS Y RAZONAMIENTO TEMPORAL:
           - Para consumos normales: Usa la fecha que aparece en el documento dentro del periodo actual.
           - PARA DIFERIDOS (DEDUCCIÓN INTELIGENTE): Si encuentras un consumo con cuotas (ej: 'Cuota 9/12') y una fecha que parece "fuera de lugar" (ej: Julio en un estado de cuenta de Abril), RAZONA:
             a) Si la cuota es 9/12 y estamos en Abril 2026, deduce que el consumo original fue en Julio 2025.
             b) Devuelve la fecha del registro como el periodo de facturación actual (ej: Abril 2026) para permitir la conciliación bancaria.
             c) No ignores la fecha original; la IA debe usarla para validar que el diferido es coherente, pero el 'date' resultante debe ser el del cobro actual.
           - NUNCA devuelvas una fecha futura respecto al 'statement_period'.
        4. TIPO: 
           - Consumos/Compras/Intereses -> transaction_type: 'expense' (Monto positivo).
           - Pagos/Abonos/Notas de Crédito -> transaction_type: 'income' (Monto negativo para el balance de deuda).
        5. CATEGORIZACIÓN: Elige la mejor categoría de la lista proporcionada.
        6. DIFERIDOS: Identifica si la descripción indica una cuota (ej: 'Cuota 2 de 6', '3/12').
        7. INTEGRIDAD: No inventes transacciones ni balances. Extrae el mes y año contable precisos.
        """

        prompt = "Analiza este documento y extrae todas las transacciones del periodo. Asegúrate de incluir pagos y consumos."

        # Soporte para PDF o Imágenes
        mime_type = "application/pdf" if file_path.lower().endswith(".pdf") else "image/jpeg"

        response = client.models.generate_content(
            model='gemini-3.1-flash-lite', 
            contents=[
                types.Part.from_bytes(data=file_data, mime_type=mime_type),
                prompt
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=StatementParsingResponse,
            )
        )

        parsed_data = json.loads(response.text)
        
        # Motor de Deduplicación Progresiva (Universal) — Adaptado para Tarjetas de Crédito
        enriched_transactions = []
        seen_in_batch = {}  # batch_key -> count para detectar duplicados intra-archivo

        for tx in parsed_data['transactions']:
            fp = self.generate_fingerprint(tx['date'], tx['description'], tx['amount_cents'], account_id)
            dt = datetime.fromisoformat(tx['date'])
            is_deferred_tx = tx.get('is_deferred', False) or "DIFERIDO" in tx['description'].upper()
            
            # ── TIER 1: Fingerprint exacto ──
            existing = self.db.query(Transaction).filter(Transaction.fingerprint == fp).first()

            # ── TIER 2: Búsqueda por fecha + monto + cuenta ──
            if not existing:
                if is_deferred_tx:
                    # Para diferidos, buscamos en todo el mes (la fecha exacta varía entre cortes)
                    candidates = self.db.query(Transaction).filter(
                        func.strftime('%Y-%m', Transaction.date) == dt.strftime('%Y-%m'),
                        Transaction.amount == abs(tx['amount_cents']),
                        Transaction.account_id == account_id
                    ).all()
                else:
                    # Para consumos normales, día exacto
                    candidates = self.db.query(Transaction).filter(
                        func.date(Transaction.date) == dt.date(),
                        Transaction.amount == abs(tx['amount_cents']),
                        Transaction.account_id == account_id
                    ).all()

                if candidates:
                    tx_desc_clean = tx['description'].upper().strip()
                    
                    if len(candidates) == 1:
                        candidate = candidates[0]
                        # Para tarjetas no tenemos running_balance, confiamos en la coincidencia base
                        # pero verificamos descripción para mayor seguridad
                        db_desc_clean = candidate.description.upper().strip()
                        if tx_desc_clean in db_desc_clean or db_desc_clean in tx_desc_clean:
                            existing = candidate
                        elif candidate.running_balance is not None and tx.get('balance_cents') is not None:
                            if candidate.running_balance == tx['balance_cents']:
                                existing = candidate
                        else:
                            # Sin más señales para desambiguar, asumimos coincidencia
                            existing = candidate
                    else:
                        # Múltiples candidatos: emparejar por descripción
                        for candidate in candidates:
                            db_desc_clean = candidate.description.upper().strip()
                            if tx_desc_clean in db_desc_clean or db_desc_clean in tx_desc_clean:
                                existing = candidate
                                break

            # ── TIER 3: Deduplicación intra-batch ──
            # En tarjetas de crédito no hay saldo progresivo, así que usamos
            # deferred_info como diferenciador adicional cuando está disponible.
            deferred_key = tx.get('deferred_info', '')
            batch_key = f"{tx['date']}_{tx['amount_cents']}_{tx['description'].strip().upper()}_{deferred_key}"
            
            is_batch_duplicate = batch_key in seen_in_batch
            seen_in_batch[batch_key] = seen_in_batch.get(batch_key, 0) + 1

            tx_dict = tx.copy()
            tx_dict['fingerprint'] = fp
            tx_dict['is_duplicate'] = (existing is not None) or is_batch_duplicate
            enriched_transactions.append(tx_dict)

        parsed_data['transactions'] = enriched_transactions
        return parsed_data

    def finalize_import(self, import_log_id: str, confirmed_transactions: List[Dict], statement_metadata: Optional[Dict] = None):
        """Guarda las transacciones confirmadas, actualiza el CreditCardStatement y marca snapshots como obsoletos."""
        log = self.db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
        if not log:
            return

        try:
            new_txs_count = 0
            earliest_date = datetime.now().date()

            for tx_data in confirmed_transactions:
                # Solo insertamos si no es duplicado o si el usuario fuerza la inserción
                if not tx_data.get('is_duplicate', False):
                    dt = datetime.fromisoformat(tx_data['date'])
                    if dt.date() < earliest_date:
                        earliest_date = dt.date()

                    # Buscar ID de la categoría sugerida
                    category_id = None
                    if tx_data.get('category_name'):
                        cat = self.db.query(Category).filter(Category.name == tx_data['category_name']).first()
                        if cat:
                            category_id = cat.id

                    new_tx = Transaction(
                        description=tx_data['description'],
                        amount=abs(tx_data['amount_cents']), # Guardamos el valor absoluto
                        transaction_type=tx_data['transaction_type'],
                        date=dt,
                        account_id=log.account_id,
                        category_id=category_id,
                        payment_method='credit_card',
                        fingerprint=tx_data['fingerprint'],
                        import_log_id=log.id,
                        is_manual=False,
                        metadata_json=json.dumps({
                            "is_deferred": tx_data.get('is_deferred'),
                            "deferred_info": tx_data.get('deferred_info')
                        })
                    )
                    self.db.add(new_tx)
                    new_txs_count += 1

            # Procesamiento de CreditCardStatement (Deuda Global)
            if statement_metadata and statement_metadata.get('statement_month') and statement_metadata.get('statement_year'):
                stmt_month = int(statement_metadata['statement_month'])
                stmt_year = int(statement_metadata['statement_year'])
                stmt_balance = int(statement_metadata.get('statement_balance_cents', 0))
                
                due_date = None
                if statement_metadata.get('payment_due_date'):
                    try:
                        due_date = datetime.strptime(statement_metadata['payment_due_date'], "%Y-%m-%d")
                    except ValueError:
                        pass
                        
                cut_date = None
                if statement_metadata.get('cut_off_date'):
                    try:
                        cut_date = datetime.strptime(statement_metadata['cut_off_date'], "%Y-%m-%d")
                    except ValueError:
                        pass

                # Verificar si ya existe el estado de cuenta
                existing_stmt = self.db.query(CreditCardStatement).filter(
                    CreditCardStatement.account_id == log.account_id,
                    CreditCardStatement.month == stmt_month,
                    CreditCardStatement.year == stmt_year,
                    CreditCardStatement.is_deleted == False
                ).first()

                if existing_stmt:
                    # Actualizar si existe
                    existing_stmt.statement_balance = stmt_balance
                    if due_date: existing_stmt.payment_due_date = due_date
                    if cut_date: existing_stmt.cut_off_date = cut_date
                else:
                    # Crear nuevo
                    new_stmt = CreditCardStatement(
                        account_id=log.account_id,
                        statement_balance=stmt_balance,
                        user_share=stmt_balance, # Por defecto todo el share es del usuario
                        payment_due_date=due_date,
                        cut_off_date=cut_date,
                        month=stmt_month,
                        year=stmt_year,
                        status=StatementStatus.PENDING
                    )
                    self.db.add(new_stmt)

            log.status = 'processed'
            self.db.commit()

            # Disparamos la sanación de snapshots si hubo cambios en el pasado
            if new_txs_count > 0:
                from app.services.snapshot_service import mark_snapshots_as_stale
                mark_snapshots_as_stale(self.db, earliest_date.month, earliest_date.year)

            return new_txs_count
        except Exception as e:
            self.db.rollback()
            log.status = 'error'
            log.error_message = str(e)
            self.db.commit()
            raise e
        finally:
            self.db.close()
