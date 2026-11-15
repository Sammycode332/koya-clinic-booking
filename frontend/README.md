## Patient portal improvements

The responsive portal includes doctor/date filtering, available-time filtering,
booking references, calendar downloads, lookup, paginated history, and cancellation.
Dates and times use the visitor's local timezone, which is displayed above the slots.
Expired slots cannot be selected. Retrying an unchanged booking within the page session
reuses its idempotency key. No patient details are saved in browser storage.

### Frontend development and checks

Use Node.js 22.18+ and run from `frontend`:

```sh
npm ci
npm run dev
npm run build
npm test
```

For local development, start the FastAPI backend separately. Vite reads `API_KEY`
and optional `BACKEND_URL` from `backend/.env` and attaches the key through its server proxy.
Never put the secret into a `VITE_` environment variable.

### Vercel configuration

Set the project root to `frontend`, use the Vite preset, build with `npm run build`,
and serve `dist`. Configure **API_KEY** as a server-side environment variable matching
Render's key. Optionally set **BACKEND_URL** (defaults to the existing Render deployment).
Redeploy after changing environment variables.

`api/[...path].ts` forwards the supported patient routes and keeps authentication
server-side. The administrative `/reset` endpoint is deliberately not exposed through
this public proxy. The Vercel rewrite excludes API routes from the SPA fallback.
See [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

The Node tests mock upstream calls: they never create or cancel real appointments.
The existing backend test suite resets database contents; run it only against an isolated
test database, not production.
