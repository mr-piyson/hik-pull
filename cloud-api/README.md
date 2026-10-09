# hik-pull cloud ingestion API

A standalone **Bun** service that receives attendance events from one or more
`hik-pull` installations, authenticates them with a bearer token, and stores
them in an **AWS MySQL** (RDS) database. Tables are created automatically on
boot.

It is the Layer 2 counterpart to the Next.js app in the repository root, which
keeps a local SQLite outbox and POSTs batches to this API.

## Requirements

- [Bun](https://bun.sh) 1.2.21+ (uses the native `Bun.SQL` MySQL driver — no
  npm database client).
- A reachable MySQL 5.7+/8.0+ database (AWS RDS or compatible).

## Setup

```sh
cd cloud-api
cp .env.example .env      # edit with your RDS connection + tokens
bun install
bun run dev               # hot reload
# or
bun run start             # production
```

### Environment

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes* | `mysql://user:pass@host:3306/db`. `*` or use the discrete parts below. |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | yes* | Used to build the URL when `DATABASE_URL` is unset. |
| `MYSQL_TLS` | no | `1` to connect over TLS. **Recommended for AWS RDS.** |
| `MYSQL_ALLOW_PUBLIC_KEY_RETRIEVAL` | no | `1` to allow MySQL 8 `caching_sha2_password` over plain TCP. Local/dev only — it is unsafe on untrusted networks. |
| `HOSTNAME` / `PORT` | no | HTTP bind address / port. Default `0.0.0.0` / `8787`. |
| `API_TOKENS` | yes | Comma-separated bearer tokens, see below. |
| `AUTO_MIGRATE` | no | `0` to skip table creation on boot. Default on. |

`API_TOKENS` entries look like `name:token` or `name:token:organizationId`
(organization defaults to `default`). Each entry must have exactly two or three
colon-separated segments, so tokens must not contain a colon (generated tokens
are hex, so this always holds). Tokens are hashed with SHA-256 before storage,
so the database never holds a usable secret. Seeding is idempotent and runs on
every boot; removing a token from `API_TOKENS` deactivates its installation, so
the token stops authenticating. The organization is taken from the token, not
the request body — a token can only write to and read its own organization.

```sh
API_TOKENS="warehouse:8f3c…long-random…,shop:9a1b…other…:retail"
```

## API

All attendance routes require `Authorization: Bearer <token>`.

### `GET /health`
No auth. Returns `{ ok, database, time }`; `503` if MySQL is unreachable.

### `POST /attendance/batch`
The sync endpoint used by the collector.

```jsonc
{
  "events": [
    {
      "sourceEventKey": "device-id:event-id", // required, unique per device
      "organizationId": "default",
      "deviceId": "…",
      "deviceSerial": "…",
      "personId": "…",
      "personName": "…",
      "cardNo": "…",
      "gateDirection": "in",
      "eventType": "Entry",
      "verification": "face",
      "timeRaw": "2026-10-08T10:00:00+03:00",
      "occurredAt": "2026-10-08T07:00:00.000Z"
    }
  ]
}
```

Only `sourceEventKey` is mandatory. The response reports counts:

```json
{ "accepted": 3, "duplicates": 0, "rejected": 1, "received": 4,
  "errors": [ { "index": 0, "reason": "sourceEventKey is required" } ] }
```

- **Idempotent.** Events are keyed by `(organization_id, source_event_key)`, so
  re-sending a batch after a timeout results in `duplicates`, not extra rows.
- A storage failure returns `5xx` so the collector keeps the batch queued and
  retries; a permanently bad event is reported under `errors` and skipped.

### `GET /attendance`
Read back stored events (verification). Query params: `organizationId` (defaults
to the token's organization), `from`, `to`, `personId`, `deviceId`, `limit`
(≤1000), `offset`.

## Tables

- `installations` — token hashes, organization, `last_seen_at`.
- `attendance_events` — one row per event, unique on
  `(organization_id, source_event_key)` with indexes for organization/time,
  person/time, and device/time.

## Connecting the collector

In the Next.js app's Settings, set:

- **Cloud endpoint** → `https://<this-service-host>`
- **Cloud API token** → one of the `API_TOKENS` values

The app POSTs to `${cloudEndpoint}/attendance/batch` and marks events `SYNCED`
only after a 2xx response.

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Run with hot reload |
| `bun run start` | Run the server |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `bun run format` | Biome |
