export interface Slot {
  id: string
  provider: string
  start: string
  end: string
  available: boolean
}

export interface BookingRequest {
  slot_id: string
  name: string
  email: string
}

export interface Booking {
  id: string
  slot_id: string
  name: string
  email: string
  status: 'confirmed' | 'cancelled' | string
  created_at: string
}

export interface BookingsPaginationResponse {
  bookings: Booking[]
  next_cursor: string | null
}

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.PROD ? 'https://koya-clinic-booking-k12u.onrender.com' : '/api')

const API_KEY = import.meta.env.VITE_API_KEY || 'f5OkEFdu_TmGDNayZbZlIgFTih0_PTOdij_J9TeY5Cs'

function getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY
  }
  return headers
}

export async function getSlots(provider?: string): Promise<Slot[]> {
  const url = provider
    ? `${API_BASE}/slots?provider=${encodeURIComponent(provider)}`
    : `${API_BASE}/slots`

  const response = await fetch(url, {
    headers: getHeaders(),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Unable to load appointment slots')
  }

  return data.slots
}

export async function createBooking(
  payload: BookingRequest,
  idempotencyKey?: string,
): Promise<Booking> {
  const extraHeaders: Record<string, string> = {}
  if (idempotencyKey) {
    extraHeaders['Idempotency-Key'] = idempotencyKey
  }

  const response = await fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: getHeaders(extraHeaders),
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    const errorMsg = data.error ?? 'Unable to create booking'
    const retryAfter = response.headers.get('Retry-After')
    if (response.status === 429 && retryAfter) {
      throw new Error(`${errorMsg} (Please wait ${retryAfter}s)`)
    }
    throw new Error(errorMsg)
  }

  return data
}

export async function getBooking(id: string): Promise<Booking> {
  const response = await fetch(`${API_BASE}/bookings/${encodeURIComponent(id)}`, {
    headers: getHeaders(),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Booking not found')
  }

  return data
}

export async function cancelBooking(id: string): Promise<Booking> {
  const response = await fetch(`${API_BASE}/bookings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Unable to cancel booking')
  }

  return data
}

export async function getBookingsByEmail(
  email: string,
  cursor?: string | null,
  limit: number = 5,
): Promise<BookingsPaginationResponse> {
  let url = `${API_BASE}/bookings?email=${encodeURIComponent(email)}&limit=${limit}`
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`
  }

  const response = await fetch(url, {
    headers: getHeaders(),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Unable to fetch booking history')
  }

  return data
}
