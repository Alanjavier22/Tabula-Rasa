"""
Extracción heurística local (Pandas, sin IA) de transacciones de estados
de cuenta bancarios. AccountIntelligenceService.parse_account_document
intenta esto primero (Tier local) antes de caer a Gemini (Tier IA) —
ver account_intelligence.py.
"""
import io
import re
import logging
from typing import Any, Dict
import pandas as pd

logger = logging.getLogger(__name__)


def convert_to_csv_string(file_data: bytes, filename: str) -> str:
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


def local_extract_transactions(file_data: bytes, filename: str) -> Dict[str, Any]:
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
            amt = t['amount_cents']

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
