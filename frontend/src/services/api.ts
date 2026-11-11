
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
  status: string
  created_at: string
}

export async function getSlots(): Promise<Slot[]> {
  const response = await fetch('/api/slots')
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Unable to load appointment slots')
  }

  return data.slots
}

export async function createBooking(
  payload: BookingRequest,
  idempotencyKey: string,
): Promise<Booking> {
  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Unable to create booking')
  }

  return data
}
