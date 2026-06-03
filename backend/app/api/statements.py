from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import get_db
from app.api.auth import get_current_device
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.debt_share import DebtShare, DebtShareStatus
from app.utils.date_parser import parse_date_robustly

router = APIRouter(
    prefix="/statements", 
    tags=["Credit Card Statements"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class DebtShareBase(BaseModel):
    person_name: str
    amount: int
    description: Optional[str] = None
    status: Optional[str] = "pending"


class DebtShareResponse(DebtShareBase):
    id: str
    statement_id: str
    version: int  # FASE 7: OCC versioning
    class Config:
        from_attributes = True


class StatementBase(BaseModel):
    account_id: str
    statement_balance: int
    user_share: int
    payment_due_date: Optional[str] = None
    cut_off_date: Optional[str] = None
    amount_paid: Optional[int] = 0
    status: Optional[str] = "pending"
    month: int
    year: int
    notes: Optional[str] = None


class StatementCreate(StatementBase):
    debt_shares: Optional[List[DebtShareBase]] = []


class StatementUpdate(BaseModel):
    statement_balance: Optional[int] = None
    user_share: Optional[int] = None
    payment_due_date: Optional[str] = None
    cut_off_date: Optional[str] = None
    amount_paid: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class StatementResponse(BaseModel):
    id: str
    account_id: str
    statement_balance: int
    user_share: int
    payment_due_date: Optional[str] = None
    cut_off_date: Optional[str] = None
    amount_paid: int
    status: str
    month: int
    year: int
    notes: Optional[str] = None
    debt_shares: List[DebtShareResponse] = []
    version: int  # FASE 7: OCC versioning
    class Config:
        from_attributes = True


def serialize_statement(stmt):
    return {
        "id": stmt.id,
        "account_id": stmt.account_id,
        "account_name": stmt.account.name if stmt.account else None,
        "statement_balance": stmt.statement_balance,
        "user_share": stmt.user_share,
        "payment_due_date": str(stmt.payment_due_date) if stmt.payment_due_date else None,
        "cut_off_date": str(stmt.cut_off_date) if stmt.cut_off_date else None,
        "amount_paid": stmt.amount_paid or 0,
        "status": stmt.status.value if hasattr(stmt.status, 'value') else stmt.status,
        "month": stmt.month,
        "year": stmt.year,
        "notes": stmt.notes,
        "version": getattr(stmt, 'version', 1),  # FASE 7: OCC versioning
        "debt_shares": [
            {
                "id": ds.id,
                "statement_id": ds.statement_id,
                "person_name": ds.person_name,
                "amount": ds.amount,
                "description": ds.description,
                "status": ds.status.value if hasattr(ds.status, 'value') else ds.status,
                "version": getattr(ds, 'version', 1),  # FASE 7: OCC versioning
            }
            for ds in stmt.debt_shares
        ]
    }


@router.get("/", response_model=List[dict])
def get_statements(account_id: Optional[str] = None, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    query = db.query(CreditCardStatement).options(joinedload(CreditCardStatement.debt_shares), joinedload(CreditCardStatement.account)).filter(CreditCardStatement.is_deleted == False)
    if account_id:
        query = query.filter(CreditCardStatement.account_id == account_id)
    statements = query.order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).all()
    return [serialize_statement(s) for s in statements]


@router.get("/{statement_id}")
def get_statement(statement_id: str, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    stmt = db.query(CreditCardStatement).options(joinedload(CreditCardStatement.debt_shares), joinedload(CreditCardStatement.account)).filter(CreditCardStatement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    return serialize_statement(stmt)


@router.post("/")
def create_statement(data: StatementCreate, db: Session = Depends(get_db)):
    stmt_data = data.model_dump(exclude={"debt_shares"})
    if stmt_data.get("payment_due_date"):
        stmt_data["payment_due_date"] = parse_date_robustly(stmt_data["payment_due_date"])
    if stmt_data.get("cut_off_date"):
        stmt_data["cut_off_date"] = parse_date_robustly(stmt_data["cut_off_date"])
    stmt = CreditCardStatement(**stmt_data)
    db.add(stmt)
    db.flush()
    for share in (data.debt_shares or []):
        ds = DebtShare(statement_id=stmt.id, **share.model_dump())
        db.add(ds)
    db.commit()
    db.refresh(stmt)
    return serialize_statement(stmt)


@router.put("/{statement_id}")
def update_statement(statement_id: str, data: StatementUpdate, db: Session = Depends(get_db)):
    stmt = db.query(CreditCardStatement).filter(CreditCardStatement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    update_data = data.model_dump(exclude_unset=True)
    if "payment_due_date" in update_data and update_data["payment_due_date"]:
        update_data["payment_due_date"] = parse_date_robustly(update_data["payment_due_date"])
    if "cut_off_date" in update_data and update_data["cut_off_date"]:
        update_data["cut_off_date"] = parse_date_robustly(update_data["cut_off_date"])
    for key, value in update_data.items():
        setattr(stmt, key, value)
    db.commit()
    db.refresh(stmt)
    return serialize_statement(stmt)


@router.delete("/{statement_id}")
def delete_statement(statement_id: str, db: Session = Depends(get_db)):
    stmt = db.query(CreditCardStatement).filter(CreditCardStatement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    db.delete(stmt)
    db.commit()
    return {"message": "Statement deleted"}


@router.post("/{statement_id}/shares")
def add_debt_share(statement_id: str, data: DebtShareBase, db: Session = Depends(get_db)):
    stmt = db.query(CreditCardStatement).filter(CreditCardStatement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    ds = DebtShare(statement_id=statement_id, **data.model_dump())
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id, "statement_id": ds.statement_id,
        "person_name": ds.person_name, "amount": ds.amount,
        "description": ds.description,
        "status": ds.status.value if hasattr(ds.status, 'value') else ds.status,
    }


@router.put("/shares/{share_id}")
def update_debt_share(share_id: str, data: DebtShareBase, db: Session = Depends(get_db)):
    ds = db.query(DebtShare).filter(DebtShare.id == share_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Debt share not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ds, key, value)
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id, "statement_id": ds.statement_id,
        "person_name": ds.person_name, "amount": ds.amount,
        "description": ds.description,
        "status": ds.status.value if hasattr(ds.status, 'value') else ds.status,
    }


@router.delete("/shares/{share_id}")
def delete_debt_share(share_id: str, db: Session = Depends(get_db)):
    ds = db.query(DebtShare).filter(DebtShare.id == share_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Debt share not found")
    db.delete(ds)
    db.commit()
    return {"message": "Debt share deleted"}
