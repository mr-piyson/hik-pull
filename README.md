# Hik-pull

A self-hosted Hikvision access manager. It stores master user records in
SQLite, pushes identity and card changes to configured terminals, records each
per-device sync result, backfills the access-control event log, and streams
new events live.

Built and tested against a DS-K1T671MF-class face/card terminal.

## What "in/out" means here

These terminals do not report a literal entry/exit direction. Each event is an
**authentication attempt** at a reader, so the log classifies every event as one
of:

- **granted** – access allowed
- **denied** – access refused
- **door** – door opened / forced / held open
- **unknown** – a code this build does not recognise yet

The raw `major`/`minor` pair is always shown so a misclassification is obvious
and fixable. Mappings live in `src/lib/hik/events.ts`.

## Requirements

- Node.js 20+
- Network reachability to the terminal (same LAN/VLAN)
- An ISAPI account with access-control read permission

## Running

```bash
npm install
npm run db:push # create or update the local SQLite schema
npm run dev   # http://localhost:3000
```

For production:

```bash
npm run build
npm run start
```

Open the multi-page dashboard to manage devices, people, access events, and
sync history separately. Add a device with its host/port/username/password;
the credentials are validated immediately by fetching
`/ISAPI/System/deviceInfo`.

Devices, credentials and the event log are stored in a SQLite database at
`.data/hik.db`, managed by Prisma. Passwords never leave the server: API
responses expose only a `hasPassword` boolean.

`npm install` generates the Prisma client. Run `npm run db:push` after
installing or after schema changes to add/update the SQLite tables. To put the
database elsewhere, set `DATABASE_URL` (e.g.
`DATABASE_URL="file:/var/lib/hik/hik.db"`).

## Database

| Table | Holds |
| --- | --- |
| `Device` | One row per terminal: address, credentials, label |
| `User` | Master directory: employee number, name, card number, user type, validity, optimized face photo |
| `UserSyncLog` | Per-device success/failure history for every user sync attempt |
| `LogEvent` | Every access event seen from a device |

Employee numbers are unique in the master directory. Creating, updating,
deleting, or retrying a user sends the change to all configured devices. A
terminal failure does not discard the master record: the outcome and error are
recorded for that device, and the user can be retried from the dashboard.
Identity, card number, validity, and door rights are synchronized. Each person
is assigned Door 1 with plan template 1; that plan template must exist and
allow access on each terminal. Authentication mode inherits the terminal
setting (`userVerifyMode` is left at its device default).
Validity date-times are interpreted in the terminal's local time and enabled
for synced users. Terminals only accept validity dates through
`2037-12-31 23:59`; later expiration dates are capped to that terminal limit
when synchronized. A user photo is converted server-side to a JPEG smaller
than 200 KB (maximum 190 KiB) before it is stored and sent to the terminal's
`Intelligent/FDLib` face library.
Source uploads are limited to 10 MB and 20 megapixels. Face photo enrollment
requires a face library configured on the device. Successful authentication
requires the assigned door and plan template to be enabled on that terminal.
Device/model-specific sync failures are recorded in history.

`LogEvent` is keyed by `(deviceId, id)`, where `id` is the event id the device
itself reports. That identity is what makes the two independent ways we learn
about an event — the live stream and the history search — collapse into one row
instead of two. Rows are only ever inserted; a duplicate never overwrites.

`time` is stored exactly as the terminal wrote it, including its `+03:00`
offset, because that is what gets displayed. `timeMs` is the same instant as
epoch milliseconds, used for range filters and ordering: the verbatim string
carries a local offset and so cannot be compared against the UTC bounds the
browser sends.

Deleting a device cascades to its events.

Live events are written from the stream loop without waiting for the write to
finish — a slow disk must never stall the reader, because the device drops a
connection that falls behind, and losing that costs far more events than one
failed insert.

Useful commands:

```bash
npm run db:push      # apply the Prisma schema to SQLite
npm run db:studio    # browse the data
```

## Terminal output

The server logs everything it does to stdout, so `npm run dev` doubles as a
live event console:

```
10:32:11.104  BACKFILL  Front door (172.18.12.17:80)  34 events  denied=16 in=3 door=2  (17 unique, 17 new)
10:32:11.110  INFO      Front door (172.18.12.17:80)  connecting to http://172.18.12.17:80 (attempt 1)
10:32:19.111  WARN      Front door (172.18.12.17:80)  no response from the device yet — this model can take ~20-25s to open the event stream
10:32:36.113  LIVE      Front door (172.18.12.17:80)  stream open, boundary=MIME_boundary, listening for events
10:32:41.220  EVENT     Front door (172.18.12.17:80)  DENIED   fingerprint invalid  (major 5 / minor 21)
 · time=2026-10-06T10:32:41+03:00 name=John Doe card=1234567890 employee=E8001 reader=2 serial=88 source=live id=88
10:32:41.224  SKIP      Front door (172.18.12.17:80)  not an access event (application/json): eventType=videoloss eventState=inactive
```

- **EVENT** — every live access event, with all fields the terminal reported.
  Direction is colour-coded: green `IN`, red `DENIED`, yellow `DOOR`, magenta `OTHER`.
- **SKIP** — a payload that was not an access event (video loss, a channel
  snapshot). Logged with the reason so a missing event is never unexplained.
- **BACKFILL** — one summary line per history query. Set `HIK_LOG_BACKFILL=1`
  to also print each historical event in full.
- **INFO / WARN / LIVE / ERROR** — connection lifecycle.

Colour is emitted only when stdout is a TTY, and is suppressed when
`NO_COLOR` is set.

## Deployment constraint

**This must run somewhere that can reach the device and write to local disk.**
It is intended for a host on the same network as the terminal.

This dashboard currently has no application login. Restrict network access to
trusted operators and use HTTPS when exposing it beyond a trusted local
network. Device passwords are stored in SQLite and never returned by the API.

Vercel is not a compatible target: serverless functions cannot reach RFC1918
addresses such as `192.168.1.64`, and the filesystem is ephemeral, so stored
credentials would vanish on every deploy. To use Vercel you would need an
on-prem collector plus a tunnel and a real database.

## How it works

| Concern | Approach |
| --- | --- |
| Auth | HTTP Digest (MD5), stateless |
| History | `POST /ISAPI/AccessControl/AcsEvent`, paginated by device-advertised `maxResults` |
| Live | `GET /ISAPI/Event/notification/alertStream`, framed as `multipart/mixed` |
| Fan-out | One upstream connection per device, fanned out to browsers over SSE |
| Reconnect | Exponential backoff on stream failure |
| Storage | SQLite via Prisma, at `.data/hik.db` |
| Secrets | Server-side only; never serialised to the client |

Digest auth is stateless on purpose: some firmware issues single-use nonces, so
a cached challenge cannot be replayed. Every request re-authenticates.

Multipart parsing is byte-oriented and releases a part as soon as it is
complete — via `Content-Length` when present, otherwise on a short idle timeout
— so the newest event is never withheld waiting for the *next* one.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/devices` | List devices (no passwords) |
| `POST` | `/api/devices` | Add and validate a device |
| `PUT` | `/api/devices` | Bulk import |
| `GET` | `/api/devices/{id}` | Device detail |
| `PATCH` | `/api/devices/{id}` | Update fields |
| `DELETE` | `/api/devices/{id}` | Remove device (and its events) |
| `GET` | `/api/devices/{id}/events` | Event log for a time range |
| `GET` | `/api/devices/{id}/stream?action=start\|stop` | Control live stream |
| `GET` | `/api/devices/{id}/stream` | SSE event feed |

`/api/devices/{id}/events` accepts `from`, `to`, `limit`, `direction`
(`in` \| `denied` \| `door` \| `other`) and `refresh`. Reads always come from
SQLite, so history opens instantly and survives a restart. The device is
queried only when `refresh=1`, or when the database has never seen this device
— pass `refresh=0` to force a database-only read that never touches the
terminal.

## Known limitations

- HTTPS with self-signed certificates is not supported yet; use HTTP port 80.
- Only IPv4 and hostnames are accepted for the device address.
- A history sweep walks every major the device advertises, so wide event-type
  sets cost one request per major. The device also returns an event once for
  the sweep's `major=0` wildcard and again for its own major, so the raw fetch
  is routinely about twice the number of real events. `BACKFILL` logs both
  numbers, and the duplicate is stored once.
- Opening the event stream can take **~20-25 seconds** on a DS-K1T671MF — the
  device buffers before sending its first byte. This is normal; a `WARN` line
  is printed at 8s so it does not read as a hang.
- The device allows only a few concurrent event-stream sessions. If every slot
  is taken (often by the device's own web UI, or a previous run that did not
  close cleanly) it answers `HTTP 404` with `subStatusCode: deployExceedMax`.
  The stream retries with backoff until a slot frees.