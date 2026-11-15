import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  getSlots,
  createBooking,
  getBooking,
  cancelBooking,
  getBookingsByEmail,
  type Slot,
  type Booking,
} from "./services/api";
import "./App.css";

type Tab = "book" | "lookup" | "history";
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
const dateKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export default function App() {
  const [tab, setTab] = useState<Tab>("book");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [provider, setProvider] = useState("");
  const [day, setDay] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Booking | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookup, setLookup] = useState<Booking | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [historyEmail, setHistoryEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState("");
  const [history, setHistory] = useState<Booking[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    getSlots()
      .then((data) => {
        if (active) setSlots(data);
      })
      .catch((err) => {
        if (active) setSlotsError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (receipt) resultRef.current?.focus();
  }, [receipt]);
  useEffect(() => {
    if (cancelId) cancelDialog.current?.showModal();
    else cancelDialog.current?.close();
  }, [cancelId]);

  async function refresh() {
    setLoading(true);
    setSlotsError("");
    try {
      setSlots(await getSlots());
      setNow(Date.now());
    } catch (err) {
      setSlotsError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  const providers = [...new Set(slots.map((slot) => slot.provider))].sort();
  const bookable = (slot: Slot) =>
    slot.available && new Date(slot.start).getTime() > now;
  const filtered = slots
    .filter(
      (slot) =>
        (!provider || slot.provider === provider) &&
        (!day || dateKey(slot.start) === day) &&
        (!availableOnly || bookable(slot)),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const selected = slots.find((slot) => slot.id === selectedId);
  const groups = filtered.reduce((map, slot) => {
    const key = dateKey(slot.start);
    map.set(key, [...(map.get(key) || []), slot]);
    return map;
  }, new Map<string, Slot[]>());
  function navigate(next: Tab) {
    setTab(next);
    setError("");
    setNotice("");
  }

  async function submitBooking(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selected || !bookable(selected)) {
      setError("Please choose an available future appointment.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    const payload = {
      slot_id: selected.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
    };
    const serialized = JSON.stringify(payload);
    if (attempt.current?.payload !== serialized)
      attempt.current = { payload: serialized, key: crypto.randomUUID() };
    setSubmitting(true);
    try {
      const booking = await createBooking(payload, attempt.current.key);
      setReceipt(booking);
      setSelectedId("");
      setName("");
      setEmail("");
      attempt.current = null;
      await refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.status === 409) {
        setSelectedId("");
        await refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }
  async function searchBooking(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLookup(null);
    setLookupLoading(true);
    try {
      setLookup(await getBooking(lookupId.trim()));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLookupLoading(false);
    }
  }
  async function searchHistory(event?: React.FormEvent, more = false) {
    event?.preventDefault();
    setError("");
    setNotice("");
    setHistoryLoading(true);
    const query = more ? searchedEmail : historyEmail.trim().toLowerCase();
    if (!more) {
      setHistory([]);
      setCursor(null);
      setSearchedEmail("");
    }
    try {
      const data = await getBookingsByEmail(query, more ? cursor : null);
      setHistory((prev) =>
        more
          ? [
              ...prev,
              ...data.bookings.filter(
                (item) => !prev.some((existing) => existing.id === item.id),
              ),
            ]
          : data.bookings,
      );
      setCursor(data.next_cursor);
      setSearchedEmail(query);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setHistoryLoading(false);
    }
  }
  async function confirmCancel() {
    if (!cancelId || cancelling) return;
    setCancelling(true);
    setError("");
    setNotice("");
    try {
      const updated = await cancelBooking(cancelId);
      setLookup((prev) => (prev?.id === updated.id ? updated : prev));
      setReceipt((prev) => (prev?.id === updated.id ? updated : prev));
      setHistory((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Appointment cancelled. The time is available to book again.");
      setCancelId(null);
      await refresh();
    } catch (err) {
      setError(errorText(err));
      setCancelId(null);
    } finally {
      setCancelling(false);
    }
  }
  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setNotice("Booking reference copied.");
    } catch {
      setError(
        "Copy is unavailable. Select and copy the booking reference below.",
      );
    }
  }
  function calendar(booking: Booking, slot: Slot) {
    const stamp = (value: string) =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const escape = (value: string) =>
      value
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Koya Clinic//Appointments//EN",
      "BEGIN:VEVENT",
      `UID:${escape(booking.id)}@koya-clinic`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(slot.start)}`,
      `DTEND:${stamp(slot.end)}`,
      `SUMMARY:${escape(`Appointment with ${slot.provider}`)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "koya-appointment.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function bookingCard(booking: Booking) {
    const slot = slots.find((item) => item.id === booking.slot_id);
    return (
      <article className="booking-card" key={booking.id}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">APPOINTMENT</span>
            <h3>{slot?.provider || "Clinic appointment"}</h3>
          </div>
          <span
            className={`status ${booking.status === "confirmed" ? "available" : "cancelled"}`}
          >
            {booking.status}
          </span>
        </div>
        {slot ? (
          <p>
            {dateLabel(slot.start)} · {timeLabel(slot.start)} –{" "}
            {timeLabel(slot.end)}
          </p>
        ) : (
          <p>Slot reference: {booking.slot_id}</p>
        )}
        <p className="patient">
          {booking.name} <span>· {booking.email}</span>
        </p>
        <div className="reference">
          <span>Booking reference</span>
          <code>{booking.id}</code>
        </div>
        <div className="card-actions">
          <button className="secondary" onClick={() => copyId(booking.id)}>
            Copy reference
          </button>
          {slot && booking.status === "confirmed" && (
            <button
              className="secondary"
              onClick={() => calendar(booking, slot)}
            >
              Add to calendar
            </button>
          )}
          {booking.status === "confirmed" && (
            <button
              className="danger-link"
              onClick={() => setCancelId(booking.id)}
            >
              Cancel appointment
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="announcement">
        A little planning. A healthier you.{" "}
        <span>Your appointment starts here.</span>
      </div>
      <header className="header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              navigate("book");
            }}
            aria-label="Koya Clinic home"
          >
            <span className="brand-icon" aria-hidden="true">
              +
            </span>
            <span>
              koya<span className="brand-light">clinic</span>
              <small>CARE THAT FITS YOUR LIFE</small>
            </span>
          </a>
          <nav aria-label="Main navigation">
            {(
              [
                ["book", "Book a visit"],
                ["lookup", "Find a booking"],
                ["history", "My appointments"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-current={tab === value ? "page" : undefined}
                className={tab === value ? "nav-active" : ""}
                onClick={() => navigate(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <span className="header-note">
            <span aria-hidden="true">✦</span> Here for your wellbeing
          </span>
        </div>
      </header>
      <main id="main" className="container">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="small-cross" aria-hidden="true">
                +
              </span>{" "}
              YOUR HEALTH, YOUR SCHEDULE
            </span>
            <h1>
              {tab === "book" ? (
                <>
                  Good care.
                  <br />
                  At the right <em>time.</em>
                </>
              ) : tab === "lookup" ? (
                <>
                  Your visit,
                  <br />
                  <em>all in one place.</em>
                </>
              ) : (
                <>
                  Make room
                  <br />
                  for your <em>wellbeing.</em>
                </>
              )}
            </h1>
            <p>
              {tab === "book"
                ? "Find a time that works for you. Choose your doctor, book your visit, and take the next step towards feeling better."
                : "Find your appointment details, save a reminder, or manage your upcoming visit."}
            </p>
            <div className="hero-points">
              <span>✓ Simple booking</span>
              <span>✓ Instant confirmation</span>
              <span>✓ Easy cancellation</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <span className="art-cross">+</span>
            <div className="art-card">
              <span className="art-check">✓</span>
              <div>
                A moment for your health
                <small>One appointment. A positive step.</small>
              </div>
            </div>
            <span className="art-spark">✦</span>
          </div>
        </section>
        <div aria-live="polite">
          {notice && (
            <div className="alert success">
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
        </div>
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {tab === "book" ? (
          <>
            {receipt && (
              <div ref={resultRef} tabIndex={-1} className="receipt">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      {receipt.status === "confirmed"
                        ? "YOU’RE ALL SET"
                        : "BOOKING UPDATED"}
                    </span>
                    <h2>
                      {receipt.status === "confirmed"
                        ? "Your appointment is confirmed."
                        : "Your appointment is cancelled."}
                    </h2>
                    <p>Save your reference to find this booking again.</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Dismiss booking confirmation"
                    onClick={() => setReceipt(null)}
                  >
                    ×
                  </button>
                </div>
                {bookingCard(receipt)}
              </div>
            )}
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">LET’S GET YOU BOOKED</span>
                <h2>Find your next appointment</h2>
              </div>
              <p>
                Times shown in{" "}
                {Intl.DateTimeFormat()
                  .resolvedOptions()
                  .timeZone.replaceAll("_", " ")}
                .
              </p>
            </div>
            <div className="booking-layout">
              <section
                className="panel slots-panel"
                aria-labelledby="slots-heading"
              >
                <div className="section-heading">
                  <h3 id="slots-heading">
                    <span className="step">1</span> Choose your time
                  </h3>
                  <button
                    className="text-button"
                    onClick={refresh}
                    disabled={loading || submitting}
                  >
                    {loading ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>
                <fieldset className="filters" disabled={submitting}>
                  <div>
                    <label htmlFor="provider">Doctor</label>
                    <select
                      id="provider"
                      value={provider}
                      onChange={(event) => {
                        setProvider(event.target.value);
                        setSelectedId("");
                      }}
                    >
                      <option value="">All doctors</option>
                      {providers.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="date">Date</label>
                    <input
                      id="date"
                      type="date"
                      value={day}
                      onChange={(event) => {
                        setDay(event.target.value);
                        setSelectedId("");
                      }}
                    />
                  </div>
                </fieldset>
                <div className="filter-meta">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={availableOnly}
                      onChange={(event) =>
                        setAvailableOnly(event.target.checked)
                      }
                    />{" "}
                    Available times only
                  </label>
                  <span>
                    {filtered.length}{" "}
                    {filtered.length === 1 ? "appointment" : "appointments"}
                  </span>
                </div>
                {slotsError ? (
                  <div className="empty-state" role="alert">
                    <span className="empty-icon">!</span>
                    <h3>We couldn’t load appointments</h3>
                    <p>{slotsError}</p>
                    <button
                      className="secondary"
                      onClick={refresh}
                      disabled={loading}
                    >
                      Try again
                    </button>
                  </div>
                ) : loading ? (
                  <div className="slot-skeleton" role="status">
                    <span className="spinner" /> Loading appointment times…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">▦</span>
                    <h3>No times to show just yet</h3>
                    <p>
                      {provider || day
                        ? "Try another doctor or date to find your next visit."
                        : "There are no matching appointments. Check back soon or show all times."}
                    </p>
                    {(provider || day) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setProvider("");
                          setDay("");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="slot-groups">
                    {[...groups].map(([key, items]) => (
                      <section key={key}>
                        <h4 className="day-label">
                          {dateLabel(items[0].start)}
                          <span>
                            {items.length}{" "}
                            {items.length === 1 ? "time" : "times"}
                          </span>
                        </h4>
                        <div className="slot-grid">
                          {items.map((slot) => (
                            <button
                              key={slot.id}
                              className={`slot ${selectedId === slot.id ? "slot-selected" : ""}`}
                              disabled={!bookable(slot) || submitting}
                              aria-pressed={selectedId === slot.id}
                              onClick={() => {
                                setSelectedId(slot.id);
                                setReceipt(null);
                                if (window.innerWidth < 900)
                                  detailsRef.current?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }}
                            >
                              <span className="slot-top">
                                <span className="avatar">
                                  {initials(slot.provider)}
                                </span>
                                <span className="doctor-name">
                                  {slot.provider}
                                </span>
                                <span
                                  className="selection-dot"
                                  aria-hidden="true"
                                >
                                  {selectedId === slot.id ? "✓" : ""}
                                </span>
                              </span>
                              <strong>
                                {timeLabel(slot.start)}{" "}
                                <span>– {timeLabel(slot.end)}</span>
                              </strong>
                              <span className="slot-bottom">
                                <span>
                                  {Math.round(
                                    (Date.parse(slot.end) -
                                      Date.parse(slot.start)) /
                                      60000,
                                  )}{" "}
                                  min consultation
                                </span>
                                <span
                                  className={
                                    bookable(slot) ? "available-text" : ""
                                  }
                                >
                                  {!slot.available
                                    ? "Booked"
                                    : !bookable(slot)
                                      ? "Past"
                                      : "Available"}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </section>
              <aside>
                <div className="panel details-panel" ref={detailsRef}>
                  <h3>
                    <span className="step">2</span> Your details
                  </h3>
                  <p className="muted">
                    A few details, and you’re on your way.
                  </p>
                  <div
                    className={`selection-summary ${selected ? "has-selection" : ""}`}
                  >
                    {selected ? (
                      <>
                        <span className="eyebrow">YOUR SELECTED VISIT</span>
                        <strong>{selected.provider}</strong>
                        <span>{dateLabel(selected.start)}</span>
                        <span>
                          {timeLabel(selected.start)} –{" "}
                          {timeLabel(selected.end)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="empty-icon">▦</span>
                        <strong>Your visit starts with a time</strong>
                        <span>
                          Choose an available appointment to continue.
                        </span>
                      </>
                    )}
                  </div>
                  <form onSubmit={submitBooking}>
                    <fieldset disabled={submitting}>
                      <label htmlFor="patient-name">Full name</label>
                      <input
                        id="patient-name"
                        name="name"
                        autoComplete="name"
                        placeholder="Your full name"
                        required
                        maxLength={150}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                      <label htmlFor="patient-email">Email address</label>
                      <input
                        id="patient-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        required
                        maxLength={254}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                      <p className="field-hint">
                        Use this email to find your appointments later.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          !selected ||
                          !bookable(selected) ||
                          loading ||
                          !!slotsError ||
                          submitting
                        }
                      >
                        {submitting
                          ? "Confirming your visit…"
                          : "Confirm appointment →"}
                      </button>
                    </fieldset>
                  </form>
                  <p className="privacy-note">
                    Your details are used to manage your appointment.
                  </p>
                </div>
                <div className="help-card">
                  <span aria-hidden="true">✦</span>
                  <div>
                    <strong>Plans change. That’s okay.</strong>
                    <p>
                      Find your booking anytime to view the details or cancel
                      your visit.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <section className="manage-panel panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {tab === "lookup"
                    ? "YOUR BOOKING REFERENCE"
                    : "YOUR APPOINTMENT HISTORY"}
                </span>
                <h2>
                  {tab === "lookup" ? "Find a booking" : "My appointments"}
                </h2>
                <p className="muted">
                  {tab === "lookup"
                    ? "Enter the reference you received when you booked."
                    : "Use the email address you entered when booking."}
                </p>
              </div>
            </div>
            <form
              className="search-form"
              onSubmit={tab === "lookup" ? searchBooking : searchHistory}
            >
              <div>
                <label htmlFor="search">
                  {tab === "lookup" ? "Booking reference" : "Email address"}
                </label>
                <input
                  id="search"
                  key={tab}
                  type={tab === "lookup" ? "text" : "email"}
                  required
                  value={tab === "lookup" ? lookupId : historyEmail}
                  onChange={(event) =>
                    tab === "lookup"
                      ? setLookupId(event.target.value)
                      : setHistoryEmail(event.target.value)
                  }
                  placeholder={
                    tab === "lookup"
                      ? "Paste your booking reference"
                      : "you@example.com"
                  }
                  disabled={lookupLoading || historyLoading}
                />
              </div>
              <button
                className="primary"
                disabled={lookupLoading || historyLoading}
              >
                {lookupLoading || historyLoading
                  ? "Searching…"
                  : "Find appointments →"}
              </button>
            </form>
            {tab === "lookup" && lookup && bookingCard(lookup)}
            {tab === "history" && searchedEmail && (
              <>
                <p className="result-caption">
                  Appointments for <strong>{searchedEmail}</strong>
                </p>
                {history.length ? (
                  history.map(bookingCard)
                ) : (
                  <div className="empty-state">
                    <h3>No appointments found</h3>
                    <p>Check your email address or book your first visit.</p>
                    <button
                      className="secondary"
                      onClick={() => navigate("book")}
                    >
                      Book a visit
                    </button>
                  </div>
                )}
                {cursor && (
                  <button
                    className="secondary load-more"
                    disabled={historyLoading}
                    onClick={() => searchHistory(undefined, true)}
                  >
                    {historyLoading ? "Loading…" : "Load more appointments"}
                  </button>
                )}
              </>
            )}
            {((tab === "lookup" && !lookup && !lookupLoading) ||
              (tab === "history" && !searchedEmail && !historyLoading)) && (
              <div className="search-placeholder">
                <span aria-hidden="true">⌕</span>
                <p>Your appointment details will appear here.</p>
              </div>
            )}
          </section>
        )}
        <section className="how-it-works">
          <div>
            <span className="eyebrow">CARE, WITHOUT THE COMPLICATIONS</span>
            <h2>A simple path to your next visit.</h2>
          </div>
          <div>
            <span>01</span>
            <h3>Find your time</h3>
            <p>Browse doctors and available appointments.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Make it yours</h3>
            <p>Add your details and confirm your visit.</p>
          </div>
          <div>
            <span>03</span>
            <h3>You’re ready</h3>
            <p>Save your reference and calendar reminder.</p>
          </div>
        </section>
      </main>
      <footer>
        <div className="container footer-inner">
          <span className="footer-brand">✚ koya clinic</span>
          <span>Thoughtful care starts with a simple step.</span>
          <small>© {new Date().getFullYear()} Koya Clinic</small>
        </div>
      </footer>
      <dialog
        ref={cancelDialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!cancelling) setCancelId(null);
        }}
        aria-labelledby="cancel-title"
      >
        <div className="dialog-content">
          <span className="eyebrow">MANAGE YOUR VISIT</span>
          <h2 id="cancel-title">Cancel this appointment?</h2>
          <p>
            Your reserved time will be released. You can book another available
            appointment whenever you’re ready.
          </p>
          <div className="card-actions">
            <button
              className="secondary"
              autoFocus
              disabled={cancelling}
              onClick={() => setCancelId(null)}
            >
              Keep appointment
            </button>
            <button
              className="danger-button"
              disabled={cancelling}
              onClick={confirmCancel}
            >
              {cancelling ? "Cancelling…" : "Yes, cancel visit"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
