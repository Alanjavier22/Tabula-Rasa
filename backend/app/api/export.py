from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Any, cast
import csv
import io
from datetime import datetime
from database import get_db
from app.api.auth import get_current_device
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.asset import Asset
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.category import Category

router = APIRouter(
    prefix="/api/export",
    tags=["Export"],
    dependencies=[Depends(get_current_device)]
)

@router.get("/transactions")
def export_transactions(db: Session = Depends(get_db)):
    """Export all non-deleted transactions to CSV."""
    try:
        transactions = db.query(Transaction).filter(
            Transaction.is_deleted == False
        ).order_by(desc(Transaction.date)).all()

        output = io.StringIO()
        # Add UTF-8 BOM for Excel compatibility
        output.write('\ufeff')
        writer = csv.writer(output)

        writer.writerow([
            "Fecha", 
            "Descripción", 
            "Monto", 
            "Tipo", 
            "Categoría", 
            "Cuenta", 
            "Método de Pago",
            "Tipo de Gasto"
        ])

        for txn in transactions:
            category_name = txn.category.name if txn.category else "Sin Categoría"
            account_name = txn.account.name if txn.account else "Sin Cuenta"
            
            # Convert cents to units
            amount = float(cast(Any, txn.amount)) / 100
            
            writer.writerow([
                txn.date.strftime("%Y-%m-%d") if txn.date else "",
                txn.description,
                f"{amount:.2f}",
                txn.transaction_type,
                category_name,
                account_name,
                txn.payment_method,
                txn.expense_type or ""
            ])

        return Response(
            content=output.getvalue().encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=transacciones_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting transactions: {str(e)}")

@router.get("/accounts")
def export_accounts(db: Session = Depends(get_db)):
    """Export all accounts to CSV."""
    try:
        accounts = db.query(Account).all()

        output = io.StringIO()
        output.write('\ufeff')
        writer = csv.writer(output)

        writer.writerow(["Nombre", "Tipo", "Saldo", "Moneda", "Descripción"])

        for acc in accounts:
            balance = float(cast(Any, acc.balance)) / 100
            writer.writerow([
                acc.name,
                acc.account_type,
                f"{balance:.2f}",
                acc.currency,
                acc.description or ""
            ])

        return Response(
            content=output.getvalue().encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=cuentas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting accounts: {str(e)}")

@router.get("/assets")
def export_assets(db: Session = Depends(get_db)):
    """Export all assets to CSV."""
    try:
        assets = db.query(Asset).all()

        output = io.StringIO()
        output.write('\ufeff')
        writer = csv.writer(output)

        writer.writerow(["Nombre", "Tipo", "Valor Actual", "Valor Compra", "Fecha Compra"])

        for asset in assets:
            current_val = float(cast(Any, asset.current_value)) / 100
            purchase_val = float(cast(Any, asset.purchase_value)) / 100 if asset.purchase_value else 0
            writer.writerow([
                asset.name,
                asset.asset_type,
                f"{current_val:.2f}",
                f"{purchase_val:.2f}",
                asset.purchase_date.strftime("%Y-%m-%d") if asset.purchase_date else ""
            ])

        return Response(
            content=output.getvalue().encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=activos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting assets: {str(e)}")

@router.get("/snapshots")
def export_snapshots(db: Session = Depends(get_db)):
    """Export net worth snapshots to CSV."""
    try:
        snapshots = db.query(NetWorthSnapshot).order_by(desc(NetWorthSnapshot.date)).all()

        output = io.StringIO()
        output.write('\ufeff')
        writer = csv.writer(output)

        writer.writerow(["Fecha", "Activos Totales", "Pasivos Totales", "Patrimonio Neto"])

        for snap in snapshots:
            assets = float(cast(Any, snap.total_assets)) / 100
            liabilities = float(cast(Any, snap.total_liabilities)) / 100
            net = float(cast(Any, snap.net_worth)) / 100
            writer.writerow([
                snap.date.strftime("%Y-%m-%d") if snap.date else "",
                f"{assets:.2f}",
                f"{liabilities:.2f}",
                f"{net:.2f}"
            ])

        return Response(
            content=output.getvalue().encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=patrimonio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting snapshots: {str(e)}")
