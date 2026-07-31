# tend-mcp

An **unofficial** MCP (Model Context Protocol) server for [Tend](https://tend.com) dental — not affiliated with, endorsed by, or supported by Tend. It talks to internal API endpoints their own web app calls, discovered via browser devtools, not a published/documented API. Expect it to break without notice if Tend changes their frontend.

**Use at your own risk.** This has not been reviewed against Tend's Terms of Service — read them yourself before running this, and be ready to stop if Tend objects. Each instance authenticates as one Tend account and only ever accesses that account's own data; it is not designed or intended to access any other patient's records.

## Status: scaffold only

The MCP server wiring (tool registration, stdio transport) works. The actual Tend API calls in `src/tendClient.ts` are **stubs** — `login()` throws until real endpoints are filled in. Nothing will work until that's done.

## Setup

```bash
npm install
cp .env.example .env   # fill in your own Tend login
npm run dev             # or: npm run build && npm start
```

Point an MCP client (Claude Desktop, etc.) at it by adding to its MCP config, e.g. Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tend": {
      "command": "node",
      "args": ["/absolute/path/to/tend-mcp/dist/index.js"],
      "env": { "TEND_EMAIL": "you@example.com", "TEND_PASSWORD": "..." }
    }
  }
}
```

## Adding a real endpoint

Everything in `src/tendClient.ts` is a placeholder. To fill one in:

1. Log into [tend.com](https://tend.com) in Chrome, open DevTools → Network, filter to Fetch/XHR.
2. Perform the action you want to support (view appointments, search availability, book, etc.).
3. Export a HAR (right-click the request list → "Save all as HAR"), or just note the individual request: method, URL, headers, request body, response body.
4. **Before sharing a HAR with anyone (including an AI assistant) — scrub it.** HAR exports include cookies and auth headers verbatim; a leaked one is equivalent to leaking your login session. `.gitignore` here already excludes `*.har`, but that only helps once it's on disk — don't paste raw HAR content into a chat either without redacting `Authorization`/`Cookie`/`Set-Cookie` values first.
5. Update `login()` and the relevant method (`listAppointments`, `bookAppointment`, etc.) in `tendClient.ts` to match the real request/response shapes.

## Design constraints (please keep these)

- **One account per instance.** No multi-tenant credential store, no server-side proxy holding multiple users' logins.
- **No anti-bot evasion.** If Tend's login has MFA or bot-detection, surface it to the user (or fail loudly) rather than trying to automate around it.
- **No endpoints beyond what a real patient portal already exposes to that patient.** Don't add anything that reaches into other patients' data.
