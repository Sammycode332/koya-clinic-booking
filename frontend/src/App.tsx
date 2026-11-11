import { useEffect, useState } from 'react'
import {
  getSlots,
  createBooking,
  getBooking,
  cancelBooking,
  getBookingsByEmail,
  type Slot,
  type Booking,
} from './services/api'

type ActiveTab = 'book' | 'lookup' | 'history'

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('book')

  // Slots state
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null)

  // Lookup state
  const [lookupId, setLookupId] = useState('')
  const [lookupResult, setLookupResult] = useState<Booking | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // History state
  const [historyEmail, setHistoryEmail] = useState('')
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Feedback messages
  const [errorMessage, setErrorMessage] = useState('')
  const [actionSuccessMessage, setActionSuccessMessage] = useState('')

  // Load slots on mount or when provider changes
  useEffect(() => {
    loadSlots(selectedProvider)
  }, [selectedProvider])

  async function loadSlots(provider?: string) {
    setSlotsLoading(true)
    try {
      const data = await getSlots(provider || undefined)
      setSlots(data)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load appointment slots')
    } finally {
      setSlotsLoading(false)
    }
  }

  // Get unique providers for the filter dropdown
  const providers = Array.from(new Set(slots.map((s) => s.provider))).filter(Boolean)

  async function handleBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setActionSuccessMessage('')
    setBookingSuccess(null)

    if (!selectedSlot) {
      setErrorMessage('Please choose an available appointment slot.')
      return
    }

    setSubmitting(true)
    try {
      const idempotencyKey = crypto.randomUUID()
      const newBooking = await createBooking(
        {
          slot_id: selectedSlot,
          name: name.trim(),
          email: email.trim().toLowerCase(),
        },
        idempotencyKey,
      )

      setBookingSuccess(newBooking)
      setActionSuccessMessage(`Appointment successfully confirmed!`)
      setSelectedSlot('')
      setName('')
      setEmail('')
      await loadSlots(selectedProvider)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to book appointment')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setActionSuccessMessage('')
    setLookupResult(null)

    if (!lookupId.trim()) return

    setLookupLoading(true)
    try {
      const booking = await getBooking(lookupId.trim())
      setLookupResult(booking)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Booking not found')
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return

    setErrorMessage('')
    setActionSuccessMessage('')
    try {
      const updated = await cancelBooking(id)
      setActionSuccessMessage(`Booking #${updated.id.slice(0, 8)} has been cancelled.`)

      if (lookupResult?.id === id) {
        setLookupResult(updated)
      }
      if (bookingSuccess?.id === id) {
        setBookingSuccess(updated)
      }
      // Update history list if present
      setHistoryBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)),
      )
      await loadSlots(selectedProvider)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to cancel appointment')
    }
  }

  async function handleSearchHistory(event?: React.FormEvent) {
    if (event) event.preventDefault()
    if (!historyEmail.trim()) return

    setErrorMessage('')
    setActionSuccessMessage('')
    setHistoryLoading(true)
    try {
      const data = await getBookingsByEmail(historyEmail.trim().toLowerCase(), null, 5)
      setHistoryBookings(data.bookings)
      setHistoryCursor(data.next_cursor)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to fetch booking history')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleNextPage() {
    if (!historyCursor || !historyEmail) return

    setHistoryLoading(true)
    try {
      const data = await getBookingsByEmail(
        historyEmail.trim().toLowerCase(),
        historyCursor,
        5,
      )
      setHistoryBookings(data.bookings)
      setHistoryCursor(data.next_cursor)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load next page')
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-sm">
              +
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Koya Clinic</h1>
              <p className="text-xs text-slate-500">Appointment Booking & Management</p>
            </div>
          </div>

          <nav className="flex space-x-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button
              onClick={() => {
                setActiveTab('book')
                setErrorMessage('')
                setActionSuccessMessage('')
              }}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'book'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Book
            </button>
            <button
              onClick={() => {
                setActiveTab('lookup')
                setErrorMessage('')
                setActionSuccessMessage('')
              }}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'lookup'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Look Up
            </button>
            <button
              onClick={() => {
                setActiveTab('history')
                setErrorMessage('')
                setActionSuccessMessage('')
              }}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Bookings
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Banner Alerts */}
        {errorMessage && (
          <div className="mb-6 flex items-start justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Notice:</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage('')}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {actionSuccessMessage && (
          <div className="mb-6 flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Success:</span>
              <span>{actionSuccessMessage}</span>
            </div>
            <button
              onClick={() => setActionSuccessMessage('')}
              className="text-emerald-500 hover:text-emerald-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: BOOK APPOINTMENT */}
        {activeTab === 'book' && (
          <div className="grid gap-8 lg:grid-cols-5">
            {/* Left: Available Slots (3 cols) */}
            <section className="lg:col-span-3">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Available Appointments</h2>
                  <p className="text-sm text-slate-500">Choose a doctor and convenient time slot</p>
                </div>
                {providers.length > 0 && (
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">All Providers</option>
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {slotsLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                  Loading slots...
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                  No appointment slots available at this time.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot === slot.id
                    const startDate = new Date(slot.start)
                    const endDate = new Date(slot.end)

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot.id)}
                        className={`flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-300'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs'
                        } ${!slot.available ? 'cursor-not-allowed opacity-50 bg-slate-100' : ''}`}
                      >
                        <div>
                          <span className="font-semibold text-slate-900">{slot.provider}</span>
                          <p className="mt-1 text-xs text-slate-500">Slot ID: {slot.id}</p>
                          <div className="mt-2 text-sm text-slate-700">
                            📅 {startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-sm text-slate-700">
                            ⏰ {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                            {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              slot.available
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {slot.available ? 'Available' : 'Booked'}
                          </span>
                          {isSelected && (
                            <span className="text-xs font-semibold text-blue-600">Selected ✓</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Right: Booking Form & Confirmation (2 cols) */}
            <section className="space-y-6 lg:col-span-2">
              <form
                onSubmit={handleBooking}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              >
                <h3 className="text-lg font-bold text-slate-900">Your Contact Details</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select a slot on the left and enter your details to reserve your visit.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Selected Slot ID
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedSlot || 'None selected'}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-700">
                      Full Name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      placeholder="e.g. Ada Obi"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-700">
                      Email Address *
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="ada@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedSlot}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Confirming Booking...' : 'Confirm Appointment'}
                  </button>
                </div>
              </form>

              {/* Instant Confirmation Card */}
              {bookingSuccess && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-xs">
                  <div className="flex items-center space-x-2 text-emerald-800">
                    <span className="text-xl">🎉</span>
                    <h4 className="font-bold">Booking Confirmed!</h4>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-emerald-900">
                    <p>
                      <strong>Booking ID:</strong>{' '}
                      <span className="font-mono bg-emerald-100 px-1 py-0.5 rounded">
                        {bookingSuccess.id}
                      </span>
                    </p>
                    <p>
                      <strong>Slot:</strong> {bookingSuccess.slot_id}
                    </p>
                    <p>
                      <strong>Name:</strong> {bookingSuccess.name}
                    </p>
                    <p>
                      <strong>Email:</strong> {bookingSuccess.email}
                    </p>
                    <p>
                      <strong>Status:</strong>{' '}
                      <span className="capitalize font-semibold">{bookingSuccess.status}</span>
                    </p>
                  </div>

                  {bookingSuccess.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancel(bookingSuccess.id)}
                      className="mt-4 w-full rounded-lg border border-red-300 bg-white py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Cancel this Booking
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: LOOK UP BOOKING */}
        {activeTab === 'lookup' && (
          <div className="mx-auto max-w-xl">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-xl font-bold text-slate-800">Look Up a Booking</h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter your unique booking ID to check status or cancel.
              </p>

              <form onSubmit={handleLookup} className="mt-5 flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Paste your booking ID"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {lookupLoading ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>

            {lookupResult && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="font-bold text-slate-800">Booking Details</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      lookupResult.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {lookupResult.status.toUpperCase()}
                  </span>
                </div>

                <dl className="mt-4 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500">Booking ID</dt>
                    <dd className="font-mono text-slate-800">{lookupResult.id}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500">Slot ID</dt>
                    <dd className="text-slate-800">{lookupResult.slot_id}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500">Patient Name</dt>
                    <dd className="font-semibold text-slate-800">{lookupResult.name}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500">Email Address</dt>
                    <dd className="text-slate-800">{lookupResult.email}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-slate-500">Booked At</dt>
                    <dd className="text-slate-800">
                      {new Date(lookupResult.created_at).toLocaleString()}
                    </dd>
                  </div>
                </dl>

                {lookupResult.status === 'confirmed' && (
                  <button
                    onClick={() => handleCancel(lookupResult.id)}
                    className="mt-6 w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Cancel This Booking
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MY BOOKINGS HISTORY */}
        {activeTab === 'history' && (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-xl font-bold text-slate-800">Booking History</h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter your email address to view all your past and upcoming bookings.
              </p>

              <form onSubmit={handleSearchHistory} className="mt-5 flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={historyEmail}
                  onChange={(e) => setHistoryEmail(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={historyLoading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {historyLoading ? 'Loading...' : 'View History'}
                </button>
              </form>
            </div>

            {historyBookings.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-600">
                  Bookings for {historyEmail} ({historyBookings.length} on this page):
                </h3>
                {historyBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-900">{b.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            b.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Slot: {b.slot_id} • Booked: {new Date(b.created_at).toLocaleString()}
                      </p>
                      <p className="text-xs font-mono text-slate-400">ID: {b.id}</p>
                    </div>

                    {b.status === 'confirmed' && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 sm:mt-0"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}

                {/* Pagination Controls */}
                <div className="mt-4 flex justify-end">
                  {historyCursor ? (
                    <button
                      onClick={handleNextPage}
                      disabled={historyLoading}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {historyLoading ? 'Loading next...' : 'Next Page →'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">End of records</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
