from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.services.balance import recalculate_account_balance
from app.models.account import Account

router = APIRouter(
    prefix="/maintenance",
    tags=["maintenance"],
    dependencies=[Depends(get_current_device)]
)

@router.post("/heal-balances")
def heal_balances(db: Session = Depends(get_db)):
    """
    Recalculates balances for all accounts to ensure integrity.
    """
    accounts = db.query(Account).filter(Account.is_deleted == False).all()
    results = {}
    for acc in accounts:
        old_balance = acc.balance
        new_balance = recalculate_account_balance(db, str(acc.id))
        results[acc.name] = {
            "old": old_balance,
            "new": new_balance,
            "diff": new_balance - old_balance
        }
    return {"message": "Balances healed successfully", "details": results}
