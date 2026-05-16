from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from app.api.auth import get_current_device
from app.models.reminder import Reminder, ReminderFrequency, ReminderStatus
from pydantic import BaseModel, field_serializer
from datetime import datetime, date


router = APIRouter(
    prefix="/reminders", 
    tags=["reminders"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class ReminderBase(BaseModel):
    name: str
    amount: int | None = None
    due_date: datetime
    frequency: ReminderFrequency = ReminderFrequency.ONCE
    status: ReminderStatus = ReminderStatus.PENDING
    description: str | None = None
    category_id: str | None = None
    is_active: bool = True


class ReminderCreate(ReminderBase):
    pass


class ReminderUpdate(BaseModel):
    name: str | None = None
    amount: int | None = None
    due_date: datetime | None = None
    frequency: ReminderFrequency | None = None
    status: ReminderStatus | None = None
    description: str | None = None
    category_id: str | None = None
    is_active: bool | None = None


class ReminderResponse(ReminderBase):
    id: str
    created_at: datetime
    updated_at: datetime
    version: int  # FASE 7: OCC versioning
    
    @field_serializer('created_at', 'updated_at', when_used='json')
    def serialize_datetime(self, dt: datetime | None):
        if dt is None:
            return None
        return dt.isoformat()
    
    class Config:
        from_attributes = True


@router.post("/", response_model=ReminderResponse)
def create_reminder(reminder: ReminderCreate, db: Session = Depends(get_db)):
    if reminder.due_date.date() < date.today():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
    db_reminder = Reminder(**reminder.model_dump())
    db.add(db_reminder)
    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.get("/")
def get_reminders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Reminder).filter(Reminder.is_deleted == False).offset(skip).limit(limit).all()


@router.get("/{reminder_id}")
def get_reminder(reminder_id: str, db: Session = Depends(get_db)):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.put("/{reminder_id}")
def update_reminder(reminder_id: str, reminder: ReminderUpdate, db: Session = Depends(get_db)):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.due_date and reminder.due_date.date() < date.today():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
    for key, value in reminder.model_dump(exclude_unset=True).items():
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
