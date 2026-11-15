import type { IncomingMessage, ServerResponse } from "node:http";

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  send(body: string): void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const url = new URL(req.url || "/", "https://localhost");
  const endpoint = url.pathname.replace(/^\/api\/?/, "");
  const allowed =
    (endpoint === "slots" && req.method === "GET") ||
    (endpoint === "bookings" && ["GET", "POST"].includes(req.method || "")) ||
    (/^bookings\/[^/]+$/.test(endpoint) &&
      ["GET", "DELETE"].includes(req.method || ""));
  res.setHeader("Cache-Control", "no-store");
  if (!allowed) return res.status(404).json({ error: "Endpoint not found" });
  const key = process.env.API_KEY;
  if (!key)
    return res
      .status(503)
      .json({
        error: "Booking service is not configured. Please try again later.",
      });
  const headers: Record<string, string> = {
    "X-API-Key": key,
    "Content-Type": "application/json",
  };
  const idempotencyKey = req.headers["idempotency-key"];
  if (typeof idempotencyKey === "string")
    headers["Idempotency-Key"] = idempotencyKey;
  try {
    const base = (
      process.env.BACKEND_URL || "https://koya-clinic-booking-k12u.onrender.com"
    ).replace(/\/$/, "");
    const response = await fetch(`${base}/${endpoint}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(55000),
    });
    const retry = response.headers.get("Retry-After");
    if (retry) res.setHeader("Retry-After", retry);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch {
    return res
      .status(502)
      .json({ error: "Unable to reach the clinic. Please try again shortly." });
  }
}
