import os
import secrets
import base64
from datetime import datetime, timezone, timedelta
from math import ceil

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, status, Depends, Header, Security, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, and_, or_, func, text
from email_validator import validate_email, EmailNotValidError
from contextlib import asynccontextmanager

from database import SessionLocal, Base, engine
from models import Slot, Booking, BookingAttempt
from schemas import (
    ResetRequest,
    SlotResponse,
    SlotsResponse,
    BookingResponse,
    BookingsResponse,
    BookingRequest,
)

load_dotenv()

API_KEY = os.getenv("API_KEY")

if not API_KEY:
    raise RuntimeError("API_KEY is not configured")

api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False
)

def verify_api_key(
    request: Request,
    x_api_key: str | None = Security(api_key_header)
):
    # Allow public root and health check for URL ping and status verification
    if request.url.path in ["/", "/health"]:
        return None

    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key"
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Clinic Booking API",
    dependencies=[Depends(verify_api_key)],
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, (dict, list)):
        import json
        detail = json.dumps(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(detail)},
        headers=exc.headers
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        first_error = errors[0]
        msg = first_error.get("msg", "Invalid request")
        field = first_error.get("loc", [""])[-1]
        error_msg = f"{field}: {msg}" if field and field != "body" else msg
    else:
        error_msg = "Invalid request payload or parameters"

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": error_msg}
    )

@app.get("/")
def home():
    return {"message": "Clinic Booking API is running", "status": "healthy"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/reset")
def reset_slots(payload: ResetRequest):
    with SessionLocal.begin() as session:
        session.execute(delete(BookingAttempt))
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

    return {"message": "Done"}

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

def enforce_booking_rate_limit(email: str):
    retry_after = None

    with SessionLocal.begin() as session:
        # PostgreSQL transaction advisory lock serializes checks for the same email
        if session.bind and session.bind.dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:email)::bigint)"),
                {"email": email}
            )

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=1)

        attempts = session.query(BookingAttempt).filter(
            BookingAttempt.email == email,
            BookingAttempt.attempted_at > window_start
        ).order_by(
            BookingAttempt.attempted_at.asc()
        ).all()

        if len(attempts) >= 5:
            oldest_attempt = attempts[0].attempted_at
            if oldest_attempt.tzinfo is None:
                oldest_attempt = oldest_attempt.replace(tzinfo=timezone.utc)

            retry_after = max(
                1,
                ceil((oldest_attempt + timedelta(minutes=1) - now).total_seconds())
            )
        else:
            session.add(BookingAttempt(email=email))

    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many booking attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)}
        )

@app.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED
)
def create_booking(
    payload: BookingRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")
):
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

    if idempotency_key:
        idempotency_key = idempotency_key.strip() or None

    # Check for existing idempotent request first
    if idempotency_key:
        with SessionLocal() as session:
            existing = session.query(Booking).filter(
                Booking.idempotency_key == idempotency_key
            ).first()

            if existing:
                if (
                    existing.slot_id != slot_id
                    or existing.name != name
                    or existing.email != email
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Idempotency key was already used with a different request"
                    )
                return existing

    enforce_booking_rate_limit(email)

    with SessionLocal.begin() as session:
        # Double check inside transaction if idempotency key was committed concurrently
        if idempotency_key:
            existing_request = session.query(Booking).filter(
                Booking.idempotency_key == idempotency_key
            ).first()

            if existing_request:
                if (
                    existing_request.slot_id != slot_id
                    or existing_request.name != name
                    or existing_request.email != email
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Idempotency key was already used with a different request"
                    )
                return existing_request

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
            email=email,
            idempotency_key=idempotency_key
        )

        session.add(booking)
        session.flush()

    return booking

@app.get("/bookings", response_model=BookingsResponse)
def get_bookings(
    email: str | None = Query(default=None),
    limit: int = Query(default=10),
    cursor: str | None = Query(default=None)
):
    if not email or not email.strip():
        raise HTTPException(
            status_code=400,
            detail="Email is required"
        )

    if limit < 1 or limit > 50:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 50"
        )

    email = email.strip().lower()

    cursor_created_at = None
    cursor_id = None

    if cursor:
        try:
            decoded_cursor = base64.urlsafe_b64decode(
                cursor + "=" * (-len(cursor) % 4)
            ).decode()

            timestamp, cursor_id = decoded_cursor.split("|", 1)
            cursor_created_at = datetime.fromisoformat(timestamp)

        except (ValueError, UnicodeDecodeError):
            raise HTTPException(
                status_code=400,
                detail="Invalid cursor"
            )

    with SessionLocal() as session:
        query = session.query(Booking).filter(
            func.lower(Booking.email) == email
        )

        if cursor_created_at and cursor_id:
            query = query.filter(
                or_(
                    Booking.created_at > cursor_created_at,
                    and_(
                        Booking.created_at == cursor_created_at,
                        Booking.id > cursor_id
                    )
                )
            )

        results = query.order_by(
            Booking.created_at.asc(),
            Booking.id.asc()
        ).limit(limit + 1).all()

        has_next_page = len(results) > limit
        bookings = results[:limit]

        next_cursor = None

        if has_next_page:
            last_booking = bookings[-1]

            cursor_value = (
                f"{last_booking.created_at.isoformat()}|{last_booking.id}"
            )

            next_cursor = base64.urlsafe_b64encode(
                cursor_value.encode()
            ).decode().rstrip("=")

        return {
            "bookings": bookings,
            "next_cursor": next_cursor
        }
