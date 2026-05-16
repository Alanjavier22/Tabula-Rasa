from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from database import get_db
from app.api.auth import get_current_device
from app.models.goal import Goal, GoalStatus
from app.models.transaction import Transaction
from pydantic import BaseModel
from datetime import datetime, timezone


router = APIRouter(
    prefix="/goals", 
    tags=["goals"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


def recalculate_goal_progress(goal_id: str, db: Session):
    """Recalcula el current_amount de una meta basado en las transacciones asignadas"""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        return
    
    # Sumar todas las transacciones asignadas a esta meta
    transactions = db.query(Transaction).filter(
        Transaction.goal_id == goal_id,
        Transaction.is_deleted == False
    ).all()
    
    total_amount = sum(t.amount for t in transactions)
    goal.current_amount = cast(Any, total_amount)
    db.commit()


class GoalBase(BaseModel):
    name: str
    target_amount: int
    target_date: Optional[datetime] = None
    status: GoalStatus = GoalStatus.ACTIVE
    description: Optional[str] = None
    version: int = 1


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[int] = None
    target_date: Optional[datetime] = None
    status: Optional[GoalStatus] = None
    description: Optional[str] = None
    version: Optional[int] = None


class GoalResponse(GoalBase):
    id: str
    current_amount: int
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False

    class Config:
        from_attributes = True


@router.post("/", response_model=GoalResponse)
def create_goal(goal: GoalCreate, db: Session = Depends(get_db)):
    db_goal = Goal(**goal.model_dump())
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.get("/", response_model=List[GoalResponse])
def get_goals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    goals = db.query(Goal).filter(Goal.is_deleted == False).offset(skip).limit(limit).all()
    return goals


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(goal_id: str, goal: GoalUpdate, db: Session = Depends(get_db)):
    db_goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    update_data = goal.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_goal, key, value)
    
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.delete("/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    db_goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Unlink transactions from this goal
    db.query(Transaction).filter(Transaction.goal_id == goal_id).update({"goal_id": None})
    
    # If goal has balance, create refund transaction
    if db_goal.current_amount > 0:
        # Find a savings account to refund to
        from app.models.account import Account
        savings_account = db.query(Account).filter(
            Account.account_type == 'savings',
            Account.is_deleted == False
        ).first()
        
        if savings_account:
            # Create refund transaction
            refund_transaction = Transaction(
                description=f"Devolución de meta eliminada: {db_goal.name}",
                amount=db_goal.current_amount,
                transaction_type="income",
                payment_method="transfer",
                date=datetime.now(timezone.utc),
                account_id=savings_account.id,
                goal_id=None,
                is_deleted=False
            )
            db.add(refund_transaction)
            db.flush()
            
            # Apply to balance
            from app.services.transaction_service import apply_transaction_to_balance
            apply_transaction_to_balance(db, refund_transaction, reverse=False)
    
    # Soft delete the goal
    db_goal.is_deleted = cast(Any, True)
    db.commit()
    return {"message": "Goal deleted successfully"}


@router.post("/recalculate-progress")
def recalculate_all_goals_progress(db: Session = Depends(get_db)):
    """Recalcula el progreso de todas las metas basado en las transacciones asignadas"""
    goals = db.query(Goal).filter(Goal.is_deleted == False).all()
    for goal in goals:
        recalculate_goal_progress(cast(str, goal.id), db)
    return {"message": f"Recalculated progress for {len(goals)} goals"}
