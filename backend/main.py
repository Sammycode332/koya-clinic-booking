from fastapi import FastAPI
from sqlalchemy import delete

from database import SessionLocal
from models import Slot
from schemas import ResetRequest

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