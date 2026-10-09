# Hik-pull

A self-hosted Hikvision access manager. It stores master user records in
SQLite, pushes identity and card changes to configured terminals, records each
per-device sync result, backfills the access-control event log, and streams
new events live. Non-denied events containing person data are also retained in a dedicated
attendance table and page, and queued for optional synchronization to a cloud
ingestion API.

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
sync history separately. Use **Settings** to configure live-stream startup,
history sync cadence/lookback/overlap/batch size, reconnect backoff, attendance
refresh, face-photo upload/compression limits, and cloud synchronization.
Settings are saved in SQLite and applied by the running worker. Add a device with its host/port/username/password and
attendance direction (`In`, `Out`, or `None`);
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
| `AppSettings` (`app_settings`) | Persistent collection, sync, refresh, and photo-processing settings |
| `User` | Master directory: identity, location, person type, validity, up to five cards, authentication settings and optimized face photo |
| `UserSyncLog` | Per-device success/failure history for every user sync attempt |
| `LogEvent` | Every access event seen from a device |
| `AttendanceLog` (`attendance_logs`) | Access events with person data, including device direction, original timestamp details, event type, verification method, and organization id |
| `CloudSyncOutbox` (`cloud_sync_outbox`) | One durable queue entry per attendance event awaiting cloud ingestion |
| `WorkerState` (`worker_state`) | Singleton runtime status for the attendance worker |

Employee numbers are unique in the master directory. Creating, updating,
deleting, or retrying a user sends the change to all configured devices. A
terminal failure does not discard the master record: the outcome and error are
recorded for that device, and the user can be retried from the dashboard.
Person details (including floor, room, gender, administrator flag, visit limit),
cards, authentication settings, validity, and door rights are synchronized.
Each person is assigned Door 1 with plan template 1; that plan template must
exist and allow access on each terminal. Authentication mode can inherit the
terminal setting or be selected explicitly.
Validity date-times are interpreted in the terminal's local time. Standard
validity is enabled unless the person is marked long-term effective. Terminals
only accept validity dates through
`2037-12-31 23:59`; later expiration dates are capped to that terminal limit
when synchronized. A user photo is converted server-side to a JPEG smaller
than 200 KB (maximum 190 KiB) before it is stored and sent to the terminal's
`Intelligent/FDLib` face library.
Source uploads are limited to 10 MB and 20 megapixels. Face photo enrollment
requires a face library configured on the device. Successful authentication
requires the assigned door and plan template to be enabled on that terminal.
Fingerprint enrollment can be triggered from the edit form: choose a device and
finger slot, then use that device's physical scanner. Fingerprint templates are
stored on the selected terminal and are not copied to other terminals
automatically. Device/model-specific sync failures are recorded in history.

`LogEvent` stores each event API property in its own column, including fields
from the nested `AccessControllerEvent` and `FaceRect` entities. Values retain
their API JSON types. Display labels and classifications are derived when
events are read, not written into the table. Internal event identity and
source metadata deduplicate overlapping live and history copies; duplicate
rows never overwrite the original values.

When upgrading a database that has the previous `apiData` event column, run
`npm run db:migrate-event-columns` to copy its API fields into dedicated
columns without dropping event rows, then run `npm run db:push`. The migration
only changes `LogEvent`; the other tables and their rows are preserved.

Deleting a device cascades to its events.

Live events are written from the stream loop without waiting for the write to
finish — a slow disk must never stall the reader, because the device drops a
connection that falls behind, and losing that costs far more events than one
failed insert.

Non-denied access events carrying person data are copied from both live events and history
backfills to the single indexed `attendance_logs` table. Each row stores the
device id and address (`host:port`), model, serial, event serial number, person
ID/name, card number, parsed date-time, original device timestamp, the event
type and verification method, the organization id, and the
device's `In`, `Out`, or `None` gate direction when that event was recorded.
Each new row is queued in `cloud_sync_outbox` in the same transaction.
The gate direction is a snapshot: changing a device's setting affects future
events and does not rewrite historical attendance. A private event key
deduplicates the same event seen by both ingestion paths. Attendance rows are
not deleted when a device is removed. Attendance includes person-bearing events
regardless of grant, door, or other non-denied classification. An event is
saved whenever it is not classified as denied and includes any non-empty
person ID, person name, or card number; denied authentications and events with
no person data are skipped. Previously stored attendance rows for known denied
event codes are removed. Identity is taken directly from each event, without
correlating it to neighboring events.
The server starts live collection for configured devices at startup and when
devices are added or updated. The attendance page refreshes saved records
automatically every 10 seconds.

All months share this one table rather than dynamically created monthly
tables. `dateTime` is indexed for month/date queries, and `gateDirection` is
available directly on each row for downstream attendance processing.

The Node.js server starts a single **attendance worker** at boot (from
`instrumentation.ts`), and it runs for the life of the process. The worker is
always alive; Settings pause or resume its jobs through the database, so
enabling or disabling synchronization never restarts a process and needs no
systemd/PM2/service wrapper. It has two independent jobs:

- **Hikvision sync** — keeps each terminal's shared live stream running
  (`autoStartLiveStreams`) and periodically reconciles device history. Each
  device keeps a successful-sync checkpoint (`lastHistorySyncAt`), plus the
  highest event observed (`lastEventTime`/`lastEventKey`) for inspection. The
  job overlaps the prior checkpoint by the configured minutes to catch delayed
  device events and retries a failed range without advancing the checkpoint.
- **Cloud sync** — drains the outbox (below) to the configured cloud endpoint.

Intervals (`hikvisionIntervalSecs`, `cloudIntervalSecs`) are read from the
database every cycle. The worker is a singleton within one Node.js process; if
deploying multiple app instances, expect duplicate device queries (stored
events remain deduplicated) or use a single app instance.

### Cloud synchronization

Attendance is written to the local database first, together with a
`CloudSyncOutbox` row, in one transaction. The outbox is the durable queue: the
local database is the source of truth and the cloud endpoint only ever
receives events that were already stored locally. A network outage, a disabled
cloud job, a crashed worker, or a server restart never loses an event — it
stays `PENDING` until the cloud accepts it.

Each upload batch is POSTed to `${cloudEndpoint}/attendance/batch` with
`Authorization: Bearer <token>`. Events are marked `SYNCED` only after a 2xx
response **with no per-event rejections**: if the endpoint reports events it
refused, those rows are marked `FAILED` (validation is deterministic, so
retrying cannot help) and the rest `SYNCED`. If the endpoint reports more
rejections than it names individually, the whole batch is requeued, since
re-sending is safe — the cloud deduplicates on `sourceEventKey`. On a retryable
failure the batch backs off exponentially (`cloudRetryBaseSecs`, doubling) up to
`cloudMaxAttempts`, after which rows are marked `FAILED` for inspection. Every
event carries its stable `sourceEventKey`, so a batch that a timeout made look
failed can be safely resent and deduplicated upstream. The organization is taken
from the API token, not the request body, so a token can only write to its own
organization. The API token is stored server-side and never returned to the
browser; set `CLOUD_API_TOKEN` in the environment to override the stored value.

The worker is designed to be embedded in a long-running Node server
(`next start`), which matches the deployment constraint below. It is not usable
on serverless platforms, where the process disappears between requests.

The receiving end of this protocol — a standalone Bun service that authenticates
installations and stores events in AWS MySQL — lives in [`cloud-api/`](./cloud-api).
See [`cloud-api/README.md`](./cloud-api/README.md) for deployment and its API.

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

JSON operations use the typed tRPC endpoint at `/api/trpc`:

- `devices.list`, `devices.create`, `devices.import`, `devices.update`, and
  `devices.remove` manage configured terminals.
- `devices.stopStream` stops a terminal's shared live connection.
- `events.get` loads event history for a terminal.
- `users.list`, `users.get`, `users.create`, `users.update`, `users.remove`,
  `users.sync`, and `users.enrollFingerprint` manage people and device sync.
- `attendance.list` pages through attendance events carrying person data,
  including each row's cloud `syncStatus`.
- `settings.get` and `settings.save` read and update the database-backed worker
  and collection settings.
- `worker.status` returns the operational snapshot: per-job enable state, last
  run times, outbox counts, and each device's status and cursor.

`events.get` accepts `from`, `to`, `limit`, `direction` (`in` \| `denied` \|
`door` \| `other`) and `refresh`. Reads always come from SQLite, so history
opens instantly and survives a restart. The device is queried when `refresh`
is true, or when the database has never seen this device; set `refresh` to
false to force a database-only read that never touches the terminal.

The transports that require raw streaming or binary bodies remain HTTP routes:
`GET /api/devices/{id}/stream` provides the live SSE feed, and
`GET`/`POST /api/users/{id}/photo` serves and uploads optimized photos.

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