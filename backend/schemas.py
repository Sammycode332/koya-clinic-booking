from datetime import datetime

from pydantic import BaseModel


class SlotInput(BaseModel):
    id: str
    provider: str
    start: datetime
    end: datetime


class ResetRequest(BaseModel):
    slots: list[SlotInput]

class SlotResponse(BaseModel):
    id: str
    provider: str
    start: datetime
    end: datetime
    available: bool
class SlotsResponse(BaseModel):
    slots: list[SlotResponse] 
class BookingResponse(BaseModel):
    id: str
    slot_id: str
    name: str
    email: str
    status: str
    created_at: datetime
class BookingsResponse(BaseModel):
    bookings: list[BookingResponse]
    next_cursor: str | None = None
class BookingRequest(BaseModel):
    slot_id: str | None = None
    name: str | None = None
    email: str | None = None