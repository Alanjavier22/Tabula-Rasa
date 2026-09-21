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
DEBIT_TERM = 'débito'
DEPOSIT_TERM = 'depósito'

_HEADER_PATTERNS = (
    ('date', ('fecha',)),
    ('description', ('detalle', 'descrip', 'concepto')),
    ('amount', ('monto', 'valor')),
    ('balance', ('saldo', 'balance')),
    ('debit', ('cargo', DEBIT_TERM, 'retiro', 'egreso')),
    ('credit', ('abono', 'crédito', DEPOSIT_TERM, 'ingreso')),
    ('beneficiary', ('beneficiario', 'destinatario', 'nombre')),
    ('type', ('tipo', 'transacción', 'clase')),
)


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


def _read_local_dataframe(file_data: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith('.csv'):
        dataframe = pd.read_csv(
            io.BytesIO(file_data),
            header=None,
            encoding='utf-8',
            on_bad_lines='skip',
        )
    else:
        dataframe = pd.read_excel(io.BytesIO(file_data), header=None, engine='openpyxl')
    return dataframe.head(1000).dropna(how='all', axis=0).dropna(how='all', axis=1)


def _contains_any(value: str, terms: tuple[str, ...]) -> bool:
    return any(term in value for term in terms)


def _parse_money(value: Any) -> int:
    if pd.isna(value):
        return 0

    text_value = str(value).strip()
    if not text_value:
        return 0
    if ',' in text_value and '.' in text_value:
        text_value = text_value.replace('.', '').replace(',', '.')
    elif ',' in text_value:
        text_value = text_value.replace(',', '.')

    clean_value = re.sub(r'[^\d.-]', '', text_value)
    try:
        return int(round(float(clean_value) * 100))
    except (ValueError, TypeError):
        return 0


def _header_column_indexes(row: Any) -> dict[str, int]:
    columns = {name: -1 for name, _ in _HEADER_PATTERNS}
    for index, value in enumerate(row):
        if pd.isna(value):
            continue
        column_name = str(value).lower()
        for name, patterns in _HEADER_PATTERNS:
            if columns[name] == -1 and _contains_any(column_name, patterns):
                columns[name] = index
                break
    return columns


def _find_header(df: pd.DataFrame) -> tuple[int, dict[str, int]]:
    for index, row in df.iterrows():
        row_text = " ".join(str(value).lower() for value in row if pd.notna(value))
        if 'fecha' not in row_text or not _contains_any(row_text, ('detalle', 'descrip', 'concepto')):
            continue
        logger.info(f"[LocalParser] Cabecera encontrada en fila {index}")
        return index, _header_column_indexes(row)
    return -1, {}


def _forced_transaction_type(raw_type: str) -> str | None:
    if _contains_any(raw_type, ('ingreso', 'abono', 'deposito', DEPOSIT_TERM)):
        return 'income'
    if _contains_any(raw_type, ('egreso', 'retiro', 'cargo', DEBIT_TERM, 'debito')):
        return 'expense'
    return None


def _transaction_type_from_label(raw_type: str) -> str:
    if _contains_any(raw_type, ('deposito', DEPOSIT_TERM)):
        return 'deposit'
    if _contains_any(raw_type, ('egreso', 'retiro', 'cargo', DEBIT_TERM, 'debito')):
        return 'expense'
    return 'income'


def _parse_amount_and_type(row: Any, columns: dict[str, int]) -> tuple[int, str] | None:
    amount_index = columns['amount']
    if amount_index != -1:
        raw_cents = _parse_money(row.iloc[amount_index])
        if raw_cents == 0:
            return None

        type_index = columns['type']
        raw_type = str(row.iloc[type_index]).lower() if type_index != -1 and pd.notna(row.iloc[type_index]) else ''
        if _forced_transaction_type(raw_type):
            return abs(raw_cents), _transaction_type_from_label(raw_type)
        return (raw_cents, 'income') if raw_cents > 0 else (abs(raw_cents), 'expense')

    debit_cents = _parse_money(row.iloc[columns['debit']]) if columns['debit'] != -1 else 0
    credit_cents = _parse_money(row.iloc[columns['credit']]) if columns['credit'] != -1 else 0
    if debit_cents != 0:
        return abs(debit_cents), 'expense'
    if credit_cents != 0:
        return abs(credit_cents), 'income'
    return None


def _parse_transaction_row(row: Any, columns: dict[str, int]) -> dict[str, Any] | None:
    try:
        date_value = row.iloc[columns['date']]
        description_value = row.iloc[columns['description']]
    except Exception:
        return None

    if pd.isna(date_value) or not str(date_value).strip():
        return None

    date_text = str(date_value).strip()
    description = str(description_value).strip() if pd.notna(description_value) else 'Sin descripción'
    try:
        from dateutil import parser as dt_parser
        date_iso = dt_parser.parse(date_text, dayfirst=True).strftime('%Y-%m-%d')
    except Exception:
        return None

    amount_and_type = _parse_amount_and_type(row, columns)
    if amount_and_type is None:
        return None
    amount_cents, transaction_type = amount_and_type

    balance_index = columns['balance']
    balance_cents = _parse_money(row.iloc[balance_index]) if balance_index != -1 else None
    beneficiary_index = columns['beneficiary']
    beneficiary = ''
    if beneficiary_index != -1 and pd.notna(row.iloc[beneficiary_index]):
        beneficiary = str(row.iloc[beneficiary_index]).strip()
    type_index = columns['type']
    raw_type = str(row.iloc[type_index]) if type_index != -1 else ''

    return {
        'date': date_iso,
        'description': description,
        'amount_cents': amount_cents,
        'transaction_type': transaction_type,
        'balance_cents': balance_cents,
        'beneficiary': beneficiary,
        '_raw_type': raw_type,
    }


def _extract_transactions(
    df: pd.DataFrame,
    header_row_index: int,
    columns: dict[str, int],
) -> tuple[list[dict[str, Any]], int]:
    transactions = []
    skipped_count = 0
    processing_data = False

    for index, row in df.iterrows():
        if not processing_data:
            if index == header_row_index:
                processing_data = True
            continue
        transaction = _parse_transaction_row(row, columns)
        if transaction is None:
            skipped_count += 1
        else:
            transactions.append(transaction)
    return transactions, skipped_count


def _summary_value(row: Any) -> int | None:
    result = None
    for value in row:
        parsed_value = _parse_money(value)
        if parsed_value > 100:
            result = parsed_value
    return result


def _extract_official_totals(df: pd.DataFrame) -> tuple[int | None, int | None]:
    official_income = None
    official_expense = None
    for _, row in df.head(15).iterrows():
        row_text = " ".join(str(value).lower() for value in row if pd.notna(value))
        if 'ingresos' in row_text and 'resumen' not in row_text:
            value = _summary_value(row)
            if value is not None:
                official_income = value
        if 'egresos' in row_text:
            value = _summary_value(row)
            if value is not None:
                official_expense = value
    return official_income, official_expense


def _calculate_totals(
    transactions: list[dict[str, Any]],
    official_income: int | None,
    official_expense: int | None,
) -> tuple[int, int]:
    income_total = 0
    expense_total = 0
    for transaction in transactions:
        raw_type = str(transaction.get('_raw_type') or '').lower()
        if transaction['transaction_type'] == 'income' and not _contains_any(raw_type, ('deposito', DEPOSIT_TERM)):
            income_total += transaction['amount_cents']
        elif transaction['transaction_type'] != 'income':
            expense_total += transaction['amount_cents']

    return (
        official_income if official_income is not None else income_total,
        official_expense if official_expense is not None else expense_total,
    )


def local_extract_transactions(file_data: bytes, filename: str) -> Dict[str, Any]:
    """Intenta extraer transacciones localmente usando heurísticas de Pandas para evitar llamada a la IA."""
    try:
        df = _read_local_dataframe(file_data, filename)

        logger.info(f"[LocalParser] Analizando estructura de {filename}. Filas detectadas: {len(df)}")
        for idx, row in df.head(10).iterrows():
            logger.debug(f"[LocalParser] Row {idx}: {' | '.join(str(value) for value in row)}")

        header_row_index, columns = _find_header(df)
        if header_row_index == -1 or columns.get('date', -1) == -1 or columns.get('description', -1) == -1:
            logger.warning('[LocalParser] No se encontró cabecera válida.')
            return {}
        if columns.get('amount', -1) == -1 and columns.get('debit', -1) == -1 and columns.get('credit', -1) == -1:
            logger.warning('[LocalParser] No se encontró columna de monto/cargos/abonos.')
            return {}

        transactions, skipped_count = _extract_transactions(df, header_row_index, columns)
        if skipped_count > 0:
            logger.info(f"[LocalParser] Info: Se saltaron {skipped_count} filas que no parecen ser transacciones.")

        official_income, official_expense = _extract_official_totals(df)
        income_total, expense_total = _calculate_totals(
            transactions,
            official_income,
            official_expense,
        )
        dates = [str(transaction['date']) for transaction in transactions if transaction.get('date')]
        if not dates:
            return {}

        return {
            'bank_name': 'Extractor Local',
            'period_start': min(dates),
            'period_end': max(dates),
            'total_income_cents': income_total,
            'total_expense_cents': expense_total,
            'transactions': transactions,
        }
    except Exception:  # pragma: no cover
        import traceback
        traceback.print_exc()
        logger.exception('[LocalParser] Error extrayendo localmente')  # pragma: no cover
        return {}
