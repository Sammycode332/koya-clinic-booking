
import { useEffect, useState } from 'react'
import {
  getSlots,
  createBooking,
  type Slot,
} from './services/api'

function App() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadSlots() {
      try {
        const data = await getSlots()
        console.log('Slots received:', data)
        console.log('Number of slots:', data.length)
        setSlots(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load slots')
      } finally {
        setLoading(false)
      }
    }

    loadSlots()
  }, [])

  async function handleBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedSlot) {
      setError('Please select an appointment slot.')
      return
    }

    setSubmitting(true)

    try {
      const booking = await createBooking(
        {
          slot_id: selectedSlot,
          name,
          email,
        },
        crypto.randomUUID(),
      )

      setSuccess(`Booking confirmed! Your booking ID is ${booking.id}.`)
      setSelectedSlot('')
      setName('')
      setEmail('')

      const updatedSlots = await getSlots()
      setSlots(updatedSlots)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Clinic Appointment Booking
          </h1>
          <p className="mt-2 text-slate-600">
            Choose an available appointment and book your visit.
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">
            Available appointments
          </h2>

          {loading && <p>Loading appointments...</p>}

          {!loading && slots.length === 0 && (
            <p className="rounded-lg bg-white p-5 text-slate-600">
              No appointment slots are currently available.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                disabled={!slot.available}
                onClick={() => setSelectedSlot(slot.id)}
                className={`rounded-xl border p-5 text-left transition ${
                  selectedSlot === slot.id
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <p className="font-semibold text-slate-900">
                  {slot.provider}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {new Date(slot.start).toLocaleString()}
                </p>
                <p className="text-sm text-slate-600">
                  Until {new Date(slot.end).toLocaleTimeString()}
                </p>
                <p className={`mt-3 text-sm font-medium ${
                  slot.available ? 'text-green-700' : 'text-red-600'
                }`}>
                  {slot.available ? 'Available' : 'Booked'}
                </p>
              </button>
            ))}
          </div>
        </section>

        <form
          onSubmit={handleBooking}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-slate-800">
            Your details
          </h2>

          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Full name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Enter your email"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || loading || !selectedSlot}
            className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Booking...' : 'Book appointment'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default App
