from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, lazyload
from typing import List, Optional
from datetime import datetime, timezone
import calendar
from database import get_db
from app.models.budget import Budget
from app.services.budget_service import enrich_budget_response
from app.services.budget_automation import generate_recurring_budgets, update_recurring_budgets
from pydantic import BaseModel

router = APIRouter(prefix="/budgets", tags=["budgets"], redirect_slashes=False)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class BudgetBase(BaseModel):
    name: str
    amount: int
    spent: int = 0
    month: int
    year: int
    category_id: Optional[str] = None


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    spent: Optional[int] = None
    month: Optional[int] = None
    year: Optional[int] = None
    category_id: Optional[str] = None


class GenerateRecurringBudgetsRequest(BaseModel):
    month: int
    year: int
    delete_previous: bool = True
    budget_items: Optional[List[dict]] = None


class BudgetResponse(BaseModel):
    """Full budget response including server-computed pacing fields."""
    id: str
    name: str
    amount: int
    spent: int
    month: int
    year: int
    category_id: Optional[str] = None
    # Pacing fields — computed by backend, never sent by client
    month_progress_percentage: float = 0.0
    expected_spend: int = 0
    is_over_pacing: bool = False
    pacing_status: str = "on_track"
    remaining: int = 0
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/", response_model=BudgetResponse)
def create_budget(budget: BudgetCreate, db: Session = Depends(get_db)):
    db_budget = Budget(**budget.dict())
    db.add(db_budget)
    db.commit()
    db.refresh(db_budget)
    return enrich_budget_response(db_budget)


@router.get("/", response_model=List[BudgetResponse])
def get_budgets(
    skip: int = 0,
    limit: int = 100,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Get budgets with server-computed pacing data.

    Optional filters:
    - month/year: filter to a specific period
    """
    try:
        query = db.query(Budget)
        if month is not None:
            query = query.filter(Budget.month == month)
        if year is not None:
            query = query.filter(Budget.year == year)

        budgets = query.offset(skip).limit(limit).all()

        now = datetime.now(timezone.utc)
        return [enrich_budget_response(b, now) for b in budgets]

    except Exception as e:
        import traceback
        print(f"ERROR in budgets endpoint: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching budgets: {str(e)}")


@router.get("/{budget_id}", response_model=BudgetResponse)
def get_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return enrich_budget_response(budget)


@router.put("/{budget_id}", response_model=BudgetResponse)
def update_budget(budget_id: int, budget: BudgetUpdate, db: Session = Depends(get_db)):
    db_budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not db_budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    update_data = budget.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_budget, key, value)

    db.commit()
    db.refresh(db_budget)
    return enrich_budget_response(db_budget)


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    db_budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not db_budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    db.delete(db_budget)
    db.commit()
    return {"message": "Budget deleted successfully"}


# FASE 4: Generate recurring budgets endpoint
@router.post("/generate-recurring", response_model=List[BudgetResponse])
def generate_recurring_budgets_endpoint(
    request: GenerateRecurringBudgetsRequest,
    db: Session = Depends(get_db)
):
    """
    Generate recurring budgets for a specific month and year.
    
    Args:
        request: GenerateRecurringBudgetsRequest with month, year, delete_previous, and optional budget_items
        
    Returns:
        List of created BudgetResponse objects
        
    Raises:
        HTTPException 400: If month/year is invalid or budgets already exist
    """
    try:
        budgets = generate_recurring_budgets(
            db=db,
            month=request.month,
            year=request.year,
            delete_previous=request.delete_previous,
            budget_items=request.budget_items
        )
        
        now = datetime.now(timezone.utc)
        return [enrich_budget_response(b, now) for b in budgets]
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recurring budgets: {str(e)}")


@router.put("/update-recurring", response_model=List[BudgetResponse])
def update_recurring_budgets_endpoint(
    request: GenerateRecurringBudgetsRequest,
    db: Session = Depends(get_db)
):
    """
    Update existing recurring budgets for a specific month and year.
    Creates new budgets if they don't exist.
    
    Args:
        request: GenerateRecurringBudgetsRequest with month, year, and optional budget_items
        
    Returns:
        List of created/updated BudgetResponse objects
        
    Raises:
        HTTPException 400: If month/year is invalid
    """
    try:
        budgets = update_recurring_budgets(
            db=db,
            month=request.month,
            year=request.year,
            budget_items=request.budget_items
        )
        
        now = datetime.now(timezone.utc)
        return [enrich_budget_response(b, now) for b in budgets]
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating recurring budgets: {str(e)}")
