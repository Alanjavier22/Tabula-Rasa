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
from app.models.debt_share import DebtShare
from app.models.iou import IOU, IOUType, IOUStatus
from app.services.categorizer import get_semantic_category

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
    credit_limit_cents: Optional[int] = Field(description="Cupo total o límite de crédito de la tarjeta en centavos")
    transactions: List[ExtractedTransaction]

class StatementIntelligenceService:
    def __init__(self, db_session=None):
        self.db = db_session or SessionLocal()

    def _get_api_key(self) -> Optional[str]:
        config = self.db.query(Config).filter(Config.key == "gemini_api_key").first()
        return config.value if config else None

    def generate_fingerprint(self, date: str, description: str, amount_cents: int, account_id: str, deferred_info: str = "", index: int = 0) -> str:
        """Generates a unique hash, including deferred info and index to disambiguate identical transactions."""
        raw_str = f"{date}|{description.strip().upper()}|{amount_cents}|{account_id}|{deferred_info}|{index}"
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

        # Llamada a Gemini con Reintentos (Exponential Backoff más agresivo)
        import time
        max_retries = 5
        last_error = None
        
        for attempt in range(max_retries):
            try:
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
                # Si llegamos aquí, la llamada fue exitosa
                parsed_data = json.loads(response.text)
                break
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 3 # 3s, 6s, 9s, 12s...
                    time.sleep(wait_time)
                else:
                    raise ValueError(f"IA no disponible tras {max_retries} intentos. Google reporta: {str(e)}")
        
        # Motor de Deduplicación Progresiva (Universal) — Adaptado para Tarjetas de Crédito
        # ── TIER 4: Batch Categorization ──
        from app.services.categorizer import categorize_batch
        
        # Preparar lista para el categorizador
        batch_input = [
            {
                'description': tx['description'],
                'amount': tx['amount_cents'],
                'transaction_type': tx['transaction_type']
            }
            for tx in parsed_data['transactions']
        ]
        
        # Obtener categorías en bloque
        cat_results = categorize_batch(batch_input, self.db)
        
        # Enriquecer transacciones con los resultados del lote
        categories_dict = {c.id: c.name for c in self.db.query(Category).all()}
        
        enriched_transactions = []
        seen_in_batch = {}
        
        # Auditoría interna de sumas
        calc_sum_consumos = 0
        calc_sum_pagos = 0

        for idx, tx in enumerate(parsed_data['transactions']):
            deferred_key = tx.get('deferred_info', '')
            amt = tx['amount_cents']
            
            # Auditoría
            if tx['transaction_type'] == 'expense':
                calc_sum_consumos += amt
            else:
                calc_sum_pagos += abs(amt)

            # Detectamos cuántas veces hemos visto esta misma combinación en este lote para desambiguar
            batch_key = f"{tx['date']}_{amt}_{tx['description'].strip().upper()}_{deferred_key}"
            occurrence_index = seen_in_batch.get(batch_key, 0)
            seen_in_batch[batch_key] = occurrence_index + 1
            
            # Cada ocurrencia tiene un fingerprint único gracias al index
            fp = self.generate_fingerprint(tx['date'], tx['description'], amt, account_id, deferred_key, occurrence_index)
            
            tx_dict = tx.copy()
            tx_dict['fingerprint'] = fp
            
            # Usar resultado del batch para categorización
            cat_id = cat_results.get(idx)
            tx_dict['category_id'] = cat_id
            if cat_id in categories_dict:
                tx_dict['category_name'] = categories_dict[cat_id]
            
            # Verificar duplicados reales en DB (solo si el fingerprint exacto ya existe)
            existing = self.db.query(Transaction).filter(Transaction.fingerprint == fp, Transaction.is_deleted == False).first()
            
            # Ya no marcamos como duplicado solo por estar en el mismo batch (occurrence_index > 0)
            # Esto permite transacciones legítimas idénticas.
            tx_dict['is_duplicate'] = (existing is not None)
            enriched_transactions.append(tx_dict)

        parsed_data['transactions'] = enriched_transactions
        
        # Añadir info de auditoría al objeto final
        parsed_data['audit'] = {
            "consumos_match": abs(abs(calc_sum_consumos) - abs(parsed_data['total_new_consumos_cents'])) < 5, 
            "pagos_match": abs(abs(calc_sum_pagos) - abs(parsed_data['total_pagos_cents'])) < 5,
            "calculated_consumos": calc_sum_consumos,
            "calculated_pagos": calc_sum_pagos,
            "extraction_method": "gemini-3.1-flash-lite-vision"
        }
        
        return parsed_data

    def finalize_import(self, import_log_id: str, confirmed_transactions: List[Dict], statement_metadata: Optional[Dict] = None):
        """Guarda las transacciones confirmadas, actualiza el CreditCardStatement y marca snapshots como obsoletos."""
        log = self.db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
        if not log:
            return

        try:
            new_txs_count = 0
            earliest_date = datetime.now().date()

            # We reverse to insert from OLDEST to NEWEST
            for tx_data in reversed(confirmed_transactions):
                # Solo insertamos si no es duplicado o si el usuario fuerza la inserción
                if not tx_data.get('is_duplicate', False):
                    dt = datetime.fromisoformat(tx_data['date'])
                    if dt.date() < earliest_date:
                        earliest_date = dt.date()

                    # Buscar ID de la categoría sugerida
                    # Use the category_id from the confirmed data if available, 
                    # otherwise fallback to re-calculating (safety)
                    category_id = tx_data.get('category_id')
                    if not category_id and tx_data.get('description'):
                        category_id = get_semantic_category(
                            tx_data['description'], 
                            tx_data['amount_cents'], 
                            self.db, 
                            tx_data['transaction_type']
                        )

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
                    self.db.flush() # Para obtener el ID si necesitamos vincular IOU
                    
                    # Manejo de Consumo Compartido (IOU) por transacción
                    if tx_data.get('shared_with') and tx_data.get('shared_amount'):
                        new_iou = IOU(
                            person_name=tx_data['shared_with'],
                            amount=int(tx_data['shared_amount']),
                            iou_type=IOUType.THEY_OWE,
                            status=IOUStatus.PENDING,
                            transaction_id=new_tx.id,
                            description=f"Compartido de: {tx_data['description']} ({statement_metadata.get('statement_period', '') if statement_metadata else ''})"
                        )
                        self.db.add(new_iou)

                    # --- NUEVO: Creación de DeferredPayment si la IA detectó que es diferido ---
                    if tx_data.get('is_deferred'):
                        from app.models.deferred_payment import DeferredPayment
                        
                        # Extraer info de cuotas (ej: "3/12" -> current=3, total=12)
                        current_inst = 1
                        total_inst = 1
                        def_info = tx_data.get('deferred_info', '')
                        if '/' in def_info:
                            parts = def_info.split('/')
                            try:
                                current_inst = int(parts[0])
                                total_inst = int(parts[1])
                            except ValueError: pass
                        
                        # Crear el registro de diferido para seguimiento futuro
                        new_deferred = DeferredPayment(
                            account_id=log.account_id,
                            name=tx_data['description'],
                            total_amount=abs(tx_data['amount_cents']) * total_inst, # Estimación
                            installment_amount=abs(tx_data['amount_cents']),
                            total_installments=total_inst,
                            current_installment=current_inst,
                            remaining_balance=abs(tx_data['amount_cents']) * (total_inst - current_inst + 1),
                            is_shared=True if tx_data.get('shared_with') else False,
                            shared_with=tx_data.get('shared_with'),
                            shared_amount=int(tx_data['shared_amount']) if tx_data.get('shared_amount') else None,
                            start_date=dt,
                            is_active=True
                        )
                        self.db.add(new_deferred)

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
                    existing_stmt.user_share = int(statement_metadata.get('user_share_cents', stmt_balance))
                    if due_date: existing_stmt.payment_due_date = due_date
                    if cut_date: existing_stmt.cut_off_date = cut_date
                else:
                    # Crear nuevo
                    new_stmt = CreditCardStatement(
                        account_id=log.account_id,
                        statement_balance=stmt_balance,
                        user_share=int(statement_metadata.get('user_share_cents', stmt_balance)),
                        payment_due_date=due_date,
                        cut_off_date=cut_date,
                        month=stmt_month,
                        year=stmt_year,
                        status=StatementStatus.PENDING
                    )
                    self.db.add(new_stmt)
                    self.db.flush()

                # Procesar DebtShares (Gente que debe parte del total del mes)
                if statement_metadata.get('debt_shares'):
                    # Limpiamos previos para este statement si estamos re-importando/actualizando
                    if existing_stmt:
                        self.db.query(DebtShare).filter(DebtShare.statement_id == existing_stmt.id).delete()
                    
                    stmt_id = existing_stmt.id if existing_stmt else new_stmt.id
                    for share in statement_metadata['debt_shares']:
                        new_share = DebtShare(
                            statement_id=stmt_id,
                            person_name=share['person_name'],
                            amount=int(share['amount_cents']),
                            description=share.get('description', 'Parte proporcional del estado de cuenta')
                        )
                        self.db.add(new_share)

            log.status = 'processed'
            
            # Actualizar límite de crédito si se detectó uno nuevo
            if statement_metadata and statement_metadata.get('credit_limit_cents'):
                from app.models.account import Account
                acc = self.db.query(Account).filter(Account.id == log.account_id).first()
                if acc:
                    acc.credit_limit = int(statement_metadata['credit_limit_cents'])

            self.db.commit()

            # Disparamos la sanación de snapshots si hubo cambios en el pasado
            if new_txs_count > 0:
                from app.services.snapshot_service import mark_snapshots_as_stale
                mark_snapshots_as_stale(self.db, earliest_date.month, earliest_date.year)
                # Recalcular saldo de la cuenta
                from app.services.balance import recalculate_account_balance
                recalculate_account_balance(self.db, log.account_id)

            return new_txs_count
        except Exception as e:
            self.db.rollback()
            log.status = 'error'
            log.error_message = str(e)
            self.db.commit()
            raise e
        finally:
            self.db.close()
