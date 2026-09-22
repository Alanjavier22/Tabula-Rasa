import json
import hashlib
import os
import logging
import asyncio
import anyio
from typing import List, Optional, Dict, Any, cast
from pydantic import BaseModel, Field
import google.genai as genai
from google.genai import types
from app.services.ai_models import MULTIMODAL_MODEL
from datetime import date, datetime, timezone

logger = logging.getLogger(__name__)
from database import SessionLocal
from sqlalchemy import func
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.import_log import ImportLog
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.category import Category
from app.models.debt_share import DebtShare
from app.models.account import Account
from app.models.iou import IOU, IOUType, IOUStatus
from app.services.categorizer import get_semantic_category
from app.services.transaction_identity import calculate_transaction_fingerprint
from app.utils.date_parser import parse_date_robustly

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
        return cast(Optional[str], config.value) if config else None

    def generate_fingerprint(self, date: str, description: str, amount_cents: int, account_id: str, deferred_info: str = "", index: int = 0) -> str:
        """Generates a unique hash, including deferred info and index to disambiguate identical transactions."""
        raw_str = f"{date}|{description.strip().upper()}|{amount_cents}|{account_id}|{deferred_info}|{index}"
        return hashlib.sha256(raw_str.encode()).hexdigest()

    async def _request_parsed_data(
        self,
        client,
        file_data: bytes,
        mime_type: str,
        system_instruction: str,
        prompt: str,
    ) -> Dict:
        max_retries = 5
        for attempt in range(max_retries):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=MULTIMODAL_MODEL,
                    contents=cast(Any, [
                        types.Part.from_bytes(data=file_data, mime_type=mime_type),
                        types.Part.from_text(text=prompt),
                    ]),
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=StatementParsingResponse,
                    ),
                )
                return json.loads((response.text or "{}").strip())
            except Exception as error:
                if attempt == max_retries - 1:
                    raise ValueError(
                        f"IA no disponible tras {max_retries} intentos. Google reporta: {str(error)}"
                    )
                wait_time = (attempt + 1) * 3
                logger.warning(
                    f"[IA] Gemini ocupado en importación de TC. Reintento {attempt + 1}/{max_retries} en {wait_time}s..."
                )
                await asyncio.sleep(wait_time)
        return {"transactions": []}

    def _enrich_transactions(
        self,
        transactions: list[dict],
        cat_results: dict,
        categories_dict: dict,
        account_id: str,
    ) -> tuple[list[dict], int, int]:
        enriched_transactions = []
        seen_in_batch = {}
        calculated_consumptions = 0
        calculated_payments = 0
        audit_keywords = ['seguro', 'comision', 'comisión', 'interes', 'interés', 'mantenimiento', 'mora']
        for idx, tx in enumerate(transactions):
            deferred_key = tx.get('deferred_info', '')
            amount = tx['amount_cents']
            if tx['transaction_type'] == 'expense':
                calculated_consumptions += amount
            else:
                calculated_payments += abs(amount)

            batch_key = f"{tx['date']}_{amount}_{tx['description'].strip().upper()}_{deferred_key}"
            occurrence_index = seen_in_batch.get(batch_key, 0)
            seen_in_batch[batch_key] = occurrence_index + 1
            fingerprint = self.generate_fingerprint(
                tx['date'], tx['description'], amount, account_id, deferred_key, occurrence_index
            )
            tx_dict = tx.copy()
            tx_dict['fingerprint'] = fingerprint
            category_result = cat_results.get(idx)
            if category_result:
                category_id, clarification = category_result
                tx_dict['category_id'] = category_id
                tx_dict['needs_clarification'] = clarification
                if category_id in categories_dict:
                    tx_dict['category_name'] = categories_dict[category_id]
            if any(keyword in tx['description'].lower() for keyword in audit_keywords):
                tx_dict['needs_clarification'] = True
            existing = self.db.query(Transaction).filter(
                Transaction.fingerprint == fingerprint,
                Transaction.is_deleted == False,
            ).first()
            tx_dict['is_duplicate'] = existing is not None
            enriched_transactions.append(tx_dict)
        return enriched_transactions, calculated_consumptions, calculated_payments

    async def parse_statement(self, file_path: str, account_id: str, expected_bank_name: Optional[str] = None) -> Dict:
        """Usa Gemini 1.5 Flash para extraer transacciones de un PDF o Imagen."""
        api_key = self._get_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY no configurada en el sistema.")

        client = genai.Client(api_key=cast(str, api_key))
        
        # Leemos el archivo para enviarlo a la IA
        async with await anyio.open_file(file_path, "rb") as f:
            file_data = await f.read()

        # Obtener categorías actuales para que la IA sepa qué opciones tiene
        categories = self.db.query(Category).all()
        cat_list = [str(c.name) for c in categories]

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
        7. AUDITORÍA DE COSTOS (CRÍTICO): Identifica específicamente cobros por:
           - Seguros (ej: 'Seguro de Desgravamen', 'Protección Fraude').
           - Comisiones (ej: 'Mantenimiento de cuenta', 'Emisión de estado de cuenta').
           - Intereses (ej: 'Interés por mora', 'Interés de financiamiento').
           Si encuentras alguno, asegúrate de extraerlo con su descripción literal exacta.
        8. INTEGRIDAD: No inventes transacciones ni balances. Extrae el mes y año contable precisos.
        """

        prompt = "Analiza este documento y extrae todas las transacciones del periodo. Asegúrate de incluir pagos y consumos."

        # Soporte para PDF o Imágenes
        mime_type = "application/pdf" if file_path.lower().endswith(".pdf") else "image/jpeg"

        parsed_data = await self._request_parsed_data(
            client, file_data, mime_type, system_instruction, prompt
        )
        
        # Motor de Deduplicación Progresiva (Universal) — Adaptado para Tarjetas de Crédito
        # ── TIER 4: Batch Categorization ──
        from app.services.categorizer import categorize_batch
        
        batch_input = [
            {
                'description': tx['description'],
                'amount': tx['amount_cents'],
                'transaction_type': tx['transaction_type']
            }
            for tx in parsed_data['transactions']
        ]
        
        cat_results = categorize_batch(batch_input, self.db)
        categories_dict = {c.id: c.name for c in self.db.query(Category).all()}
        enriched_transactions, calc_sum_consumos, calc_sum_pagos = self._enrich_transactions(
            parsed_data['transactions'], cat_results, categories_dict, account_id
        )

        parsed_data['transactions'] = enriched_transactions
        
        # Añadir info de auditoría al objeto final
        parsed_data['audit'] = {
            "consumos_match": abs(abs(calc_sum_consumos) - abs(parsed_data['total_new_consumos_cents'])) < 5, 
            "pagos_match": abs(abs(calc_sum_pagos) - abs(parsed_data['total_pagos_cents'])) < 5,
            "calculated_consumos": calc_sum_consumos,
            "calculated_pagos": calc_sum_pagos,
            "extraction_method": f"{MULTIMODAL_MODEL}-vision"
        }
        
        return parsed_data

    def _build_import_transaction(self, log: ImportLog, tx_data: Dict, transaction_date: datetime) -> Transaction:
        category_id = tx_data.get('category_id')
        if not category_id and tx_data.get('description'):
            category_id = get_semantic_category(
                tx_data['description'],
                tx_data['amount_cents'],
                self.db,
                tx_data['transaction_type'],
            )

        amount = abs(tx_data['amount_cents'])
        return Transaction(
            description=tx_data['description'],
            amount=amount,
            transaction_type=tx_data['transaction_type'],
            date=transaction_date,
            account_id=log.account_id,
            category_id=category_id,
            payment_method='credit_card',
            fingerprint=tx_data.get('fingerprint') or calculate_transaction_fingerprint(
                description=tx_data['description'],
                amount=amount,
                date_value=transaction_date,
                transaction_type=tx_data['transaction_type'],
                account_id=log.account_id,
            ),
            import_log_id=log.id,
            is_manual=False,
            needs_clarification=tx_data.get('needs_clarification', False),
            is_internal=tx_data['transaction_type'] == 'income',
            metadata_json=json.dumps({
                'is_deferred': tx_data.get('is_deferred'),
                'deferred_info': tx_data.get('deferred_info'),
            }),
        )

    def _add_shared_iou(self, new_tx: Transaction, tx_data: Dict, statement_metadata: Optional[Dict]) -> None:
        if not tx_data.get('shared_with') or not tx_data.get('shared_amount'):
            return

        statement_period = statement_metadata.get('statement_period', '') if statement_metadata else ''
        self.db.add(IOU(
            person_name=tx_data['shared_with'],
            amount=int(tx_data['shared_amount']),
            iou_type=IOUType.THEY_OWE,
            status=IOUStatus.PENDING,
            transaction_id=new_tx.id,
            description=f"Compartido de: {tx_data['description']} ({statement_period})",
        ))

    @staticmethod
    def _deferred_installments(deferred_info: str) -> tuple[int, int]:
        current_installment = 1
        total_installments = 1
        if '/' in deferred_info:
            parts = deferred_info.split('/')
            try:
                current_installment = int(parts[0])
                total_installments = int(parts[1])
            except ValueError:
                pass
        return current_installment, total_installments

    def _sync_deferred_payment(self, log: ImportLog, tx_data: Dict, transaction_date: datetime) -> None:
        from app.models.deferred_payment import DeferredPayment

        current_installment, total_installments = self._deferred_installments(
            tx_data.get('deferred_info', '')
        )
        amount = abs(tx_data['amount_cents'])
        existing_deferred = self.db.query(DeferredPayment).filter(
            DeferredPayment.account_id == log.account_id,
            DeferredPayment.installment_amount == amount,
            DeferredPayment.current_installment == current_installment,
            DeferredPayment.total_installments == total_installments,
            DeferredPayment.is_active == True
        ).filter(DeferredPayment.name.ilike(f"%{tx_data['description'][:10]}%")).first()

        shared_with = tx_data.get('shared_with')
        shared_amount = int(tx_data['shared_amount']) if tx_data.get('shared_amount') else None
        if existing_deferred:
            existing_deferred.is_shared = cast(Any, bool(shared_with))
            existing_deferred.shared_with = cast(Any, shared_with)
            existing_deferred.shared_amount = cast(Any, shared_amount)
            return

        self.db.add(DeferredPayment(
            account_id=log.account_id,
            name=tx_data['description'],
            total_amount=amount * total_installments,
            installment_amount=amount,
            total_installments=total_installments,
            current_installment=current_installment,
            remaining_balance=amount * (total_installments - current_installment + 1),
            is_shared=cast(Any, bool(shared_with)),
            shared_with=cast(Any, shared_with),
            shared_amount=cast(Any, shared_amount),
            start_date=transaction_date,
            is_active=cast(Any, True),
        ))

    def _persist_confirmed_transaction(
        self,
        log: ImportLog,
        tx_data: Dict,
        statement_metadata: Optional[Dict],
    ) -> datetime | None:
        if tx_data.get('is_duplicate', False):
            return None

        transaction_date = parse_date_robustly(tx_data['date']) or datetime.now()
        new_tx = self._build_import_transaction(log, tx_data, transaction_date)
        self.db.add(new_tx)
        self.db.flush()
        self._add_shared_iou(new_tx, tx_data, statement_metadata)
        if tx_data.get('is_deferred'):
            self._sync_deferred_payment(log, tx_data, transaction_date)
        return transaction_date

    def _persist_confirmed_transactions(
        self,
        log: ImportLog,
        confirmed_transactions: List[Dict],
        statement_metadata: Optional[Dict],
    ) -> tuple[int, date]:
        new_txs_count = 0
        earliest_date = datetime.now().date()
        for tx_data in reversed(confirmed_transactions):
            transaction_date = self._persist_confirmed_transaction(log, tx_data, statement_metadata)
            if transaction_date is not None:
                new_txs_count += 1
                earliest_date = min(earliest_date, transaction_date.date())
        return new_txs_count, earliest_date

    def _sync_debt_shares(
        self,
        existing_statement: Optional[CreditCardStatement],
        statement: CreditCardStatement,
        debt_shares: List[Dict],
    ) -> None:
        if not debt_shares:
            return
        if existing_statement:
            self.db.query(DebtShare).filter(
                DebtShare.statement_id == existing_statement.id
            ).delete()

        statement_id = existing_statement.id if existing_statement else statement.id
        for share in debt_shares:
            self.db.add(DebtShare(
                statement_id=statement_id,
                person_name=share['person_name'],
                amount=int(share['amount_cents']),
                description=share.get('description', 'Parte proporcional del estado de cuenta'),
            ))

    def _upsert_credit_card_statement(self, log: ImportLog, statement_metadata: Optional[Dict]) -> None:
        if not statement_metadata or not statement_metadata.get('statement_month') or not statement_metadata.get('statement_year'):
            return

        stmt_month = int(statement_metadata['statement_month'])
        stmt_year = int(statement_metadata['statement_year'])
        stmt_balance = int(statement_metadata.get('statement_balance_cents', 0))
        due_date = parse_date_robustly(statement_metadata['payment_due_date']) if statement_metadata.get('payment_due_date') else None
        cut_date = parse_date_robustly(statement_metadata['cut_off_date']) if statement_metadata.get('cut_off_date') else None

        existing_statement = self.db.query(CreditCardStatement).filter(
            CreditCardStatement.account_id == log.account_id,
            CreditCardStatement.month == stmt_month,
            CreditCardStatement.year == stmt_year,
            CreditCardStatement.is_deleted == False
        ).first()
        if existing_statement:
            statement = existing_statement
            statement.statement_balance = cast(Any, stmt_balance)
            statement.user_share = cast(Any, int(statement_metadata.get('user_share_cents', stmt_balance)))
            if due_date:
                statement.payment_due_date = cast(Any, due_date)
            if cut_date:
                statement.cut_off_date = cast(Any, cut_date)
        else:
            statement = CreditCardStatement(
                account_id=log.account_id,
                statement_balance=cast(Any, stmt_balance),
                user_share=cast(Any, int(statement_metadata.get('user_share_cents', stmt_balance))),
                payment_due_date=cast(Any, due_date),
                cut_off_date=cast(Any, cut_date),
                month=stmt_month,
                year=stmt_year,
                status=cast(Any, StatementStatus.PENDING)
            )
            self.db.add(statement)

        if statement_metadata.get('credit_limit_cents'):
            account = self.db.query(Account).filter(Account.id == log.account_id).first()
            if account:
                account.credit_limit = cast(Any, int(statement_metadata['credit_limit_cents']))
            self.db.flush()

        self._sync_debt_shares(
            existing_statement,
            statement,
            statement_metadata.get('debt_shares', []),
        )

    def _reconcile_statement_balance(self, log: ImportLog, statement_metadata: Optional[Dict]) -> None:
        if not statement_metadata or not statement_metadata.get('statement_balance_cents'):
            return

        from app.services.balance import recalculate_account_balance

        account = self.db.query(Account).filter(Account.id == log.account_id).first()
        if account:
            account.balance = cast(Any, -int(statement_metadata['statement_balance_cents']))
            self.db.commit()

    def finalize_import(self, import_log_id: str, confirmed_transactions: List[Dict], statement_metadata: Optional[Dict] = None):
        """Guarda las transacciones confirmadas, actualiza el CreditCardStatement y marca snapshots como obsoletos."""
        log = self.db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
        if not log:
            return

        try:
            new_txs_count, earliest_date = self._persist_confirmed_transactions(
                log,
                confirmed_transactions,
                statement_metadata,
            )
            self._upsert_credit_card_statement(log, statement_metadata)
            log.status = cast(Any, 'processed')
            self.db.commit()
            self._reconcile_statement_balance(log, statement_metadata)

            if new_txs_count > 0:
                from app.services.snapshot_service import mark_snapshots_as_stale
                mark_snapshots_as_stale(self.db, earliest_date.month, earliest_date.year)

            return new_txs_count
        except Exception as e:
            logger.exception("❌ ERROR EN CONFIRM-IMPORT")  # pragma: no cover
            self.db.rollback()
            log.status = cast(Any, 'error')
            log.error_message = cast(Any, str(e))
            self.db.commit()
            raise e
        finally:
            self.db.close()
