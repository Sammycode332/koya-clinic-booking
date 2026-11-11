import os
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from main import app, API_KEY
from database import SessionLocal
from models import Slot, Booking, BookingAttempt

client = TestClient(app)
HEADERS = {"X-API-Key": API_KEY}

@pytest.fixture(autouse=True)
def setup_slots():
    # Clean up and seed fresh test slots
    future_start_1 = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    future_end_1 = (datetime.now(timezone.utc) + timedelta(days=1, minutes=30)).isoformat()
    future_start_2 = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    future_end_2 = (datetime.now(timezone.utc) + timedelta(days=2, minutes=30)).isoformat()
    past_start = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    past_end = (datetime.now(timezone.utc) - timedelta(days=1, minutes=-30)).isoformat()

    reset_payload = {
        "slots": [
            {"id": "slot-test-1", "provider": "Dr Ade", "start": future_start_1, "end": future_end_1},
            {"id": "slot-test-2", "provider": "Dr Bola", "start": future_start_2, "end": future_end_2},
            {"id": "slot-past", "provider": "Dr Ade", "start": past_start, "end": past_end},
        ]
    }
    res = client.post("/reset", json=reset_payload, headers=HEADERS)
    assert res.status_code == 200

# ================= LEVEL 1 TESTS =================
def test_level_1_list_slots():
    res = client.get("/slots", headers=HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert "slots" in data
    assert len(data["slots"]) == 3
    # Earliest start first
    assert data["slots"][0]["id"] == "slot-past"

def test_level_1_filter_by_provider():
    res = client.get("/slots?provider=Dr Bola", headers=HEADERS)
    assert res.status_code == 200
    slots = res.json()["slots"]
    assert len(slots) == 1
    assert slots[0]["provider"] == "Dr Bola"

def test_level_1_book_and_lookup():
    res = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "Ada Obi", "email": "ada@example.com"},
        headers=HEADERS,
    )
    assert res.status_code == 201
    booking = res.json()
    assert booking["status"] == "confirmed"
    assert booking["slot_id"] == "slot-test-1"
    booking_id = booking["id"]

    # Look up booking
    res_get = client.get(f"/bookings/{booking_id}", headers=HEADERS)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == booking_id

# ================= LEVEL 2 TESTS =================
def test_level_2_missing_or_invalid_api_key():
    # Missing API Key
    res1 = client.get("/slots")
    assert res1.status_code == 401
    assert "error" in res1.json()

    # Invalid API Key
    res2 = client.get("/slots", headers={"X-API-Key": "wrong-key"})
    assert res2.status_code == 401
    assert "error" in res2.json()

def test_level_2_missing_required_fields():
    # Missing slot_id
    res = client.post(
        "/bookings",
        json={"name": "Ada", "email": "ada@example.com"},
        headers=HEADERS,
    )
    assert res.status_code == 400
    assert "error" in res.json()

    # Empty name
    res = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "   ", "email": "ada@example.com"},
        headers=HEADERS,
    )
    assert res.status_code == 400
    assert "error" in res.json()

    # Invalid email
    res = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "Ada", "email": "invalid-email"},
        headers=HEADERS,
    )
    assert res.status_code == 400
    assert "error" in res.json()

def test_level_2_nonexistent_or_past_slot():
    # Slot not found
    res = client.post(
        "/bookings",
        json={"slot_id": "nonexistent-slot", "name": "Ada", "email": "ada@example.com"},
        headers=HEADERS,
    )
    assert res.status_code == 404
    assert "error" in res.json()

    # Slot already started (past slot)
    res_past = client.post(
        "/bookings",
        json={"slot_id": "slot-past", "name": "Ada", "email": "ada@example.com"},
        headers=HEADERS,
    )
    assert res_past.status_code == 400
    assert "error" in res_past.json()

def test_level_2_trim_and_lowercase():
    res = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "  Ada Obi  ", "email": "  ADA@Example.COM  "},
        headers=HEADERS,
    )
    assert res.status_code == 201
    booking = res.json()
    assert booking["name"] == "Ada Obi"
    assert booking["email"] == "ada@example.com"

# ================= LEVEL 3 TESTS =================
def test_level_3_cannot_double_book():
    res1 = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "Person 1", "email": "p1@example.com"},
        headers=HEADERS,
    )
    assert res1.status_code == 201

    # Second person attempts to book same slot
    res2 = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "Person 2", "email": "p2@example.com"},
        headers=HEADERS,
    )
    assert res2.status_code == 409
    assert "error" in res2.json()

def test_level_3_cancel_booking_and_rebook():
    res = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "Ada", "email": "ada@example.com"},
        headers=HEADERS,
    )
    booking_id = res.json()["id"]

    # Cancel booking
    del_res = client.delete(f"/bookings/{booking_id}", headers=HEADERS)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "cancelled"

    # Cancelling again returns 409
    del_again = client.delete(f"/bookings/{booking_id}", headers=HEADERS)
    assert del_again.status_code == 409
    assert "error" in del_again.json()

    # Slot is now available to be booked again
    rebook = client.post(
        "/bookings",
        json={"slot_id": "slot-test-1", "name": "New Person", "email": "new@example.com"},
        headers=HEADERS,
    )
    assert rebook.status_code == 201

# ================= LEVEL 4 TESTS =================
def test_level_4_idempotency():
    idem_key = str(uuid.uuid4())
    payload = {"slot_id": "slot-test-1", "name": "Ada", "email": "ada@example.com"}

    # First request
    res1 = client.post("/bookings", json=payload, headers={**HEADERS, "Idempotency-Key": idem_key})
    assert res1.status_code == 201
    booking1 = res1.json()

    # Retry with same key and same payload returns existing booking
    res2 = client.post("/bookings", json=payload, headers={**HEADERS, "Idempotency-Key": idem_key})
    assert res2.status_code in (200, 201)
    booking2 = res2.json()
    assert booking1["id"] == booking2["id"]

    # Retry with same key but different body returns 422
    different_payload = {"slot_id": "slot-test-2", "name": "Ada", "email": "ada@example.com"}
    res3 = client.post("/bookings", json=different_payload, headers={**HEADERS, "Idempotency-Key": idem_key})
    assert res3.status_code == 422
    assert "error" in res3.json()

def test_level_4_cursor_pagination():
    email = "history@example.com"
    # Seed multiple slots and bookings
    future_start_base = datetime.now(timezone.utc) + timedelta(days=10)
    slots = []
    for i in range(5):
        st = (future_start_base + timedelta(hours=i)).isoformat()
        et = (future_start_base + timedelta(hours=i, minutes=30)).isoformat()
        slots.append({"id": f"page-slot-{i}", "provider": "Dr Ade", "start": st, "end": et})
    client.post("/reset", json={"slots": slots}, headers=HEADERS)

    for i in range(5):
        client.post(
            "/bookings",
            json={"slot_id": f"page-slot-{i}", "name": "Ada", "email": email},
            headers=HEADERS,
        )

    # Page 1 with limit=2
    res_p1 = client.get(f"/bookings?email={email}&limit=2", headers=HEADERS)
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert len(data_p1["bookings"]) == 2
    assert data_p1["next_cursor"] is not None

    # Page 2
    cursor = data_p1["next_cursor"]
    res_p2 = client.get(f"/bookings?email={email}&limit=2&cursor={cursor}", headers=HEADERS)
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()
    assert len(data_p2["bookings"]) == 2
    assert data_p2["next_cursor"] is not None

    # Page 3 (final)
    cursor2 = data_p2["next_cursor"]
    res_p3 = client.get(f"/bookings?email={email}&limit=2&cursor={cursor2}", headers=HEADERS)
    assert res_p3.status_code == 200
    data_p3 = res_p3.json()
    assert len(data_p3["bookings"]) == 1
    assert data_p3["next_cursor"] is None

# ================= LEVEL 5 TESTS =================
def test_level_5_rate_limiting():
    spam_email = "spammer@example.com"
    future_start_base = datetime.now(timezone.utc) + timedelta(days=20)
    slots = []
    for i in range(10):
        st = (future_start_base + timedelta(hours=i)).isoformat()
        et = (future_start_base + timedelta(hours=i, minutes=30)).isoformat()
        slots.append({"id": f"spam-slot-{i}", "provider": "Dr Ade", "start": st, "end": et})
    client.post("/reset", json={"slots": slots}, headers=HEADERS)

    # Send 5 requests (allowed)
    for i in range(5):
        res = client.post(
            "/bookings",
            json={"slot_id": f"spam-slot-{i}", "name": "Spam User", "email": spam_email},
            headers=HEADERS,
        )
        assert res.status_code == 201

    # 6th request should trigger 429
    res_blocked = client.post(
        "/bookings",
        json={"slot_id": "spam-slot-5", "name": "Spam User", "email": spam_email},
        headers=HEADERS,
    )
    assert res_blocked.status_code == 429
    assert "error" in res_blocked.json()
    assert "Retry-After" in res_blocked.headers
    retry_after = int(res_blocked.headers["Retry-After"])
    assert retry_after > 0
