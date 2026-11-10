from fastapi import FastAPI,Query,HTTPException,status
from sqlalchemy import delete

from database import SessionLocal
from models import Slot,Booking
from schemas import ResetRequest,SlotResponse,BookingResponse,BookingRequest
app = FastAPI(title="Clinic Booking API")


@app.get("/")
def home():
    return {"message": "Clinic Booking API is running"}


@app.post("/reset")
def reset_slots(payload: ResetRequest):
    with SessionLocal.begin() as session:
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
@app.get("/slots", response_model=list[SlotResponse])
def get_slots(provider: str | None = Query(default=None)):
    with SessionLocal() as session:
        query = session.query(Slot)

        if provider is not None:
            query = query.filter(Slot.provider == provider)

        slots = query.order_by(Slot.start.asc()).all()

        return [
            SlotResponse(
                id=slot.id,
                provider=slot.provider,
                start=slot.start,
                end=slot.end,
                available=not slot.is_booked
            )
            for slot in slots
        ]
@app.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED
)
def create_booking(payload: BookingRequest):
    with SessionLocal.begin() as session:
        slot = session.get(Slot, payload.slot_id)

        if slot is None:
            raise HTTPException(
                status_code=404,
                detail="Slot not found"
            )

        booking = Booking(
            slot_id=payload.slot_id,
            name=payload.name,
            email=payload.email
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