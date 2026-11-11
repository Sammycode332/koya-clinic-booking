# Koya Clinic Appointment Booking System

A full-stack clinic appointment booking system featuring a FastAPI backend and a React + Vite + Tailwind CSS frontend. Built to fulfill the technical specification of the Koya Academy assessment.

---

## 🌟 Features by Level

- **Level 1: Core Slot & Booking Flow**
  - `POST /reset`: Resets all bookings and replaces all slots (including past dates).
  - `GET /slots`: Lists available/booked slots ordered earliest `start` first. Optional `provider` query filter.
  - `POST /bookings`: Reserves an appointment slot and returns `201 Created` with booking details.
  - `GET /bookings/{id}`: Retrieves booking details by ID (`404` if not found).

- **Level 2: Authentication & Input Validation**
  - Secured via `X-API-Key` header on all endpoints (`401` on missing or invalid key).
  - Validates required fields (`slot_id`, `name`, `email`); whitespace is trimmed, email is stored in lowercase (`400` on failure).
  - Rejects slots in the past (`400`) and missing slots (`404`).
  - Strict JSON error responses formatted as `{"error": "<message>"}`.

- **Level 3: Concurrency Control & Cancellations**
  - Database row-level locking (`SELECT ... FOR UPDATE`) prevents double bookings under high concurrency (`409 Conflict`).
  - `DELETE /bookings/{id}`: Cancels a booking, updates status to `cancelled`, and frees the slot.
  - Rejects attempts to cancel already cancelled bookings (`409`).

- **Level 4: Idempotency & Cursor-Based Pagination**
  - `Idempotency-Key` header on `POST /bookings`:
    - Retrying with identical payload safely returns the existing booking.
    - Reusing the key with a different payload returns `422 Unprocessable Entity`.
  - `GET /bookings`: Retrieves patient bookings by email sorted oldest first (`created_at ASC, id ASC`).
  - Cursor-based pagination (`limit`, `cursor`, `next_cursor`).

- **Level 5: Anti-Spam Rate Limiting**
  - Limits booking attempts to a maximum of 5 attempts per email per minute.
  - Concurrent requests for the same email are serialized with PostgreSQL transaction advisory locks.
  - Returns `429 Too Many Requests` with a standard `Retry-After: <seconds>` header.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0, PostgreSQL (Supabase), Uvicorn, Pytest.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4.

---

## 🚀 Running Locally

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Running Tests

The test suite tests all 5 levels against the live database:
```bash
cd backend
pytest test_api_levels.py -v
```

---

## 🌐 Deployment Guide

### Backend (Render / Railway)
- **Environment**: Python
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `DATABASE_URL`: Your PostgreSQL connection string.
  - `API_KEY`: Your secret API key.

### Frontend (Vercel / Render Static Site)
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: Your backend URL (e.g., `https://koya-clinic-api.onrender.com`).
  - `VITE_API_KEY`: Your secret API key.
