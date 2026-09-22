"""
Fiscal API endpoints for SRI reporting and tax breakdown.
Provides fiscal data directly from backend database instead of IndexedDB.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from typing import Optional, List, Any, cast
from datetime import datetime, date
from decimal import Decimal
import csv
import io
import json
import logging
from database import get_db
from app.api.auth import get_current_device
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.config import Config

logger = logging.getLogger(__name__)
FISCAL_ERROR_RESPONSES = {500: {"description": "Fiscal report generation failed."}}

router = APIRouter(
    prefix="/fiscal", 
    tags=["Fiscal"], 
    dependencies=[Depends(get_current_device)]
)


def get_iva_rate(db: Session) -> Decimal:
    """Get IVA rate from config, default to 0.15 (15%)"""
    config = db.query(Config).filter(Config.key == "iva_rate").first()
    if config and config.value:
        try:
            return Decimal(cast(str, config.value))
        except Exception as e:
            logger.warning(f"Error parsing iva_rate config: {e}")
            return Decimal("0.15")
    
    # If not exists, create it as a default
    new_config = Config(
        key="iva_rate",
        value="0.15",
        value_type="decimal",
        description="Tasa de IVA para reportes fiscales (ej: 0.15 para 15%)",
        is_public=True
    )
    db.add(new_config)
    db.commit()
    return Decimal("0.15")


def get_retention_source_rate(db: Session) -> Decimal:
    """Get retention source rate from config, default to 0.01 (1%)"""
    config = db.query(Config).filter(Config.key == "retencion_source_rate").first()
    if config and config.value:
        try:
            return Decimal(cast(str, config.value))
        except Exception as e:
            logger.warning(f"Error parsing retencion_source_rate config: {e}")
            return Decimal("0.01")
    
    new_config = Config(
        key="retencion_source_rate",
        value="0.01",
        value_type="decimal",
        description="Tasa de Retención en la Fuente (ej: 0.01 para 1%)",
        is_public=True
    )
    db.add(new_config)
    db.commit()
    return Decimal("0.01")


def get_retention_iva_rate(db: Session) -> Decimal:
    """Get retention IVA rate from config, default to 0.30 (30%)"""
    config = db.query(Config).filter(Config.key == "retencion_iva_rate").first()
    if config and config.value:
        try:
            return Decimal(cast(str, config.value))
        except Exception as e:
            logger.warning(f"Error parsing retencion_iva_rate config: {e}")
            return Decimal("0.30")
    
    new_config = Config(
        key="retencion_iva_rate",
        value="0.30",
        value_type="decimal",
        description="Tasa de Retención de IVA (ej: 0.30 para 30%)",
        is_public=True
    )
    db.add(new_config)
    db.commit()
    return Decimal("0.30")


class FiscalTotals(BaseModel):
    total_income: Decimal
    total_expenses: Decimal
    iva_projected: Decimal
    retencion_projected: Decimal
    total_deductible: Decimal
    iva_pagado_15: Decimal
    monto_objeto_retencion: Decimal
    transaction_count: int


class CategoryBreakdownItem(BaseModel):
    category_id: str
    category_name: str
    amount: Decimal
    formatted: str


class FiscalReportResponse(BaseModel):
    totals: FiscalTotals
    category_breakdown: List[CategoryBreakdownItem]


class MonthlyTrendItem(BaseModel):
    month: str
    income: Decimal
    expenses: Decimal
    iva_projected: Decimal


def _parse_fiscal_dates(start_date: str, end_date: str) -> tuple[date, date]:
    return (
        datetime.strptime(start_date, "%Y-%m-%d").date(),
        datetime.strptime(end_date, "%Y-%m-%d").date(),
    )


def _get_fiscal_transactions(
    db: Session,
    start_date: date,
    end_date: date,
    category_ids: Optional[str],
) -> list[Transaction]:
    query = db.query(Transaction).filter(
        Transaction.is_deleted == False,
        Transaction.date >= start_date,
        Transaction.date <= end_date,
    )
    if category_ids:
        query = query.filter(Transaction.category_id.in_(category_ids.split(',')))
    return query.all()


def _is_zero_iva_category(category_name: str) -> bool:
    keywords = (
        ["salud", "medic", "farmac", "hospit"],
        ["aliment", "restaur", "comida", "supermer"],
        ["vivien", "arriend", "luz", "agua", "alicuot"],
        ["educac", "art", "cultur", "cole", "univers", "curs"],
    )
    return any(keyword in category_name for group in keywords for keyword in group)


def _accumulate_fiscal_transaction(
    transaction: Transaction,
    totals: dict,
    category_totals: dict,
    iva_rate: Decimal,
    retention_source_rate: Decimal,
) -> None:
    amount = Decimal(str(transaction.amount)) if transaction.amount else Decimal(0)
    if transaction.transaction_type == "income":
        totals["total_income"] += amount
        return
    if transaction.transaction_type != "expense":
        return
    totals["total_expenses"] += amount
    category_name = transaction.category.name.lower() if transaction.category else ""
    iva = Decimal(0) if _is_zero_iva_category(category_name) else amount * iva_rate
    totals["iva_projected"] += iva
    totals["iva_pagado_15"] += iva
    totals["retencion_projected"] += amount * retention_source_rate
    totals["monto_objeto_retencion"] += amount
    totals["total_deductible"] += amount
    category_id = str(transaction.category_id) if transaction.category_id else "uncategorized"
    display_name = transaction.category.name if transaction.category else "Sin Categoría"
    category_totals.setdefault(
        category_id, {"name": display_name, "amount": Decimal(0)}
    )["amount"] += amount


def _calculate_fiscal_totals(
    transactions: list[Transaction],
    iva_rate: Decimal,
    retention_source_rate: Decimal,
) -> tuple[dict, dict]:
    totals = {
        "total_income": Decimal(0),
        "total_expenses": Decimal(0),
        "iva_projected": Decimal(0),
        "retencion_projected": Decimal(0),
        "total_deductible": Decimal(0),
        "iva_pagado_15": Decimal(0),
        "monto_objeto_retencion": Decimal(0),
    }
    category_totals = {}
    for transaction in transactions:
        _accumulate_fiscal_transaction(
            transaction, totals, category_totals, iva_rate, retention_source_rate
        )
    return totals, category_totals


def _build_category_breakdown(category_totals: dict) -> list[CategoryBreakdownItem]:
    return [
        CategoryBreakdownItem(
            category_id=category_id,
            category_name=data["name"],
            amount=data["amount"],
            formatted=f"${data['amount']:.2f}",
        )
        for category_id, data in sorted(
            category_totals.items(), key=lambda item: item[1]["amount"], reverse=True
        )
    ]


def _build_monthly_fiscal_data(transactions: list[Transaction], iva_rate: Decimal) -> dict:
    monthly_data = {}
    for transaction in transactions:
        month = transaction.date.strftime("%Y-%m")
        monthly_data.setdefault(month, {
            "income": Decimal(0), "expenses": Decimal(0), "iva_projected": Decimal(0)
        })
        amount = Decimal(str(transaction.amount)) if transaction.amount else Decimal(0)
        if transaction.transaction_type == "income":
            monthly_data[month]["income"] += amount
        elif transaction.transaction_type == "expense":
            monthly_data[month]["expenses"] += amount
            if not _is_zero_iva_category(transaction.category.name.lower() if transaction.category else ""):
                monthly_data[month]["iva_projected"] += amount * iva_rate
    return monthly_data


SRI_CONCEPTS = {
    "Salud": "3290",
    "Alimentación": "3300",
    "Vivienda": "3310",
    "Educación, Arte y Cultura": "5040",
    "Vestimenta": "3320",
    "Turismo": "3325",
    "Total Deducciones": "3330",
}


def _get_sri_concept_code(category_name: str) -> Optional[str]:
    groups = {
        "Salud": ["salud", "medic", "farmac", "hospit"],
        "Alimentación": ["aliment", "restaur", "comida", "supermer"],
        "Vivienda": ["vivien", "arriend", "luz", "agua", "alicuot"],
        "Educación, Arte y Cultura": ["educac", "art", "cultur", "cole", "univers", "curs"],
        "Vestimenta": ["vestim", "ropa", "zapat"],
        "Turismo": ["turism", "viaje", "hotel", "vuel"],
    }
    for concept, keywords in groups.items():
        if any(keyword in category_name for keyword in keywords):
            return SRI_CONCEPTS[concept]
    return None


def _serialize_sri_declaration(final_data: dict, year: int, output_format: str) -> tuple[bytes | str, str, str]:
    if output_format == "json":
        content = json.dumps({
            "detallesDeclaracion": {
                key: f"{value:.2f}" if isinstance(value, Decimal) else value
                for key, value in final_data.items()
            }
        }, indent=2)
        return content, "application/json", f"declaracion_sri_{year}.json"

    import xml.etree.ElementTree as ET
    root = ET.Element("detallesDeclaracion")
    for key, value in final_data.items():
        child = ET.SubElement(root, "detalle", concepto=key)
        child.text = f"{value:.2f}" if isinstance(value, Decimal) else str(value)
    xml_str = ET.tostring(root, encoding='utf-8', method='xml')
    content = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml_str
    return content, "application/xml", f"declaracion_sri_{year}.xml"


def _build_sri_declaration_data(transactions: list[Transaction]) -> dict:
    totals = {code: Decimal("0.00") for code in SRI_CONCEPTS.values()}
    for transaction in transactions:
        category_name = transaction.category.name.lower() if transaction.category else ""
        sri_code = _get_sri_concept_code(category_name)
        if not sri_code:
            continue
        amount = Decimal(str(transaction.amount)) / Decimal("100")
        totals[sri_code] += amount
        totals[SRI_CONCEPTS["Total Deducciones"]] += amount
    return {
        key: value for key, value in totals.items()
        if (isinstance(value, Decimal) and value > 0) or key == "100"
    }


@router.get("/report", response_model=FiscalReportResponse, responses=FISCAL_ERROR_RESPONSES)
def get_fiscal_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    category_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Generate fiscal report for the specified date range.
    Returns totals and category breakdown for SRI reporting with actual VAT rules.
    """
    try:
        start_dt, end_dt = _parse_fiscal_dates(start_date, end_date)
        transactions = _get_fiscal_transactions(db, start_dt, end_dt, category_ids)
        totals, category_totals = _calculate_fiscal_totals(
            transactions,
            get_iva_rate(db),
            get_retention_source_rate(db),
        )
        return FiscalReportResponse(
            totals=FiscalTotals(
                total_income=totals["total_income"],
                total_expenses=totals["total_expenses"],
                iva_projected=totals["iva_projected"],
                retencion_projected=totals["retencion_projected"],
                total_deductible=totals["total_deductible"],
                iva_pagado_15=totals["iva_pagado_15"],
                monto_objeto_retencion=totals["monto_objeto_retencion"],
                transaction_count=len(transactions)
            ),
            category_breakdown=_build_category_breakdown(category_totals)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating fiscal report: {str(e)}")


@router.get("/trend", response_model=List[MonthlyTrendItem], responses=FISCAL_ERROR_RESPONSES)
def get_fiscal_trend(
    start_date: str = Query(...),
    end_date: str = Query(...),
    category_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get monthly fiscal trend data for the specified date range.
    Returns income, expenses, and actual category-based IVA per month.
    """
    try:
        start_dt, end_dt = _parse_fiscal_dates(start_date, end_date)
        transactions = _get_fiscal_transactions(db, start_dt, end_dt, category_ids)
        monthly_data = _build_monthly_fiscal_data(transactions, get_iva_rate(db))
        return [
            MonthlyTrendItem(
                month=month,
                income=data["income"],
                expenses=data["expenses"],
                iva_projected=data["iva_projected"],
            )
            for month, data in sorted(monthly_data.items())
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating fiscal trend: {str(e)}")


@router.get("/export-declaracion-sri", responses=FISCAL_ERROR_RESPONSES)
def export_declaracion_sri(
    year: int = Query(...),
    format: str = Query("xml", pattern="^(xml|json)$"),
    db: Session = Depends(get_db)
):
    """
    Exporta la declaración de gastos personales del SRI en formato XML o JSON.
    Mapea las categorías internas a los códigos de Concepto oficiales.
    """
    try:
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)
        transactions = db.query(Transaction).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= start_date,
            Transaction.date <= end_date,
        ).all()
        final_data = _build_sri_declaration_data(transactions)
        content, media_type, filename = _serialize_sri_declaration(final_data, year, format)
        return Response(
            content=content if isinstance(content, bytes) else content.encode('utf-8'),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        logger.exception("Error generando declaración SRI")  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(e))
