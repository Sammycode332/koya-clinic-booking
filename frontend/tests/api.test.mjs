import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/[...path].ts";
import {
  createBooking,
  getSlots,
  getBookingsByEmail,
  ApiError,
} from "../src/services/api.ts";
const originalFetch = globalThis.fetch;
const originalKey = process.env.API_KEY;
const originalBackend = process.env.BACKEND_URL;
const response = () => ({
  code: 200,
  headers: {},
  data: undefined,
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(code) {
    this.code = code;
    return this;
  },
  json(data) {
    this.data = data;
  },
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = originalKey;
  if (originalBackend === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalBackend;
});
test("proxy blocks reset and unsupported methods before accessing upstream", async () => {
  globalThis.fetch = () => {
    throw new Error("Must not call upstream");
  };
  for (const [url, method] of [
    ["/api/reset", "POST"],
    ["/api/slots", "DELETE"],
    ["/api/bookings/id", "POST"],
  ]) {
    const res = response();
    await handler({ url, method, headers: {} }, res);
    assert.equal(res.code, 404);
  }
});
test("proxy reports missing configuration without exposing secrets", async () => {
  delete process.env.API_KEY;
  const res = response();
  await handler({ url: "/api/slots", method: "GET", headers: {} }, res);
  assert.equal(res.code, 503);
});
test("proxy forwards auth, idempotency, query and retry-after without caching", async () => {
  process.env.API_KEY = "test-key";
  process.env.BACKEND_URL = "https://clinic.example/";
  const payload = { slot_id: "s1", name: "Test", email: "test@example.com" };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://clinic.example/bookings?limit=5");
    assert.equal(options.headers["X-API-Key"], "test-key");
    assert.equal(options.headers["Idempotency-Key"], "retry-key");
    assert.deepEqual(JSON.parse(options.body), payload);
    return new Response(JSON.stringify({ error: "Slow down" }), {
      status: 429,
      headers: { "Retry-After": "20" },
    });
  };
  const res = response();
  await handler(
    {
      url: "/api/bookings?limit=5",
      method: "POST",
      headers: { "idempotency-key": "retry-key" },
      body: payload,
    },
    res,
  );
  assert.equal(res.code, 429);
  assert.equal(res.headers["Retry-After"], "20");
  assert.equal(res.headers["Cache-Control"], "no-store");
});
test("proxy handles upstream outages as JSON", async () => {
  process.env.API_KEY = "test-key";
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const res = response();
  await handler({ url: "/api/slots", method: "GET", headers: {} }, res);
  assert.equal(res.code, 502);
  assert.match(res.data.error, /try again/i);
});
test("client reports non-JSON failures with a useful message", async () => {
  globalThis.fetch = async () =>
    new Response("<html>bad gateway</html>", { status: 502 });
  await assert.rejects(getSlots(), /request could not be completed/);
});
test("client preserves booking key and reports rate limit wait", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers["Idempotency-Key"], "stable-key");
    assert.equal(options.headers["X-API-Key"], undefined);
    return new Response(JSON.stringify({ error: "Too many attempts." }), {
      status: 429,
      headers: { "Retry-After": "12" },
    });
  };
  await assert.rejects(
    createBooking(
      { slot_id: "s1", name: "Test", email: "test@example.com" },
      "stable-key",
    ),
    (err) =>
      err instanceof ApiError &&
      err.status === 429 &&
      err.message.includes("12 seconds"),
  );
});
test("history encodes emails and opaque cursors independently", async () => {
  globalThis.fetch = async (url) => {
    const query = new URL(url, "https://clinic.example").searchParams;
    assert.equal(query.get("email"), "a+b@example.com");
    assert.equal(query.get("cursor"), "a+b/c==");
    return Response.json({ bookings: [], next_cursor: null });
  };
  assert.deepEqual(await getBookingsByEmail("a+b@example.com", "a+b/c=="), {
    bookings: [],
    next_cursor: null,
  });
});
