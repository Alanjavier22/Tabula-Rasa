"""
Fiscal API endpoints for SRI reporting and tax breakdown.
Provides fiscal data directly from backend database instead of IndexedDB.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
import csv
import io
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
            return Decimal(config.value)
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
            return Decimal(config.value)
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
            return Decimal(config.value)
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
    Returns totals and category breakdown for SRI reporting.
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
                
                # Calculate IVA (15% of expense)
                iva = amount * IVA_RATE
                iva_projected += iva
                iva_pagado_15 += iva
                
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
    Returns income, expenses, and IVA per month.
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Parse category IDs if provided
        cat_ids = None
        if category_ids:
            cat_ids = category_ids.split(',')
        
        # Base query
        query = db.query(
            func.strftime("%Y-%m", Transaction.date).label("month"),
            func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("income"),
            func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("expenses")
        ).filter(
            Transaction.is_deleted == False,
            Transaction.date >= start_dt,
            Transaction.date <= end_dt
        )
        
        if cat_ids:
            query = query.filter(Transaction.category_id.in_(cat_ids))
        
        query = query.group_by(func.strftime("%Y-%m", Transaction.date)).order_by("month")
        
        results = query.all()
        
        IVA_RATE = get_iva_rate(db)
        
        trend = [
            MonthlyTrendItem(
                month=row.month,
                income=Decimal(str(row.income)) if row.income else Decimal(0),
                expenses=Decimal(str(row.expenses)) if row.expenses else Decimal(0),
                iva_projected=(Decimal(str(row.expenses)) if row.expenses else Decimal(0)) * IVA_RATE
            )
            for row in results
        ]
        
        return trend
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating fiscal trend: {str(e)}")


@router.get("/sri-annex")
def export_sri_annex(year: int = Query(...), db: Session = Depends(get_db)):
    """
    Export SRI annex as CSV for a given year.
    """
    try:
        # Query all expense transactions for the year
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)
        
        print(f"Exporting SRI annex for year {year}")
        print(f"Date range: {start_date} to {end_date}")
        
        transactions = db.query(Transaction, Category).join(
            Category, Transaction.category_id == Category.id
        ).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= start_date,
            Transaction.date <= end_date
        ).all()
        
        print(f"Found {len(transactions)} transactions")
        
        # Create CSV content with UTF-8 BOM for Excel compatibility
        output = io.StringIO()
        # Add UTF-8 BOM for proper encoding in Excel
        output.write('\ufeff')
        writer = csv.writer(output)
        
        # CSV headers (SRI format)
        writer.writerow([
            "Fecha",
            "Descripción",
            "Categoría",
            "Monto",
            "IVA",
            "Tipo de Comprobante"
        ])
        
        # Write transaction rows
        for txn, category in transactions:
            # Convert amount from cents to dollars
            amount_dollars = float(txn.amount) / 100
            iva_dollars = amount_dollars * float(get_iva_rate(db))
            
            # Clean category name: remove emojis and empty parentheses, keep accents
            category_name = category.name if category else ""
            import re
            # Remove emojis (Unicode emoji ranges) but keep accented characters
            category_name_clean = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251]+', '', category_name)
            category_name_clean = re.sub(r'\s*\(\s*\)', '', category_name_clean)  # Remove empty parentheses
            category_name_clean = category_name_clean.strip()
            
            writer.writerow([
                txn.date.strftime("%Y-%m-%d"),
                txn.description or "",
                category_name_clean,
                f"{amount_dollars:.2f}",
                f"{iva_dollars:.2f}",
                "Factura"  # Default document type
            ])
        
        # Create response with CSV content
        csv_content = output.getvalue()
        print(f"CSV content length: {len(csv_content)}")
        return Response(
            content=csv_content.encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=anexo_gastos_sri_{year}.csv"
            }
        )
    except Exception as e:
        print(f"Error exporting SRI annex: {str(e)}")
        raise e
