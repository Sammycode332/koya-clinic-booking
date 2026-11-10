import os
import secrets

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, status, Depends, Header,Security,Request
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from sqlalchemy import delete,select
from email_validator import validate_email, EmailNotValidError
from database import SessionLocal
from models import Slot, Booking
from schemas import ResetRequest, SlotResponse, BookingResponse, BookingRequest,SlotsResponse
from datetime import datetime, timezone

load_dotenv()

API_KEY = os.getenv("API_KEY")

if not API_KEY:
    raise RuntimeError("API_KEY is not configured")

api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False
)
def verify_api_key(
    x_api_key: str | None = Security(api_key_header)
):
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key"
        )
app = FastAPI(
    title="Clinic Booking API",
    dependencies=[Depends(verify_api_key)]
)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers=exc.headers
    )

@app.get("/")
def home():
    return {"message": "Clinic Booking API is running"}


@app.post("/reset")
def reset_slots(payload: ResetRequest):
    with SessionLocal.begin() as session:
        session.execute(delete(Booking))
        session.execute(delete(Slot))

        new_slots = [
            Slot(
                id=slot.id,
                provider=slot.provider,
                start=slot.start,
                end=slot.end
            )
            for slot in payload.slots
        ]

        session.add_all(new_slots)

    return "Done"
@app.get("/slots", response_model=SlotsResponse)
def get_slots(provider: str | None = Query(default=None)):
    with SessionLocal() as session:
        query = session.query(Slot)

        if provider:
            query = query.filter(Slot.provider == provider)

        slots = query.order_by(Slot.start.asc()).all()

        return {
            "slots": [
                {
                    "id": slot.id,
                    "provider": slot.provider,
                    "start": slot.start,
                    "end": slot.end,
                    "available": not slot.is_booked
                }
                for slot in slots
            ]
        }
@app.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED
)
def create_booking(payload: BookingRequest):
    if not payload.slot_id or not payload.slot_id.strip():
        raise HTTPException(status_code=400, detail="Slot ID is required")

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    if not payload.email or not payload.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")

    slot_id = payload.slot_id.strip()
    name = payload.name.strip()
    email = payload.email.strip().lower()

    try:
        validated_email = validate_email(
            email,
            check_deliverability=False
        )
        email = validated_email.normalized.lower()
    except EmailNotValidError:
        raise HTTPException(
            status_code=400,
            detail="Invalid email address"
        )

    with SessionLocal.begin() as session:
        slot = session.execute(
            select(Slot)
            .where(Slot.id == slot_id)
            .with_for_update()
        ).scalar_one_or_none()

        if slot is None:
            raise HTTPException(status_code=404, detail="Slot not found")

        now = datetime.now(timezone.utc)
        slot_start = slot.start

        if slot_start.tzinfo is None:
            slot_start = slot_start.replace(tzinfo=timezone.utc)

        if slot_start <= now:
            raise HTTPException(
                status_code=400,
                detail="This appointment has already started"
            )

        existing_booking = session.query(Booking).filter(
            Booking.slot_id == slot_id,
            Booking.status == "confirmed"
        ).first()

        if slot.is_booked or existing_booking:
            raise HTTPException(
                status_code=409,
                detail="This slot is already booked"
            )

        slot.is_booked = True

        booking = Booking(
            slot_id=slot_id,
            name=name,
            email=email
        )

        session.add(booking)
        session.flush()

    return booking
@app.get("/bookings/{id}", response_model=BookingResponse)
def get_booking(id: str):
    with SessionLocal() as session:
        booking = session.get(Booking, id)

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found"
            )

        return booking
    
@app.delete("/bookings/{id}", response_model=BookingResponse)
def cancel_booking(id: str):
    with SessionLocal.begin() as session:
        booking = session.get(Booking, id)

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found"
            )

        if booking.status == "cancelled":
            raise HTTPException(
                status_code=409,
                detail="Booking has already been cancelled"
            )

        booking.status = "cancelled"

        slot = session.get(Slot, booking.slot_id)
        if slot:
            slot.is_booked = False

    return booking