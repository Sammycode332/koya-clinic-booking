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

type TabType = 'book' | 'lookup' | 'history'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('book')

  // Slot booking state
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedSlotId, setSelectedSlotId] = useState<string>('')
  const [filterAvailableOnly, setFilterAvailableOnly] = useState<boolean>(false)
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [bookingReceipt, setBookingReceipt] = useState<Booking | null>(null)

  // Lookup state
  const [searchBookingId, setSearchBookingId] = useState('')
  const [lookupResult, setLookupResult] = useState<Booking | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // History state
  const [historyEmail, setHistoryEmail] = useState('')
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Feedback notifications
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    fetchSlots(selectedProvider)
  }, [selectedProvider])

  async function fetchSlots(provider?: string) {
    setSlotsLoading(true)
    try {
      const data = await getSlots(provider || undefined)
      setSlots(data)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not fetch clinic slots')
    } finally {
      setSlotsLoading(false)
    }
  }

  const providers = Array.from(new Set(slots.map((s) => s.provider))).filter(Boolean)

  const displayedSlots = slots.filter((slot) => {
    if (filterAvailableOnly && !slot.available) return false
    return true
  })

  const selectedSlot = slots.find((s) => s.id === selectedSlotId)

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setBookingReceipt(null)

    if (!selectedSlotId) {
      setErrorMessage('Please pick an appointment time slot first.')
      return
    }

    setSubmitting(true)
    try {
      const key = crypto.randomUUID()
      const booking = await createBooking(
        {
          slot_id: selectedSlotId,
          name: patientName.trim(),
          email: patientEmail.trim().toLowerCase(),
        },
        key,
      )

      setBookingReceipt(booking)
      setSuccessMessage('Appointment reserved successfully!')
      setSelectedSlotId('')
      setPatientName('')
      setPatientEmail('')
      await fetchSlots(selectedProvider)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Booking request failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLookupBooking(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setLookupResult(null)

    const cleanId = searchBookingId.trim()
    if (!cleanId) return

    setLookupLoading(true)
    try {
      const booking = await getBooking(cleanId)
      setLookupResult(booking)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No booking found with this ID')
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleCancelBooking(id: string) {
    if (!window.confirm('Do you really want to cancel this clinic appointment?')) return

    setErrorMessage('')
    setSuccessMessage('')
    try {
      const cancelled = await cancelBooking(id)
      setSuccessMessage(`Appointment #${cancelled.id.slice(0, 8)} has been cancelled.`)

      if (lookupResult?.id === id) setLookupResult(cancelled)
      if (bookingReceipt?.id === id) setBookingReceipt(cancelled)

      setHistoryBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)),
      )
      await fetchSlots(selectedProvider)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not cancel booking')
    }
  }

  async function handleSearchHistory(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const email = historyEmail.trim().toLowerCase()
    if (!email) return

    setErrorMessage('')
    setSuccessMessage('')
    setHistoryLoading(true)
    try {
      const data = await getBookingsByEmail(email, null, 5)
      setHistoryBookings(data.bookings)
      setHistoryCursor(data.next_cursor)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to retrieve appointments')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleLoadMoreHistory() {
    if (!historyCursor || !historyEmail) return

    setHistoryLoading(true)
    try {
      const data = await getBookingsByEmail(
        historyEmail.trim().toLowerCase(),
        historyCursor,
        5,
      )
      setHistoryBookings((prev) => [...prev, ...data.bookings])
      setHistoryCursor(data.next_cursor)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not fetch next page')
    } finally {
      setHistoryLoading(false)
    }
  }

  // Doctor avatar color generator
  function getDoctorColor(provider: string) {
    const colors = [
      'bg-teal-500',
      'bg-blue-600',
      'bg-indigo-600',
      'bg-emerald-600',
      'bg-cyan-600',
      'bg-sky-600',
    ]
    let hash = 0
    for (let i = 0; i < provider.length; i++) hash = provider.charCodeAt(i) + ((hash << 5) - hash)
    const index = Math.abs(hash) % colors.length
    return colors[index]
  }

  function getInitials(name: string) {
    return name
      .replace(/^Dr\.?\s*/i, '')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Top Clinic Emergency & Hours Announcement Bar */}
      <div className="bg-slate-900 px-4 py-2 text-center text-xs font-medium text-slate-300">
        <span>🏥 Koya Healthcare Center • Mon–Sat 8:00 AM – 7:00 PM • Urgent Care Hotline: (01) 800-KOYA</span>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-700 to-teal-500 text-white shadow-md">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                  KOYA <span className="text-blue-600">CLINIC</span>
                </h1>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  System Live
                </span>
              </div>
              <p className="text-xs text-slate-500">Fast, Certified Medical Appointments</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1.5 rounded-2xl bg-slate-100 p-1.5 text-xs sm:text-sm font-semibold">
            <button
              onClick={() => {
                setActiveTab('book')
                setErrorMessage('')
                setSuccessMessage('')
              }}
              className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-2 transition ${
                activeTab === 'book'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              
              <span>Book Appointment</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('lookup')
                setErrorMessage('')
                setSuccessMessage('')
              }}
              className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-2 transition ${
                activeTab === 'lookup'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              
              <span>Lookup Ticket</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history')
                setErrorMessage('')
                setSuccessMessage('')
              }}
              className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-2 transition ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
             
              <span>My Appointments</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="bg-gradient-to-b from-blue-50/70 via-slate-50 to-slate-50 border-b border-slate-200/60 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Personalized Healthcare Consultation
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Select an available time slot with your preferred medical specialist, provide your contact details, and receive an instant booking confirmation.
            </p>
           
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Alerts */}
        {errorMessage && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-800 shadow-xs">
            <div className="flex items-center space-x-2.5">
              <span className="text-lg">⚠️</span>
              <p className="font-medium">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage('')}
              className="rounded-lg p-1 text-red-500 hover:bg-red-100"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800 shadow-xs">
            <div className="flex items-center space-x-2.5">
              <span className="text-lg">✅</span>
              <p className="font-semibold">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage('')}
              className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* ================= VIEW 1: BOOKING WORKFLOW ================= */}
        {activeTab === 'book' && (
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Left Column: Doctor Slots (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center space-x-2">
                  <label htmlFor="provider-filter" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Doctor:
                  </label>
                  <select
                    id="provider-filter"
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="">All Medical Specialists</option>
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={filterAvailableOnly}
                      onChange={(e) => setFilterAvailableOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Available Slots Only</span>
                  </label>
                </div>
              </div>

              {/* Slots List */}
              {slotsLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                  <p className="mt-3 text-sm font-medium text-slate-500">Checking clinic availability...</p>
                </div>
              ) : displayedSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <span className="text-3xl">🗓️</span>
                  <h4 className="mt-2 text-base font-bold text-slate-800">No Appointments Found</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Try choosing another doctor or toggling off the &apos;Available Slots Only&apos; filter.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {displayedSlots.map((slot) => {
                    const isSelected = selectedSlotId === slot.id
                    const startDate = new Date(slot.start)
                    const endDate = new Date(slot.end)
                    const doctorInitials = getInitials(slot.provider)
                    const avatarBg = getDoctorColor(slot.provider)

                    return (
                      <div
                        key={slot.id}
                        onClick={() => slot.available && setSelectedSlotId(slot.id)}
                        className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 shadow-md ring-2 ring-blue-500/20'
                            : slot.available
                            ? 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md cursor-pointer'
                            : 'border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div>
                          {/* Doctor Header */}
                          <div className="flex items-center space-x-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-xs ${avatarBg}`}>
                              {doctorInitials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-bold text-slate-900 group-hover:text-blue-700">
                                {slot.provider}
                              </h4>
                              <p className="text-[11px] font-mono text-slate-400">ID: {slot.id}</p>
                            </div>
                          </div>

                          {/* Date & Time */}
                          <div className="mt-4 rounded-xl bg-slate-50 p-2.5 border border-slate-100 text-xs space-y-1">
                            <div className="flex items-center text-slate-700 font-medium">
                              <span className="mr-1.5 text-blue-500">📅</span>
                              {startDate.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                            <div className="flex items-center text-slate-600 font-mono text-[11px]">
                              <span className="mr-1.5 text-teal-500">⏰</span>
                              {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                              {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>

                        {/* Availability Footer */}
                        <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-100">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              slot.available
                                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${slot.available ? 'bg-emerald-600' : 'bg-slate-500'}`} />
                            {slot.available ? 'Available' : 'Booked'}
                          </span>

                          {slot.available && (
                            <span className={`text-xs font-semibold ${isSelected ? 'text-blue-700' : 'text-slate-400 group-hover:text-blue-600'}`}>
                              {isSelected ? 'Selected ✓' : 'Select →'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Booking Form & Voucher (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Booking Card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-bold text-slate-900">Patient Reservation</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Complete the details below to reserve your consultation.
                  </p>
                </div>

                {/* Selected Slot Summary Badge */}
                <div className="mt-4 rounded-2xl bg-blue-50/60 border border-blue-100 p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Selected Appointment</span>
                  {selectedSlot ? (
                    <div className="mt-1 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{selectedSlot.provider}</p>
                        <p className="text-xs text-slate-600">
                          {new Date(selectedSlot.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                          {new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-200">
                        {selectedSlot.id}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500 italic">
                      No appointment selected. Click an available slot on the left.
                    </p>
                  )}
                </div>

                <form onSubmit={handleCreateBooking} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="patient-name" className="mb-1 block text-xs font-bold text-slate-700">
                      Patient Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
          
                      <input
                        id="patient-name"
                        type="text"
                        required
                        placeholder="e.g. Ada Obi"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="patient-email" className="mb-1 block text-xs font-bold text-slate-700">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="patient-email"
                        type="email"
                        required
                        placeholder="ada@example.com"
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      We will link your appointment history to this email.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedSlotId}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-teal-600 py-3 text-sm font-bold text-white shadow-md transition hover:from-blue-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Confirming with Doctor...' : 'Confirm Appointment Now'}
                  </button>
                </form>
              </div>

              {/* Digital Clinic Voucher Card */}
              {bookingReceipt && (
                <div className="overflow-hidden rounded-3xl border border-emerald-300 bg-white shadow-md">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">🎉</span>
                        <div>
                          <h4 className="font-extrabold tracking-tight">Appointment Voucher</h4>
                          <p className="text-[11px] text-emerald-100">Koya Health Verification</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
                        {bookingReceipt.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Booking ID</span>
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {bookingReceipt.id}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Slot ID</span>
                      <span className="font-mono font-semibold text-slate-800">{bookingReceipt.slot_id}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Patient</span>
                      <span className="font-bold text-slate-900">{bookingReceipt.name}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Email</span>
                      <span className="text-slate-800">{bookingReceipt.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Booked At</span>
                      <span className="text-slate-700">
                        {new Date(bookingReceipt.created_at).toLocaleString()}
                      </span>
                    </div>

                    {bookingReceipt.status === 'confirmed' && (
                      <button
                        onClick={() => handleCancelBooking(bookingReceipt.id)}
                        className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        Cancel This Appointment
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= VIEW 2: LOOKUP BOOKING ================= */}
        {activeTab === 'lookup' && (
          <div className="mx-auto max-w-xl">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-2xl">🔍</span>
                <h3 className="text-lg font-bold text-slate-900">Look Up Clinic Appointment</h3>
              </div>
              <p className="text-xs text-slate-500">
                Enter your unique booking ID (from your confirmation voucher) to inspect status or cancel.
              </p>

              <form onSubmit={handleLookupBooking} className="mt-5 flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Paste Booking ID (e.g. 3fa85f64-5717-...)"
                  value={searchBookingId}
                  onChange={(e) => setSearchBookingId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                />
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {lookupLoading ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>

            {lookupResult && (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="font-extrabold text-slate-900">Booking Summary</h4>
                    <p className="text-xs font-mono text-slate-400">ID: {lookupResult.id}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${
                      lookupResult.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20'
                        : 'bg-red-100 text-red-800 ring-1 ring-red-600/20'
                    }`}
                  >
                    {lookupResult.status}
                  </span>
                </div>

                <div className="mt-4 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Reserved Slot</span>
                    <span className="font-mono font-bold text-slate-800">{lookupResult.slot_id}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Patient Name</span>
                    <span className="font-bold text-slate-900">{lookupResult.name}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Registered Email</span>
                    <span className="text-slate-800">{lookupResult.email}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Creation Timestamp</span>
                    <span className="text-slate-700">{new Date(lookupResult.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {lookupResult.status === 'confirmed' && (
                  <button
                    onClick={() => handleCancelBooking(lookupResult.id)}
                    className="mt-6 w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-700 hover:bg-red-100 transition shadow-xs"
                  >
                    Cancel This Appointment
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= VIEW 3: PATIENT HISTORY ================= */}
        {activeTab === 'history' && (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-2xl">📋</span>
                <h3 className="text-lg font-bold text-slate-900">Patient Appointment History</h3>
              </div>
              <p className="text-xs text-slate-500">
                Look up all past and upcoming visits associated with your email address.
              </p>

              <form onSubmit={handleSearchHistory} className="mt-5 flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="Enter your registered email address"
                  value={historyEmail}
                  onChange={(e) => setHistoryEmail(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={historyLoading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {historyLoading ? 'Loading...' : 'Fetch History'}
                </button>
              </form>
            </div>

            {historyBookings.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Records for {historyEmail} ({historyBookings.length} loaded)
                  </h4>
                </div>

                {historyBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:shadow-md transition"
                  >
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <span className="font-extrabold text-slate-900">{b.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                            b.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Slot: <span className="font-mono font-medium text-slate-700">{b.slot_id}</span> • Booked:{' '}
                        {new Date(b.created_at).toLocaleString()}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">ID: {b.id}</p>
                    </div>

                    {b.status === 'confirmed' && (
                      <button
                        onClick={() => handleCancelBooking(b.id)}
                        className="mt-3 sm:mt-0 rounded-xl border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}

                {/* Cursor Pagination Button */}
                <div className="mt-5 flex justify-center">
                  {historyCursor ? (
                    <button
                      onClick={handleLoadMoreHistory}
                      disabled={historyLoading}
                      className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50"
                    >
                      {historyLoading ? 'Loading more...' : 'Load More Records ↓'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">✓ All booking records loaded</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 Koya Health Clinic • Built for Koya Academy Assessment • All Rights Reserved</p>
      </footer>
    </div>
  )
}
