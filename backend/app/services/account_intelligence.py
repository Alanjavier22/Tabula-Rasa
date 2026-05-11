import json
import hashlib
import os
import io
import pandas as pd
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
import google.genai as genai
from google.genai import types
from datetime import datetime
from database import SessionLocal
from sqlalchemy import func
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.import_log import ImportLog
from app.models.category import Category

class ExtractedAccountTransaction(BaseModel):
    date: str = Field(description="Fecha de la transacción en formato YYYY-MM-DD")
    description: str = Field(description="Descripción o detalle del movimiento")
    amount_cents: int = Field(description="Monto en centavos (valor absoluto). Ej: 10.50 -> 1050")
    transaction_type: str = Field(description="'expense' para retiros/pagos/egresos, 'income' para depósitos/ingresos")
    category_name: Optional[str] = Field(description="Nombre de la categoría sugerida de la lista proporcionada")
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
        return config.value if config else None

    def generate_fingerprint(self, date: str, description: str, amount_cents: int, account_id: str) -> str:
        """Genera un hash único para evitar duplicados."""
        raw_str = f"{date}|{description.strip().upper()}|{amount_cents}|{account_id}"
        return hashlib.sha256(raw_str.encode()).hexdigest()

    def convert_to_csv_string(self, file_data: bytes, filename: str) -> str:
        """Convierte cualquier Excel o CSV a una cadena de texto plana para la IA."""
        try:
            if filename.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data), header=None, encoding='utf-8', on_bad_lines='skip')
            else:
                df = pd.read_excel(io.BytesIO(file_data), header=None, engine='openpyxl')
            
            # Limitamos a 2000 filas para evitar problemas extremos, aunque Gemini soporta más
            df = df.head(2000)
            # Convertimos a CSV string para que la IA lo lea fácilmente
            return df.to_csv(index=False, header=False)
        except Exception as e:
            raise ValueError(f"No se pudo procesar el archivo {filename}: {str(e)}")

    async def parse_account_document(self, file_data: bytes, filename: str, account_id: str, expected_bank_name: str = None) -> Dict:
        api_key = self._get_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY no configurada en el sistema.")

        client = genai.Client(api_key=api_key)
        
        # 1. Convertir archivo a texto crudo
        raw_csv_text = self.convert_to_csv_string(file_data, filename)

        # 2. Obtener categorías
        categories = self.db.query(Category).all()
        cat_list = [c.name for c in categories]

        system_instruction = f"""Eres un auditor financiero experto en Ecuador. Tu tarea es extraer transacciones de cuentas de ahorro/corriente a partir de datos en crudo (CSV/Excel convertido a texto).
        
        El texto provisto puede contener cabeceras basura, resúmenes, y luego una tabla de movimientos.
        Debes IGNORAR la basura y enfocarte solo en la tabla real de movimientos.
        
        IMPORTANTE: Se espera que el documento sea del banco: {expected_bank_name or "Desconocido"}. 
        Si ves nombres de otros bancos en las descripciones de las transacciones (ej: "RET. PACIFICO", "BANRED", "PICHINCHA"), NO asumas que el documento es de esos bancos. Estos son solo intermediarios o beneficiarios. El emisor real es {expected_bank_name or "el banco principal"}.

        CATEGORÍAS DISPONIBLES: {", ".join(cat_list)}

        REGLAS CRÍTICAS:
        1. MONTO: Extrae el monto exacto en centavos (ej: $15.20 -> 1520). Siempre en valor ABSOLUTO positivo.
        2. TIPO: Si es ingreso/depósito usa 'income'. Si es egreso/retiro usa 'expense'.
        3. FECHAS: Convierte cualquier fecha al formato estandarizado YYYY-MM-DD.
        4. DESCRIPCIÓN: Une columnas de detalle si es necesario para dar contexto, pero mantenlo limpio.
        5. FILTRADO: NO incluyas filas de saldos iniciales, finales, o cabeceras de tabla como si fueran transacciones.
        6. CATEGORIZACIÓN: Elige la mejor categoría. Si es transferencia de o hacia otra cuenta tuya, usa algo acorde.
        7. SALDO: Extrae el saldo efectivo/contable (balance) resultante después de cada movimiento en centavos. Este es CRITICO para diferenciar consumos idénticos.
        """

        prompt = "Analiza el siguiente extracto bancario en crudo y extrae todas las transacciones financieras reales.\n\n" + raw_csv_text

        response = client.models.generate_content(
            model='gemini-3.1-flash-lite', 
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=AccountParsingResponse,
                temperature=0.1
            )
        )

        parsed_data = json.loads(response.text)
        
        # 3. Motor de Deduplicación Progresiva (Universal)
        # Estrategia: Usar toda la información disponible de forma escalonada.
        # No asumimos calidad perfecta en los datos históricos ni en el documento nuevo.
        enriched_transactions = []
        seen_in_batch = {}  # batch_key -> count of occurrences seen so far

        for tx in parsed_data['transactions']:
            fp = self.generate_fingerprint(tx['date'], tx['description'], tx['amount_cents'], account_id)
            dt = datetime.fromisoformat(tx['date'])
            incoming_balance = tx.get('balance_cents')
            
            # ── TIER 1: Fingerprint exacto ──
            # El fingerprint es SHA-256(fecha|descripción|monto|cuenta). Si coincide, es duplicado seguro.
            existing = self.db.query(Transaction).filter(Transaction.fingerprint == fp).first()

            # ── TIER 2: Búsqueda por fecha + monto + cuenta (amplia) ──
            # Si no hubo coincidencia por fingerprint, buscamos por los campos base.
            # Luego desambiguamos con descripción y/o running_balance.
            if not existing:
                candidates = self.db.query(Transaction).filter(
                    func.date(Transaction.date) == dt.date(),
                    Transaction.amount == abs(tx['amount_cents']),
                    Transaction.account_id == account_id
                ).all()

                if candidates:
                    tx_desc_clean = tx['description'].upper().strip()
                    
                    if len(candidates) == 1:
                        # Solo hay un candidato: verificamos con balance si ambos lo tienen.
                        candidate = candidates[0]
                        if incoming_balance is not None and candidate.running_balance is not None:
                            # Ambos tienen balance: solo es duplicado si coinciden.
                            if candidate.running_balance == incoming_balance:
                                existing = candidate
                            # Si no coinciden, NO es duplicado (son consumos distintos con mismo monto).
                        else:
                            # Al menos uno no tiene balance: confiamos en la coincidencia base.
                            existing = candidate
                    else:
                        # Múltiples candidatos: intentamos emparejar por descripción + balance.
                        for candidate in candidates:
                            db_desc_clean = candidate.description.upper().strip()
                            desc_match = (tx_desc_clean in db_desc_clean or db_desc_clean in tx_desc_clean)
                            
                            if desc_match:
                                if incoming_balance is not None and candidate.running_balance is not None:
                                    if candidate.running_balance == incoming_balance:
                                        existing = candidate
                                        break
                                else:
                                    existing = candidate
                                    break
                        
                        # Si no hubo match por descripción, intentamos solo por balance.
                        if not existing and incoming_balance is not None:
                            for candidate in candidates:
                                if candidate.running_balance == incoming_balance:
                                    existing = candidate
                                    break

            # ── TIER 3: Deduplicación intra-batch ──
            # Detecta duplicados dentro del mismo archivo.
            # El balance_cents es el diferenciador clave: dos compras idénticas
            # tendrán saldos resultantes distintos (el dinero disminuye con cada una).
            batch_key = f"{tx['date']}_{tx['amount_cents']}_{tx['description'].strip().upper()}"
            batch_key_with_balance = f"{batch_key}_{incoming_balance}"
            
            is_batch_duplicate = False
            if batch_key_with_balance in seen_in_batch:
                # Mismo monto, fecha, descripción Y mismo saldo = duplicado real del archivo.
                is_batch_duplicate = True
            elif incoming_balance is None and batch_key in [k.rsplit('_', 1)[0] for k in seen_in_batch]:
                # Sin balance disponible y ya vimos uno igual = marcamos como posible duplicado.
                is_batch_duplicate = True
            
            seen_in_batch[batch_key_with_balance] = seen_in_batch.get(batch_key_with_balance, 0) + 1

            tx_dict = tx.copy()
            tx_dict['fingerprint'] = fp
            tx_dict['is_duplicate'] = (existing is not None) or is_batch_duplicate
            enriched_transactions.append(tx_dict)

        parsed_data['transactions'] = enriched_transactions
        return parsed_data

    def finalize_import(self, import_log_id: str, confirmed_transactions: List[Dict]):
        """Guarda las transacciones de cuenta confirmadas en la DB."""
        log = self.db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
        if not log:
            return 0

        try:
            new_txs_count = 0
            earliest_date = datetime.now().date()

            for tx_data in confirmed_transactions:
                if not tx_data.get('is_duplicate', False):
                    dt = datetime.fromisoformat(tx_data['date'])
                    if dt.date() < earliest_date:
                        earliest_date = dt.date()

                    category_id = None
                    if tx_data.get('category_name'):
                        cat = self.db.query(Category).filter(Category.name == tx_data['category_name']).first()
                        if cat:
                            category_id = cat.id

                    new_tx = Transaction(
                        description=tx_data['description'],
                        amount=abs(tx_data['amount_cents']),
                        transaction_type=tx_data['transaction_type'],
                        date=dt,
                        account_id=log.account_id,
                        category_id=category_id,
                        payment_method='transfer', # Por defecto en cuentas de ahorro
                        fingerprint=tx_data['fingerprint'],
                        import_log_id=log.id,
                        running_balance=tx_data.get('balance_cents'),
                        is_manual=False
                    )
                    self.db.add(new_tx)
                    new_txs_count += 1

            log.status = 'processed'
            self.db.commit()

            if new_txs_count > 0:
                from app.services.snapshot_service import mark_snapshots_as_stale
                mark_snapshots_as_stale(self.db, earliest_date.month, earliest_date.year)
                # Recalcular saldos
                from app.services.balance import recalculate_balances
                recalculate_balances(self.db)

            return new_txs_count
        except Exception as e:
            self.db.rollback()
            log.status = 'error'
            log.error_message = str(e)
            self.db.commit()
            raise e
        finally:
            self.db.close()
