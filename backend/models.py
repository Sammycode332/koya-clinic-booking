from datetime import datetime

from sqlalchemy import Boolean, DateTime, String,ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from uuid import uuid4



class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_booked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    
class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4())
    )

    slot_id: Mapped[str] = mapped_column(
        ForeignKey("slots.id"),
        nullable=False
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="confirmed",
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
class BookingAttempt(Base):
    __tablename__ = "booking_attempts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4())
    )

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    __table_args__ = (
        Index("ix_booking_attempts_email_time", "email", "attempted_at"),
    )