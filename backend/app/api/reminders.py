from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from app.api.crud_factory import make_crud_router
from app.models.reminder import Reminder, ReminderFrequency, ReminderStatus
from pydantic import BaseModel, field_serializer
from datetime import datetime, date


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


def _reject_past_due_date(payload: ReminderBase | ReminderUpdate, db: Session) -> None:
    if payload.due_date and payload.due_date.date() < date.today():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")


def _reject_past_due_date_on_update(_existing: Reminder, payload: ReminderUpdate, db: Session) -> None:
    _reject_past_due_date(payload, db)


router: APIRouter = make_crud_router(
    prefix="/reminders",
    tags=["reminders"],
    model=Reminder,
    create_schema=ReminderCreate,
    update_schema=ReminderUpdate,
    response_schema=ReminderResponse,
    entity_name="Reminder",
    pre_create=_reject_past_due_date,
    pre_update=_reject_past_due_date_on_update,
)
