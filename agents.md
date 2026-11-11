# Koya Clinic Booking API - Project Assessment & Specification

> **Local Reference Document** (Ignored by Git, not committed to repository)

---

## 1. Project Overview & Assessment Task

**Task**: Build a clinic appointment booking API and a responsive web application that consumes it:
- Patients can see available slots, book an appointment, and view confirmation.
- API and Web frontend must both be fully functional and deployed to accessible HTTPS URLs.
- Assessment technical specification: [koyaacademy.com/assessment-api](https://koyaacademy.com/assessment-api)

### Deliverables Required for Submission:
1. **API Base URL**: Public HTTPS URL (e.g. Render / Railway)
2. **API Key**: The secret key configured for `X-API-Key`
3. **Web Page URL**: Public HTTPS URL (e.g. Vercel / Render)
4. **GitHub Repo**: Public repository or invite `quadri40`
5. **Loom Video Link**: 5-minute or less video demonstrating the web app in action and walking through code.

---

## 2. Technical Specification & OpenAPI Rules

### Global Standards
- **Format**: All payloads and responses are strict JSON.
- **Error Response Standard**:
  ```json
  {
    "error": "<message>"
  }
  ```
  *(Crucial: Default framework `{"detail": ...}` must be converted to `{"error": ...}` for all exceptions including validation errors).*
- **Authentication**:
  - Header: `X-API-Key: <your_key>`
  - Required on **all** endpoints (including `/reset`, `/slots`, `/bookings`).
  - Missing or invalid key: **401 Unauthorized** `{"error": "Invalid or missing API key"}`.
- **Persistence**: PostgreSQL via Supabase/Neon/Render with SQLAlchemy. Data persists across requests.

---

## 3. Five-Level Requirements & Exact Endpoints

### Level 1: Core Slot & Booking Flow
- **`POST /reset`**:
  - Request Body: `{"slots": [{"id": "s1", "provider": "Dr Ade", "start": "2026-12-10T09:00:00Z", "end": "2026-12-10T09:30:00Z"}]}`
  - Action: Deletes all bookings and replaces all slots with provided list (including past slots).
  - Response: `200 OK`
- **`GET /slots`**:
  - Optional Query: `?provider=<provider_name>` (exact match filter)
  - Action: Returns all slots sorted with earliest `start` first (`ORDER BY start ASC`).
  - Response `200 OK`:
    ```json
    {
      "slots": [
        {
          "id": "s1",
          "provider": "Dr Ade",
          "start": "2026-12-10T09:00:00Z",
          "end": "2026-12-10T09:30:00Z",
          "available": true
        }
      ]
    }
    ```
    *(Note: `available` is `false` if the slot has a confirmed booking).*
- **`GET /bookings/{id}`**:
  - Path param: `id` (string)
  - Response `200 OK`: Booking object.
  - Response `404 Not Found`: `{"error": "Booking not found"}`

---

### Level 2: Authentication & Input Validation
- **`X-API-Key`**: Validated on every route; missing or wrong returns `401`.
- **`POST /bookings` Validation**:
  - Body: `{"slot_id": "...", "name": "...", "email": "..."}`
  - Missing or empty `slot_id`, `name`, or `email` returns **400 Bad Request**.
  - Invalid email returns **400 Bad Request**.
  - `name` and `email` must be trimmed of surrounding whitespace.
  - `email` must be stored and matched in lowercase.
  - Slot does not exist returns **404 Not Found** `{"error": "Slot not found"}`.
  - Slot has already started (`start <= now()`) returns **400 Bad Request** `{"error": "This appointment has already started"}`.

---

### Level 3: Concurrency Control & Cancellations
- **Race Condition Prevention**:
  - Two requests attempting to book the same slot simultaneously must never create duplicate bookings.
  - Row-level lock (`SELECT ... FOR UPDATE`) or DB transaction isolation ensures only one succeeds.
  - Second / concurrent request returns **409 Conflict** `{"error": "This slot is already booked"}`.
- **`DELETE /bookings/{id}`**:
  - Path param: `id`
  - Action: Sets booking `status` to `"cancelled"` and frees the slot (`available: true`).
  - Response `200 OK`: Cancelled booking object (`status: "cancelled"`).
  - Response `404 Not Found`: `{"error": "Booking not found"}` if ID does not exist.
  - Response `409 Conflict`: `{"error": "Booking has already been cancelled"}` if already cancelled.

---

### Level 4: Idempotency & Cursor-Based Pagination
- **Idempotency on `POST /bookings`**:
  - Header: `Idempotency-Key: <key>` (optional).
  - If repeated with identical payload (`slot_id`, `name`, `email`):
    - Return the existing booking without creating a new record.
  - If reused with a different payload:
    - Return **422 Unprocessable Entity** `{"error": "Idempotency key was already used with a different request"}`.
- **`GET /bookings` (User Booking History)**:
  - Query parameters:
    - `email` (required, case-insensitive match). Missing email returns **400 Bad Request**.
    - `limit` (optional integer, min 1, max 50, default 10). Invalid limit returns **400 Bad Request**.
    - `cursor` (optional opaque token, e.g. base64-encoded `created_at|id`).
  - Sorting: Oldest first (`created_at ASC, id ASC`).
  - Response `200 OK`:
    ```json
    {
      "bookings": [...],
      "next_cursor": "<opaque_string_or_null>"
    }
    ```
    - The last page returns `"next_cursor": null`.

---

### Level 5: Anti-Spam Rate Limiting
- **Rule**: Stop anyone from spamming bookings.
- Maximum **5 booking attempts** per email within a rolling **1-minute** window.
- If exceeded:
  - Return **429 Too Many Requests**.
  - Header: `Retry-After: <seconds_to_wait>` (integer).
  - Body: `{"error": "Too many booking attempts. Please try again later."}`.
- Concurrency-safe: Use PostgreSQL transaction advisory lock or row-level lock so concurrent requests from the same email cannot bypass the counter.

---

## 4. Frontend Application Requirements

1. **Slot Viewing**:
   - Displays all slots from `GET /slots`.
   - Clear visual status for "Available" vs "Booked".
   - Provider filtering or clear provider information.
2. **Booking Flow**:
   - Select slot -> Enter Name & Email -> Submit booking with automatic UUID idempotency key.
   - Shows clear confirmation upon booking (Booking ID, provider, time).
3. **Lookup & Management**:
   - Look up booking by ID (`GET /bookings/{id}`) or email booking history (`GET /bookings?email=...`).
   - Ability to cancel a booking (`DELETE /bookings/{id}`) with visual confirmation.
4. **Resilience & UX**:
   - Clean, modern UI (Tailwind CSS).
   - Handles errors gracefully (e.g. rate limit retry message, slot already booked alert).

---

## 5. Implementation & Verification Checklist

- [x] Level 1: `POST /reset`, `GET /slots`, `GET /bookings/{id}`
- [x] Level 2: `X-API-Key` security dependency, input validation & trimming, 400/404 handling
- [x] Level 3: `SELECT ... FOR UPDATE` concurrency locking, 409 conflict, `DELETE /bookings/{id}` cancellation
- [x] Level 4: `Idempotency-Key` header handling (same payload returns booking, different returns 422), `GET /bookings` cursor pagination
- [x] Level 5: 5 attempts/min/email rate limiting with `Retry-After` header & advisory lock
- [ ] Error handler compliance: Ensure FastAPI validation errors (422/400) return `{"error": "..."}` instead of `{"detail": [...]}`
- [ ] Frontend enhancement: Connect booking lookup, cancellation, and history viewing
- [ ] Automated Test Suite: Write comprehensive pytest suite covering all 5 levels
- [ ] Deployment Configuration: Ready for Render/Vercel with production environment variables
