export interface Slot {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
}
export interface BookingRequest {
  slot_id: string;
  name: string;
  email: string;
}
export interface Booking {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}
export interface BookingsPaginationResponse {
  bookings: Booking[];
  next_cursor: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error(
      "The clinic could not be reached. Please check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const wait = response.headers.get("Retry-After");
    throw new ApiError(
      `${data?.error || "The request could not be completed. Please try again."}${response.status === 429 && wait ? ` Try again in ${wait} seconds.` : ""}`,
      response.status,
    );
  }
  if (!data)
    throw new Error(
      "The clinic returned an unexpected response. Please try again.",
    );
  return data as T;
}
export async function getSlots(): Promise<Slot[]> {
  return (await request<{ slots: Slot[] }>("/slots")).slots;
}
export function createBooking(
  payload: BookingRequest,
  key: string,
): Promise<Booking> {
  return request("/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
}
export function getBooking(id: string): Promise<Booking> {
  return request(`/bookings/${encodeURIComponent(id)}`);
}
export function cancelBooking(id: string): Promise<Booking> {
  return request(`/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function getBookingsByEmail(
  email: string,
  cursor: string | null = null,
): Promise<BookingsPaginationResponse> {
  const query = new URLSearchParams({ email, limit: "5" });
  if (cursor) query.set("cursor", cursor);
  return request(`/bookings?${query}`);
}
