import json
import hashlib
import os
import io
import re
import pandas as pd
import logging
import asyncio
from typing import List, Optional, Dict, Any, cast
from pydantic import BaseModel, Field
import google.genai as genai
from google.genai import types
from app.services.ai_models import LITE_MODEL
from datetime import datetime
from database import SessionLocal
from sqlalchemy import func
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.import_log import ImportLog
from app.models.category import Category
from app.services.categorizer import get_semantic_category
from app.utils.date_parser import parse_date_robustly

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

    def convert_to_csv_string(self, file_data: bytes, filename: str) -> str:
        """Convierte cualquier Excel o CSV a una cadena de texto plana para la IA."""
        try:
            if filename.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data), header=None, encoding='utf-8', on_bad_lines='skip')
            else:
                df = pd.read_excel(io.BytesIO(file_data), header=None, engine='openpyxl')
            
            # Limitamos a 500 filas (suficiente para un mes y más liviano para evitar 503)
            df = df.head(500)
            
            # Limpieza básica para ahorrar tokens
            df = df.dropna(how='all', axis=0) # Eliminar filas completamente vacías
            df = df.dropna(how='all', axis=1) # Eliminar columnas completamente vacías
            
            # Convertimos a CSV string para que la IA lo lea fácilmente
            return df.to_csv(index=False, header=False)
        except Exception as e:
            raise ValueError(f"No se pudo procesar el archivo {filename}: {str(e)}")

    def local_extract_transactions(self, file_data: bytes, filename: str) -> Dict[str, Any]:
        """Intenta extraer transacciones localmente usando heurísticas de Pandas para evitar llamada a la IA."""
        try:
            if filename.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_data), header=None, encoding='utf-8', on_bad_lines='skip')
            else:
                df = pd.read_excel(io.BytesIO(file_data), header=None, engine='openpyxl')
                
            df = df.head(1000)
            df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
            
            # Debug: Ver las primeras filas para entender la estructura
            logger.info(f"[LocalParser] Analizando estructura de {filename}. Filas detectadas: {len(df)}")
            for idx, row in df.head(10).iterrows():
                logger.debug(f"[LocalParser] Row {idx}: {' | '.join([str(v) for v in row])}")

            header_row_idx = -1
            date_col_idx = desc_col_idx = amount_col_idx = balance_col_idx = cargo_col_idx = abono_col_idx = beneficiary_col_idx = type_col_idx = -1
            
            for i, row in df.iterrows():
                row_str = " ".join([str(val).lower() for val in row if pd.notna(val)])
                # Heurística: La cabecera contiene fecha y (detalle o descripción o concepto)
                if 'fecha' in row_str and ('detalle' in row_str or 'descrip' in row_str or 'concepto' in row_str):
                    header_row_idx = i
                    logger.info(f"[LocalParser] Cabecera encontrada en fila {i}")
                    for j, val in enumerate(row):
                        if pd.isna(val): continue
                        col_name = str(val).lower()
                        if 'fecha' in col_name and date_col_idx == -1: date_col_idx = j
                        elif ('detalle' in col_name or 'descrip' in col_name or 'concepto' in col_name) and desc_col_idx == -1: desc_col_idx = j
                        elif ('monto' in col_name or 'valor' in col_name) and amount_col_idx == -1: amount_col_idx = j
                        elif ('saldo' in col_name or 'balance' in col_name) and balance_col_idx == -1: balance_col_idx = j
                        elif ('cargo' in col_name or 'débito' in col_name or 'retiro' in col_name or 'egreso' in col_name) and cargo_col_idx == -1: cargo_col_idx = j
                        elif ('abono' in col_name or 'crédito' in col_name or 'depósito' in col_name or 'ingreso' in col_name) and abono_col_idx == -1: abono_col_idx = j
                        elif ('beneficiario' in col_name or 'destinatario' in col_name or 'nombre' in col_name) and beneficiary_col_idx == -1: beneficiary_col_idx = j
                        elif ('tipo' in col_name or 'transacción' in col_name or 'clase' in col_name) and type_col_idx == -1: type_col_idx = j
                    break
                    
            if header_row_idx == -1 or date_col_idx == -1 or desc_col_idx == -1:
                logger.warning("[LocalParser] No se encontró cabecera válida.")
                return {} 
                
            if amount_col_idx == -1 and (cargo_col_idx == -1 and abono_col_idx == -1):
                logger.warning("[LocalParser] No se encontró columna de monto/cargos/abonos.")
                return {}

            transactions = []
            skipped_count = 0
            processing_data = False
            
            for i, row in df.iterrows():
                # Si aún no encontramos el header, seguimos buscando
                if not processing_data:
                    if i == header_row_idx:
                        processing_data = True
                    continue
                
                # A partir de aquí, procesamos datos
                try:
                    val_fecha = row.iloc[date_col_idx]
                    val_desc = row.iloc[desc_col_idx]
                except Exception:
                    skipped_count += 1
                    continue

                if pd.isna(val_fecha) or str(val_fecha).strip() == "":
                    skipped_count += 1
                    continue
                    
                date_val = str(val_fecha).strip()
                desc_val = str(val_desc).strip() if pd.notna(val_desc) else "Sin descripción"
                
                try:
                    from dateutil import parser as dt_parser
                    parsed_date = dt_parser.parse(date_val, dayfirst=True)
                    date_iso = parsed_date.strftime("%Y-%m-%d")
                except Exception:
                    skipped_count += 1
                    continue
                    
                transaction_type = 'expense'
                
                # Move parse_money outside or define it more robustly
                def safe_parse_money(val: Any) -> int:
                    if pd.isna(val): return 0
                    s = str(val).strip()
                    if not s: return 0
                    
                    if ',' in s and '.' in s:
                        s = s.replace('.', '').replace(',', '.')
                    elif ',' in s:
                        s = s.replace(',', '.')
                    
                    clean = re.sub(r'[^\d.-]', '', s)
                    try:
                        return int(round(float(clean) * 100))
                    except (ValueError, TypeError):
                        return 0

                # Detectar tipo priorizando la columna de TIPO si existe
                forced_type = None
                if type_col_idx != -1 and pd.notna(row.iloc[type_col_idx]):
                    tv = str(row.iloc[type_col_idx]).lower()
                    if 'ingreso' in tv or 'abono' in tv: 
                        forced_type = 'income'
                    elif 'deposito' in tv or 'depósito' in tv:
                        forced_type = 'income'
                    elif 'egreso' in tv or 'retiro' in tv or 'cargo' in tv or 'débito' in tv or 'debito' in tv: 
                        forced_type = 'expense'

                if amount_col_idx != -1:
                    raw_cents = safe_parse_money(row.iloc[amount_col_idx])
                    if raw_cents == 0: 
                        skipped_count += 1
                        continue
                    
                    if forced_type:
                        # ...
                        tv_clean = str(row.iloc[type_col_idx]).lower()
                        desc_clean = desc_val.lower()
                        
                        if 'deposito' in tv_clean or 'depósito' in tv_clean:
                            transaction_type = 'deposit'
                        elif 'egreso' in tv_clean or 'retiro' in tv_clean or 'cargo' in tv_clean or 'débito' in tv_clean or 'debito' in tv_clean:
                            transaction_type = 'expense'
                        else:
                            transaction_type = 'income'
                        
                        amount_cents = abs(raw_cents)
                    else:
                        if raw_cents > 0:
                            transaction_type = 'income'
                            amount_cents = raw_cents
                        else:
                            transaction_type = 'expense'
                            amount_cents = abs(raw_cents)
                else:
                    cargo_cents = safe_parse_money(row.iloc[cargo_col_idx]) if cargo_col_idx != -1 else 0
                    abono_cents = safe_parse_money(row.iloc[abono_col_idx]) if abono_col_idx != -1 else 0
                    
                    if cargo_cents != 0:
                        amount_cents = abs(cargo_cents)
                        transaction_type = 'expense'
                    elif abono_cents != 0:
                        amount_cents = abs(abono_cents)
                        transaction_type = 'income'
                    else:
                        skipped_count += 1
                        continue

                balance_cents = None
                if balance_col_idx != -1:
                    balance_cents = safe_parse_money(row.iloc[balance_col_idx])
                
                # Extraer beneficiario si existe la columna
                beneficiary = ""
                if beneficiary_col_idx != -1 and pd.notna(row.iloc[beneficiary_col_idx]):
                    beneficiary = str(row.iloc[beneficiary_col_idx]).strip()

                transactions.append({
                    "date": date_iso,
                    "description": desc_val,
                    "amount_cents": amount_cents,
                    "transaction_type": transaction_type,
                    "balance_cents": balance_cents,
                    "beneficiary": beneficiary,
                    "_raw_type": str(row.iloc[type_col_idx]) if type_col_idx != -1 else ""
                })
                
            if skipped_count > 0:
                logger.info(f"[LocalParser] Info: Se saltaron {skipped_count} filas que no parecen ser transacciones.")
            
            # --- EXTRACCIÓN DE RESUMEN OFICIAL (SI EXISTE) ---
            official_income = official_expense = None
            # Refined money parser for summary extraction
            def summary_money_parser(v: Any) -> int:
                if pd.isna(v): return 0
                s = str(v).strip()
                if not s: return 0
                if ',' in s and '.' in s: s = s.replace('.', '').replace(',', '.')
                elif ',' in s: s = s.replace(',', '.')
                clean = re.sub(r'[^\d.-]', '', s)
                try: return round(float(clean) * 100)
                except (ValueError, TypeError): return 0

            for idx, row in df.head(15).iterrows():
                row_str = " ".join([str(v).lower() for v in row if pd.notna(v)])
                # Buscamos filas de resumen que contengan el valor al lado
                if 'ingresos' in row_str and 'resumen' not in row_str:
                    for v in row:
                        val = summary_money_parser(v)
                        if val > 100: official_income = val # Evitamos ruidos pequeños
                if 'egresos' in row_str:
                    for v in row:
                        val = summary_money_parser(v)
                        if val > 100: official_expense = val

            # Calcular resumen con precisión bancaria (Sin trampas)
            # El banco diferencia entre "Ingreso" (transacciones externas) y "DEPOSITO" (efectivo/otros)
            # Para que el resumen coincida, sumamos según el tipo explícito detectado.
            income_total = 0
            expense_total = 0
            
            for t in transactions:
                # Buscamos el tipo crudo que vino del banco (si lo detectamos)
                raw_type = str(t.get("_raw_type") or "").lower()
                amt = cast(int, t['amount_cents'])
                
                if t['transaction_type'] == 'income':
                    # Solo sumamos al "Ingreso del Periodo" si el banco lo llamó Ingreso
                    # Los depósitos en efectivo (ATM) suelen estar fuera de esta bolsa en el resumen oficial
                    if 'deposito' not in raw_type and 'depósito' not in raw_type:
                        income_total += amt
                    else:
                        # Si es un depósito pero el banco no lo cuenta como ingreso oficial
                        # lo mantenemos en la lista pero no en la tarjeta de resumen para coincidir
                        pass
                else:
                    expense_total += amt

            # Si el banco tiene un resumen explícito arriba, ese manda sobre la suma manual
            # para asegurar coincidencia del 100% con el papel.
            if official_income is not None: income_total = official_income
            if official_expense is not None: expense_total = official_expense

            dates = [str(t['date']) for t in transactions if t.get('date')]
            if not dates:
                return {}
            
            return {
                "bank_name": "Extractor Local",
                "period_start": min(dates),
                "period_end": max(dates),
                "total_income_cents": income_total,
                "total_expense_cents": expense_total,
                "transactions": transactions
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"[LocalParser] Error extrayendo localmente: {e}", exc_info=True)
            return {}

    async def parse_account_document(self, file_data: bytes, filename: str, account_id: str, expected_bank_name: Optional[str] = None) -> Dict[str, Any]:
        api_key = self._get_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY no configurada en el sistema.")

        client = genai.Client(api_key=api_key)
        
        parsed_data: Dict[str, Any] = {"transactions": []}
        
        # --- NUEVO: Extracción Híbrida (Local First) ---
        logger.info("[AccountIntelligence] Intentando extracción heurística local...")
        local_transactions = self.local_extract_transactions(file_data, filename)
        
        if isinstance(local_transactions, dict) and local_transactions.get("transactions"):
            tx_count = len(local_transactions["transactions"])
            logger.info(f"[AccountIntelligence] ÉXITO LOCAL: Se extrajeron {tx_count} transacciones sin usar IA.")
            parsed_data = local_transactions
        else:
            logger.info("[AccountIntelligence] Extracción local falló o no encontró datos. Pasando a IA (Tier 3)...")
            # 1. Convertir archivo a texto crudo para la IA
            raw_csv_text = self.convert_to_csv_string(file_data, filename)
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

    def finalize_import(self, import_log_id: str, confirmed_transactions: List[Dict]):
        """Guarda las transacciones de cuenta confirmadas en la DB."""
        log = self.db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
        if not log:
            return 0

        try:
            new_txs_count = 0
            earliest_date = datetime.now().date()

            # We reverse the list to insert from OLDEST to NEWEST
            # This ensures that 'created_at' reflects the chronological flow within a day
            for tx_data in reversed(confirmed_transactions):
                if not tx_data.get('is_duplicate', False):
                    dt = parse_date_robustly(tx_data['date']) or datetime.now()
                    if dt.date() < earliest_date:
                        earliest_date = dt.date()

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
                        amount=abs(tx_data['amount_cents']),
                        transaction_type=tx_data['transaction_type'],
                        date=dt,
                        account_id=log.account_id,
                        category_id=category_id,
                        payment_method='transfer', # Por defecto en cuentas de ahorro
                        fingerprint=tx_data['fingerprint'],
                        import_log_id=log.id,
                        running_balance=tx_data.get('balance_cents'),
                        beneficiary=tx_data.get('beneficiary'),
                        is_manual=False,
                        needs_clarification=tx_data.get('needs_clarification', False)
                    )
                    self.db.add(new_tx)
                    
                    # Aprender el patrón basándose en la confirmación del usuario
                    if category_id:
                        from app.services.categorizer import learn_category_pattern
                        learn_category_pattern(self.db, cast(Any, new_tx.description), cast(Any, category_id), cast(Any, new_tx.beneficiary))

                    new_txs_count += 1

            log.status = cast(Any, 'processed')
            self.db.commit()

            if new_txs_count > 0:
                from app.services.snapshot_service import mark_snapshots_as_stale
                mark_snapshots_as_stale(self.db, earliest_date.month, earliest_date.year)
                # Recalcular saldos
                from app.services.balance import recalculate_account_balance
                recalculate_account_balance(self.db, cast(Any, log.account_id))

            return new_txs_count
        except Exception as e:
            self.db.rollback()
            log.status = cast(Any, 'error')
            log.error_message = cast(Any, str(e))
            self.db.commit()
            raise e
        finally:
            self.db.close()
