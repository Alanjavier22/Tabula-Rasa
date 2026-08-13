"""
Métricas de estado patrimonial: net worth, balance sheet mensual/histórico
y valor de activos con depreciación. Se monta bajo /metrics vía api/metrics.py.
"""
from typing import Dict, cast
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from datetime import datetime, timezone
from decimal import Decimal
from database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.transaction_split import TransactionSplit
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.debt_share import DebtShare
from app.services.asset_depreciation import asset_depreciation_service
from app.services.balance_sheet import balance_sheet_service

router = APIRouter()


class NetWorthResponse(BaseModel):
    net_worth: int
    assets: int
    liabilities: int
    history: list


@router.get("/net-worth", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    assets_accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.is_deleted == False,
        Account.account_type.in_(["checking", "savings", "investment"])
    ).all()
    assets = Decimal(str(sum((acc.balance for acc in assets_accounts), 0)))

    they_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.THEY_OWE, IOU.status == IOUStatus.PENDING,
        IOU.is_deleted == False
    ).all()
    assets += Decimal(str(sum((i.amount for i in they_owe_ious), 0)))

    # DebtShares (Money owed to user by others for CC payments)
    pending_debt_shares = db.query(DebtShare).filter(DebtShare.status == "pending").all()
    assets += Decimal(str(sum((ds.amount for ds in pending_debt_shares), 0)))

    # Physical Assets with Depreciation
    from app.models.asset import Asset
    physical_assets = db.query(Asset).filter(Asset.is_deleted == False).all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for asset in physical_assets:
        current_val_result = asset_depreciation_service.calculate_current_value(db, cast(str, asset.id), now)
        assets += Decimal(str(current_val_result.current_value_cents))

    liabilities_accounts = db.query(Account).filter(
        Account.is_active == 1, Account.is_deleted == False, Account.account_type == "credit_card"
    ).all()
    liabilities = Decimal(str(sum(
        (abs(cast(int, acc.balance)) for acc in liabilities_accounts if acc.balance < 0),
        0
    )))

    i_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.I_OWE, IOU.status == IOUStatus.PENDING,
        IOU.is_deleted == False
    ).all()
    liabilities += Decimal(str(sum((i.amount for i in i_owe_ious), 0)))


    net_worth = assets - liabilities

    # Agregación en SQL en vez de N+1 (antes: una query de transacciones por mes
    # + acceso lazy a .splits por cada una). Mismo patrón que ya usa
    # dashboard-summary más abajo: sumar por separado transacciones simples (sin
    # splits) y transacciones con splits (sumando el split, no el monto original).
    simple_monthly = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("income"),
        func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("expense")
    ).filter(
        Transaction.is_deleted == False,
        ~Transaction.id.in_(db.query(TransactionSplit.transaction_id))
    ).group_by("month").all()

    split_monthly = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(case((Transaction.transaction_type == "income", TransactionSplit.amount), else_=0)).label("income"),
        func.sum(case((Transaction.transaction_type == "expense", TransactionSplit.amount), else_=0)).label("expense")
    ).join(TransactionSplit, Transaction.id == TransactionSplit.transaction_id).filter(
        Transaction.is_deleted == False
    ).group_by("month").all()

    monthly_map: Dict[str, Dict[str, Decimal]] = {}
    for row in simple_monthly:
        monthly_map[row.month] = {
            "income": Decimal(str(row.income or 0)),
            "expense": Decimal(str(row.expense or 0)),
        }
    for row in split_monthly:
        bucket = monthly_map.setdefault(row.month, {"income": Decimal("0"), "expense": Decimal("0")})
        bucket["income"] += Decimal(str(row.income or 0))
        bucket["expense"] += Decimal(str(row.expense or 0))

    history = [
        {"month": month, "income": data["income"], "expense": data["expense"]}
        for month, data in sorted(monthly_map.items())
    ]

    return NetWorthResponse(
        net_worth=net_worth,
        assets=assets,
        liabilities=liabilities,
        history=history
    )


class AssetValueResponse(BaseModel):
    asset_id: str
    asset_name: str
    purchase_price_cents: int
    current_value_cents: int
    depreciation_accumulated_cents: int
    months_elapsed: int
    is_fully_depreciated: bool


@router.get("/assets/{asset_id}/value", response_model=AssetValueResponse)
def get_asset_value(asset_id: str, db: Session = Depends(get_db)):
    """Get current value of a specific asset with depreciation calculation"""
    try:
        result = asset_depreciation_service.calculate_current_value(db, asset_id)
        return AssetValueResponse(**result.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating asset value: {str(e)}")


class AssetsTotalResponse(BaseModel):
    total_value_cents: int
    assets: list[dict]


@router.get("/assets/total", response_model=AssetsTotalResponse)
def get_total_assets_value(db: Session = Depends(get_db)):
    """Get total current value of all assets"""
    try:
        total_value = asset_depreciation_service.get_total_assets_value(db)
        assets_with_values = asset_depreciation_service.get_all_assets_with_values(db)
        return AssetsTotalResponse(
            total_value_cents=total_value,
            assets=assets_with_values
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating total assets: {str(e)}")


class BalanceSheetResponse(BaseModel):
    month: int
    year: int
    date: str
    assets: dict
    liabilities: dict
    equity_cents: Decimal
    is_stale: bool


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def get_current_balance_sheet(db: Session = Depends(get_db)):
    """Get balance sheet for current month"""
    try:
        result = balance_sheet_service.get_current_balance_sheet(db)
        if not result:
            raise HTTPException(status_code=404, detail="No balance sheet found for current month")
        return BalanceSheetResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet: {str(e)}")


@router.get("/balance-sheet/{month}/{year}", response_model=BalanceSheetResponse)
def get_balance_sheet_by_month(month: int, year: int, db: Session = Depends(get_db)):
    """Get balance sheet for specific month/year"""
    try:
        result = balance_sheet_service.get_balance_sheet(db, month, year)
        if not result:
            raise HTTPException(status_code=404, detail=f"No balance sheet found for {month}/{year}")
        return BalanceSheetResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet: {str(e)}")


@router.get("/balance-sheet/history")
def get_balance_sheet_history(limit: int = 12, db: Session = Depends(get_db)):
    """Get balance sheet history (last N months)"""
    try:
        results = balance_sheet_service.get_balance_sheet_history(db, limit)
        return {"history": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet history: {str(e)}")
