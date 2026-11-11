# 🏥 Koya Clinic — Patient Appointment Booking System

A full-stack, production-ready clinic appointment booking web application and RESTful API built for the Koya Academy technical assessment.

---

## 🚀 Live Demo & Repository

- **Web Application**: Available on Vercel / Render Static Site
- **API Base URL**: `https://<your-render-service>.onrender.com`
- **GitHub Repository**: [https://github.com/Sammycode332/koya-clinic-booking](https://github.com/Sammycode332/koya-clinic-booking)
- **API Documentation & Technical Spec**: Conforms strictly to [koyaacademy.com/assessment-api](https://koyaacademy.com/assessment-api)

---

## 🌟 Feature Breakdown by Assessment Level

### Level 1: Core Appointment Flow
- `POST /reset`: Resets all bookings and seeds slot inventory with doctors across multiple specialties (Cardiology, Pediatrics, General Practice, Dermatology).
- `GET /slots`: Lists available and booked slots in chronological order (`ORDER BY start ASC`), with exact match `provider` query filtering.
- `POST /bookings`: Creates an appointment reservation and returns `201 Created` with booking details and confirmed status.
- `GET /bookings/{id}`: Retrieves appointment record by ID (`404` if not found).

### Level 2: Security & Input Validation
- **Authentication**: `X-API-Key` required on all routes. Missing or invalid keys return `401 Unauthorized` with `{"error": "Invalid or missing API key"}`.
- **Strict Error Schema**: All error responses return standard `{"error": "<message>"}` (FastAPI validation errors converted automatically).
- **Validation Rules**:
  - Missing or blank `slot_id`, `name`, or `email` returns `400 Bad Request`.
  - Malformed email returns `400 Bad Request`.
  - Name and email are trimmed of surrounding whitespace; emails are normalized to lowercase.
  - Non-existent slots return `404 Not Found`.
  - Slots with a start time in the past return `400 Bad Request` (`"This appointment has already started"`).

### Level 3: Concurrency Protection & Cancellations
- **Zero Double-Bookings**: PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) serialize concurrent booking attempts on the same slot, ensuring only one succeeds. Subsequent simultaneous attempts return `409 Conflict` (`"This slot is already booked"`).
- `DELETE /bookings/{id}`: Cancels a confirmed booking, sets `status: "cancelled"`, and immediately frees the slot.
- Cancelling an already cancelled booking returns `409 Conflict`.

### Level 4: Idempotency & History Cursor Pagination
- **Idempotent Bookings**: Supports `Idempotency-Key` header on `POST /bookings`.
  - Retried requests with an identical payload safely return the existing booking.
  - Reusing the key with altered payload returns `422 Unprocessable Entity`.
- `GET /bookings`: Retrieves patient booking history by email (case-insensitive) ordered oldest first (`created_at ASC, id ASC`).
- Supports cursor pagination via `limit` (1–50, default 10), `cursor`, and returns `next_cursor` (or `null` on the last page).

### Level 5: Anti-Spam Rate Limiting
- Prevents booking spam by enforcing a ceiling of **5 booking attempts per email per minute**.
- Serialized per-email checks using PostgreSQL advisory transactions locks (`pg_advisory_xact_lock`).
- Requests exceeding the threshold return `429 Too Many Requests` accompanied by an HTTP `Retry-After: <seconds>` header.

---

## 🩺 Frontend Web Application

A clean, clinic-grade patient interface built with React 19, TypeScript, and Tailwind CSS v4:
1. **Interactive Appointment Booking**:
   - Filter slots by medical specialist (Dr. Chioma Okafor, Dr. Ibrahim Musa, Dr. Fatima Bello, etc.).
   - Toggle to view only available slots.
   - Clean doctor cards showing initials, specialty, date, and appointment window.
   - Form with client-side UUID idempotency keys.
   - Instant digital appointment voucher with Booking ID.
2. **Booking Lookup & Cancellation**:
   - Look up booking status using the unique Booking ID.
   - One-click cancellation with real-time slot release.
3. **Patient History & Pagination**:
   - Search booking history by registered email.
   - Cursor-based pagination ("Load More Records").

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0 (ORM), PostgreSQL (Supabase pooler), Uvicorn, Pytest.
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4.
- **Testing**: Pytest with HTTPX TestClient covering all 5 levels.

---

## 🧪 Automated Test Suite

Run the full 12-test suite against the live database:
```bash
cd backend
# With virtual environment activated:
pytest test_api_levels.py -v
```

---

## 🚀 Deployment Instructions

### Backend (Render)
1. New Web Service from GitHub repo (`koya-clinic-booking`).
2. **Root Directory**: `backend`
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables**:
   - `DATABASE_URL`: Your Supabase connection string.
   - `API_KEY`: Your secret API key.

### Frontend (Vercel)
1. New Project on Vercel from GitHub repo (`koya-clinic-booking`).
2. **Root Directory**: `frontend`
3. **Framework**: Vite
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. **Environment Variables**:
   - `VITE_API_URL`: `https://<your-render-service>.onrender.com`
   - `VITE_API_KEY`: `your api key here
   `
