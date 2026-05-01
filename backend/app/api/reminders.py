from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from app.models.reminder import Reminder, ReminderFrequency, ReminderStatus
from pydantic import BaseModel
from datetime import datetime, date


router = APIRouter(prefix="/reminders", tags=["reminders"], redirect_slashes=False)


class ReminderBase(BaseModel):
    name: str
    amount: int = None
    due_date: datetime
    frequency: ReminderFrequency = ReminderFrequency.ONCE
    status: ReminderStatus = ReminderStatus.PENDING
    description: str = None
    category_id: str = None
    is_active: bool = True


class ReminderCreate(ReminderBase):
    pass


class ReminderUpdate(BaseModel):
    name: str = None
    amount: int = None
    due_date: datetime = None
    frequency: ReminderFrequency = None
    status: ReminderStatus = None
    description: str = None
    category_id: str = None
    is_active: bool = None


class ReminderResponse(ReminderBase):
    id: str
    created_at: str
    updated_at: str
    version: int  # FASE 7: OCC versioning
    class Config:
        from_attributes = True


@router.post("/", response_model=ReminderResponse)
def create_reminder(reminder: ReminderCreate, db: Session = Depends(get_db)):
    if reminder.due_date.date() < date.today():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
    db_reminder = Reminder(**reminder.dict())
    db.add(db_reminder)
    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.get("/", response_model=List[ReminderResponse])
def get_reminders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Reminder).offset(skip).limit(limit).all()


@router.get("/{reminder_id}", response_model=ReminderResponse)
def get_reminder(reminder_id: str, db: Session = Depends(get_db)):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.put("/{reminder_id}", response_model=ReminderResponse)
def update_reminder(reminder_id: str, reminder: ReminderUpdate, db: Session = Depends(get_db)):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.due_date and reminder.due_date.date() < date.today():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
    for key, value in reminder.dict(exclude_unset=True).items():
        setattr(db_reminder, key, value)
    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: str, db: Session = Depends(get_db)):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(db_reminder)
    db.commit()
    return {"message": "Reminder deleted successfully"}
