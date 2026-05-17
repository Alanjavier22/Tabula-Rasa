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
        except:
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
        except:
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
        except:
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


@router.get("/report", response_model=FiscalReportResponse)
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
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Parse category IDs if provided
        cat_ids = None
        if category_ids:
            cat_ids = category_ids.split(',')
        
        # Base query for transactions in date range
        query = db.query(Transaction).filter(
            Transaction.is_deleted == False,
            Transaction.date >= start_dt,
            Transaction.date <= end_dt
        )
        
        if cat_ids:
            query = query.filter(Transaction.category_id.in_(cat_ids))
        
        transactions = query.all()
        
        # Calculate totals
        total_income = Decimal(0)
        total_expenses = Decimal(0)
        iva_projected = Decimal(0)
        retencion_projected = Decimal(0)
        total_deductible = Decimal(0)
        iva_pagado_15 = Decimal(0)
        monto_objeto_retencion = Decimal(0)
        
        category_totals = {}
        
        # Ecuador fiscal rules
        IVA_RATE = get_iva_rate(db)
        RETENCION_SOURCE_RATE = get_retention_source_rate(db)
        RETENCION_IVA_RATE = get_retention_iva_rate(db)
        
        for txn in transactions:
            amount = Decimal(str(txn.amount)) if txn.amount else Decimal(0)
            
            if txn.transaction_type == "income":
                total_income += amount
            elif txn.transaction_type == "expense":
                total_expenses += amount
                
                # Ecuador VAT Rules: Basic goods (Food, Health, Housing, Education) have 0% VAT.
                # Clothing, tourism, and other general expenses are standard 15%.
                cat_name = txn.category.name.lower() if txn.category else ""
                
                is_iva_0 = False
                if any(k in cat_name for k in ["salud", "medic", "farmac", "hospit"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["aliment", "restaur", "comida", "supermer"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["vivien", "arriend", "luz", "agua", "alicuot"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["educac", "art", "cultur", "cole", "univers", "curs"]):
                    is_iva_0 = True
                
                if is_iva_0:
                    iva = Decimal(0)
                else:
                    iva = amount * IVA_RATE
                    iva_pagado_15 += iva
                
                iva_projected += iva
                
                # Calculate retención (1% of expense)
                retencion = amount * RETENCION_SOURCE_RATE
                retencion_projected += retencion
                
                # Base for withholding calculations
                monto_objeto_retencion += amount
                
                # All expenses are deductible
                total_deductible += amount
                
                # Category breakdown
                cat_id = str(txn.category_id) if txn.category_id else "uncategorized"
                cat_name = txn.category.name if txn.category else "Sin Categoría"
                if cat_id not in category_totals:
                    category_totals[cat_id] = {"name": cat_name, "amount": Decimal(0)}
                category_totals[cat_id]["amount"] += amount
        
        # Build category breakdown
        category_breakdown = [
            CategoryBreakdownItem(
                category_id=cat_id,
                category_name=data["name"],
                amount=data["amount"],
                formatted=f"${data['amount']:.2f}"
            )
            for cat_id, data in sorted(category_totals.items(), key=lambda x: x[1]["amount"], reverse=True)
        ]
        
        return FiscalReportResponse(
            totals=FiscalTotals(
                total_income=total_income,
                total_expenses=total_expenses,
                iva_projected=iva_projected,
                retencion_projected=retencion_projected,
                total_deductible=total_deductible,
                iva_pagado_15=iva_pagado_15,
                monto_objeto_retencion=monto_objeto_retencion,
                transaction_count=len(transactions)
            ),
            category_breakdown=category_breakdown
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating fiscal report: {str(e)}")


@router.get("/trend", response_model=List[MonthlyTrendItem])
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
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Parse category IDs if provided
        cat_ids = None
        if category_ids:
            cat_ids = category_ids.split(',')
        
        # Base query for all transactions
        query = db.query(Transaction).filter(
            Transaction.is_deleted == False,
            Transaction.date >= start_dt,
            Transaction.date <= end_dt
        )
        
        if cat_ids:
            query = query.filter(Transaction.category_id.in_(cat_ids))
            
        transactions = query.all()
        
        IVA_RATE = get_iva_rate(db)
        
        monthly_data = {}
        for txn in transactions:
            # Format month label (e.g. "2026-04")
            month_str = txn.date.strftime("%Y-%m")
            if month_str not in monthly_data:
                monthly_data[month_str] = {
                    "income": Decimal(0),
                    "expenses": Decimal(0),
                    "iva_projected": Decimal(0)
                }
            
            amount = Decimal(str(txn.amount)) if txn.amount else Decimal(0)
            if txn.transaction_type == "income":
                monthly_data[month_str]["income"] += amount
            elif txn.transaction_type == "expense":
                monthly_data[month_str]["expenses"] += amount
                
                # Check for SRI 0% IVA categories
                cat_name = txn.category.name.lower() if txn.category else ""
                is_iva_0 = False
                if any(k in cat_name for k in ["salud", "medic", "farmac", "hospit"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["aliment", "restaur", "comida", "supermer"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["vivien", "arriend", "luz", "agua", "alicuot"]):
                    is_iva_0 = True
                elif any(k in cat_name for k in ["educac", "art", "cultur", "cole", "univers", "curs"]):
                    is_iva_0 = True
                
                if not is_iva_0:
                    monthly_data[month_str]["iva_projected"] += amount * IVA_RATE
        
        trend = [
            MonthlyTrendItem(
                month=m,
                income=data["income"],
                expenses=data["expenses"],
                iva_projected=data["iva_projected"]
            )
            for m, data in sorted(monthly_data.items())
        ]
        
        return trend
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating fiscal trend: {str(e)}")


@router.get("/export-declaracion-sri")
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
        from app.services.sri_classifier import SRIClassifier
        
        # 1. Obtener transacciones de gasto del año
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)
        
        transactions = db.query(Transaction).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).all()

        # 2. Mapeo de categorías a conceptos SRI
        # Estos son los códigos oficiales según el requerimiento
        CONCEPTS = {
            "Salud": "3290",
            "Alimentación": "3300",
            "Vivienda": "3310",
            "Educación, Arte y Cultura": "5040",
            "Vestimenta": "3320",
            "Turismo": "3325",
            "Total Deducciones": "3330"
        }

        # Inicializar acumuladores
        totals = {code: Decimal("0.00") for code in CONCEPTS.values()}

        # 3. Clasificar y Sumar
        # Nota: Usamos una lógica de palabras clave simple para el mapeo si no hay campo SRI
        for txn in transactions:
            cat_name = txn.category.name.lower() if txn.category else ""
            # Convertir de centavos a dólares (dividido por 100)
            amount = Decimal(str(txn.amount)) / Decimal("100")
            
            sri_code = None
            if any(k in cat_name for k in ["salud", "medic", "farmac", "hospit"]):
                sri_code = CONCEPTS["Salud"]
            elif any(k in cat_name for k in ["aliment", "restaur", "comida", "supermer"]):
                sri_code = CONCEPTS["Alimentación"]
            elif any(k in cat_name for k in ["vivien", "arriend", "luz", "agua", "alicuot"]):
                sri_code = CONCEPTS["Vivienda"]
            elif any(k in cat_name for k in ["educac", "art", "cultur", "cole", "univers", "curs"]):
                sri_code = CONCEPTS["Educación, Arte y Cultura"]
            elif any(k in cat_name for k in ["vestim", "ropa", "zapat"]):
                sri_code = CONCEPTS["Vestimenta"]
            elif any(k in cat_name for k in ["turism", "viaje", "hotel", "vuel"]):
                sri_code = CONCEPTS["Turismo"]
            
            if sri_code:
                totals[sri_code] += amount
                totals[CONCEPTS["Total Deducciones"]] += amount

        # Limpiar conceptos con valor 0 (excepto el RUC Contador si se requiere)
        # El SRI dice que si no hay info, no se envía el tag.
        final_data = {k: v for k, v in totals.items() if (isinstance(v, Decimal) and v > 0) or k == "100"}

        # 4. Generar Archivo
        if format == "json":
            content = json.dumps({"detallesDeclaracion": {k: f"{v:.2f}" if isinstance(v, Decimal) else v for k, v in final_data.items()}}, indent=2)
            media_type = "application/json"
            filename = f"declaracion_sri_{year}.json"
        else:
            # XML Generation
            import xml.etree.ElementTree as ET
            root = ET.Element("detallesDeclaracion")
            for k, v in final_data.items():
                val_str = f"{v:.2f}" if isinstance(v, Decimal) else str(v)
                child = ET.SubElement(root, "detalle", concepto=k)
                child.text = val_str
            
            # Formatear XML con declaración
            xml_str = ET.tostring(root, encoding='utf-8', method='xml')
            content = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml_str
            media_type = "application/xml"
            filename = f"declaracion_sri_{year}.xml"

        return Response(
            content=content if isinstance(content, bytes) else content.encode('utf-8'),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        logger.error(f"Error generando declaración SRI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
