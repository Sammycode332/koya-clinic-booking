from fastapi import FastAPI,Query
from sqlalchemy import delete

from database import SessionLocal
from models import Slot
from schemas import ResetRequest,SlotResponse

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