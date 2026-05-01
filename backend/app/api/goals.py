from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from app.models.goal import Goal, GoalStatus
from pydantic import BaseModel
from datetime import datetime


router = APIRouter(prefix="/goals", tags=["goals"], redirect_slashes=False)


class GoalBase(BaseModel):
    name: str
    target_amount: int
    current_amount: int = 0
    target_date: datetime = None
    status: GoalStatus = GoalStatus.ACTIVE
    description: str = None


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    name: str = None
    target_amount: int = None
    current_amount: int = None
    target_date: datetime = None
    status: GoalStatus = None
    description: str = None


class GoalResponse(GoalBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("/", response_model=GoalResponse)
def create_goal(goal: GoalCreate, db: Session = Depends(get_db)):
    db_goal = Goal(**goal.dict())
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.get("/", response_model=List[GoalResponse])
def get_goals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    goals = db.query(Goal).offset(skip).limit(limit).all()
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
    
    update_data = goal.dict(exclude_unset=True)
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
    
    db.delete(db_goal)
    db.commit()
    return {"message": "Goal deleted successfully"}
