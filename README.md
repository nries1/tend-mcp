# tend-mcp

An **unofficial** MCP (Model Context Protocol) server for [Tend](https://tend.com) dental — not affiliated with, endorsed by, or supported by Tend. It talks to internal API endpoints their own web app calls, discovered via browser devtools, not a published/documented API. Expect it to break without notice if Tend changes their frontend.

**Use at your own risk.** This has not been reviewed against Tend's Terms of Service — read them yourself before running this, and be ready to stop if Tend objects. Each instance authenticates as one Tend account and only ever accesses that account's own data; it is not designed or intended to access any other patient's records.

## Status

Real, verified against a live HAR capture (2026-08-01) of an actual login → pick studio → pick service → pick time → book flow: `list_studios`, `list_service_types` (static reference data — see below), `list_appointments`, `search_available_slots`, `book_appointment` (confirmed live — the capture includes a real booking that got a real Dentrix `external_id`).

**Open gap: real login.** The capture started from an already-authenticated browser session, so no login request was ever made — and separately, this particular HAR export had `Authorization`/`Cookie`/`Set-Cookie` headers stripped before the file was even written (looks like newer Chrome versions sanitize HAR exports by default), so even the authenticated requests in it don't reveal the actual session mechanism. `TendClient` currently requires `TEND_COOKIE_HEADER` — a cookie value you copy by hand from DevTools — as a stand-in. See "Filling in real login" below.

## Setup

```bash
npm install
cp .env.example .env   # fill in TEND_EMAIL and TEND_COOKIE_HEADER (see below)
npm run dev             # or: npm run build && npm start
```

Point an MCP client (Claude Desktop, etc.) at it by adding to its MCP config, e.g. Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tend": {
      "command": "node",
      "args": ["/absolute/path/to/tend-mcp/dist/index.js"],
      "env": { "TEND_EMAIL": "you@example.com", "TEND_COOKIE_HEADER": "..." }
    }
  }
}
```

## Filling in real login

`TEND_COOKIE_HEADER` is manual and short-lived (dies whenever that browser session does), which is fine for your own testing but not something to ship to anyone else. To make it real:

1. Open a **private/incognito** Chrome window (so you start logged out), open DevTools → Network → Fetch/XHR, then log into [hellotend.com](https://hellotend.com).
2. Capture the login request(s) — likely a POST somewhere under `api.hellotend.com`, possibly multi-step if there's email verification/OTP.
3. Check DevTools' **Application → Cookies** panel for `hellotend.com`/`api.hellotend.com` right after login — that tells you the actual session cookie *name* (not just the value the HAR/header capture won't show you), and whether it's `HttpOnly`/`Secure`/`SameSite`.
4. Update `TendClient`'s `request()` in `tendClient.ts` to perform that login call and manage the resulting cookie itself (axios with a cookie jar, e.g. `axios-cookiejar-support` + `tough-cookie`, since Node's `axios` doesn't do browser-style cookie jars on its own) instead of requiring `TEND_COOKIE_HEADER`.

If you export a HAR to work from: **don't assume Chrome's stripping protects you** — that behavior isn't guaranteed across versions/export methods, and response *bodies* (not just headers) still contain real PII regardless. Scrub `Authorization`/`Cookie`/`Set-Cookie` header values yourself before sharing one, and redact personal fields (name, email, phone, insurance, DOB) out of response bodies rather than assuming the tool did it for you. `.gitignore` here already excludes `*.har` so it won't land in git.

## Adding another endpoint

Same process as above (steps 1-2), then add a method to `TendClient` following the existing ones' shape (raw snake_case API fields mapped to a camelCase TS interface) and a corresponding tool in `tools.ts`.

## Design constraints (please keep these)

- **One account per instance.** No multi-tenant credential store, no server-side proxy holding multiple users' logins.
- **No anti-bot evasion.** If Tend's login has MFA or bot-detection, surface it to the user (or fail loudly) rather than trying to automate around it.
- **No endpoints beyond what a real patient portal already exposes to that patient.** Don't add anything that reaches into other patients' data.
- **`STUDIOS`/`SERVICE_TYPES` in `tendClient.ts` are a frozen snapshot, not live data.** No stable API for them was found (see the comment above `STUDIOS`) — they'll silently go stale as Tend adds/closes studios or changes services. Worth periodically re-checking against a fresh capture rather than assuming they're current.
