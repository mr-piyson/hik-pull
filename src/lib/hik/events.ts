import type { AccessDirection, AccessEvent } from "./types";

/**
 * `majorEventType` labels. Observed on DS-K2xxx / DS-K1T6xx terminals.
 */
const MAJOR_LABELS: Record<number, string> = {
  0: "alarm",
  1: "exception",
  2: "operation",
  3: "event",
  5: "ungrouped",
};

/**
 * `subEventType` labels — BEST EFFORT.
 *
 * The documented set is firmware-dependent, and face terminals in particular
 * emit face-comparison codes that are not uniformly published across the
 * DS-K1T671 series. Anything unrecognised deliberately falls through to
 * `other` with its numeric code preserved and displayed, so a real device can
 * be surveyed before the map is tightened. Do not silently widen these
 * buckets to make events look categorised.
 */
const MINOR_LABELS: Record<number, string> = {
  1: "card valid",
  2: "card invalid",
  6: "card - outside allowed period",
  7: "card - wrong password",
  8: "card expired",
  9: "card not registered",
  10: "card blocked",
  11: "card - wrong reader",
  12: "card authentication failed",
  21: "lock opened",
  22: "lock closed",
  38: "fingerprint valid",
  39: "fingerprint invalid",
  75: "door opened",
  76: "door closed",
  81: "door held open",
  82: "door forced open",
};

/**
 * Codes whose meanings come from the Hikvision SDK `NET_DVR_ACS_ALARM_INFO`
 * minor table (major 5 / `MAJOR_EVENT`):
 *
 *   0x15 / 21  MINOR_LOCK_OPEN                  lock opened
 *   0x16 / 22  MINOR_LOCK_CLOSE                 lock closed
 *   0x26 / 38  MINOR_FINGERPRINT_COMPARE_PASS   fingerprint compare passed
 *   0x27 / 39  MINOR_FINGERPRINT_COMPARE_FAIL   fingerprint compare failed
 *   0x4b / 75  MINOR_FACE_VERIFY_PASS           face verify passed
 *   0x4c / 76  MINOR_FACE_VERIFY_FAIL           face verify failed
 *
 * A DS-K1T671MF (V3.7.0) files 38 under `minorException` in
 * `/ISAPI/AccessControl/AcsEvent/capabilities`, but the SDK and the payloads
 * themselves (38 carries the person id/name, 39 does not) show 38 is a
 * successful fingerprint match. It must not be treated as a denial or the
 * attendance log loses every fingerprint punch.
 */
export const DENIED_MINORS = new Set([2, 6, 7, 8, 9, 10, 11, 12, 39]);
const DOOR_MINORS = new Set([21, 22, 75, 76, 81, 82]);
/** Known-good authentications. */
const GRANTED_MINORS = new Set([1, 38]);

export function labelForMajor(major: number): string {
  return MAJOR_LABELS[major] ?? `major ${major}`;
}

export function labelForMinor(minor: number): string {
  const known = MINOR_LABELS[minor];
  return known ?? `event ${minor}`;
}

export function classify(major: number, minor: number): AccessDirection {
  if (DENIED_MINORS.has(minor)) {
    return "denied";
  }
  if (DOOR_MINORS.has(minor)) {
    return "door";
  }
  if (GRANTED_MINORS.has(minor)) {
    return "in";
  }
  // Face-comparison results dominate traffic on these terminals. Rather than
  // guessing, treat a face comparison as an unclassified event.
  void major;
  return "other";
}

export const DIRECTION_LABELS: Record<AccessDirection, string> = {
  in: "Granted",
  denied: "Denied",
  door: "Door",
  other: "Other",
};

/**
 * ISAPI wraps an alert in its root element, so the parsed payload arrives as
 * `{ EventNotificationAlert: { eventType, AccessControllerEvent, ... } }`.
 * Descend through a lone object wrapper; already-unwrapped payloads pass
 * through unchanged.
 */
export function unwrapRoot(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(payload);
  if (keys.length === 1) {
    const only = payload[keys[0]];
    if (typeof only === "object" && only !== null && !Array.isArray(only)) {
      return only as Record<string, unknown>;
    }
  }
  return payload;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  // `cardReaderNo` arrives as a JSON *string* on some firmware revisions.
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * `currentVerifyMode` is a plain string on the history endpoint but an entity
 * on the live stream, e.g. `{ face: true }`. Coerce both to a comma-joined
 * list of the methods the device reports as used, so the value stored on an
 * attendance row is meaningful regardless of which path saw the event.
 */
function asVerifyMode(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const methods = Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true || enabled === "true")
      .map(([name]) => name);
    return methods.length > 0 ? methods.join(",") : null;
  }
  return null;
}

/**
 * Normalize one chunk from `/ISAPI/Event/notification/alertStream`.
 * Returns `null` for chunks that are not access-control events.
 */
export function normalizeLiveChunk(
  deviceId: string,
  payload: Record<string, unknown>,
  rawPayload = JSON.stringify(payload),
): AccessEvent | null {
  const chunk = unwrapRoot(payload);
  if (chunk.eventType !== "AccessControllerEvent") {
    return null;
  }
  const ace = chunk.AccessControllerEvent;
  if (typeof ace !== "object" || ace === null) {
    return null;
  }
  const raw = ace as Record<string, unknown>;

  const major = asNumber(raw.majorEventType);
  const minor = asNumber(raw.subEventType);
  if (major === null || minor === null) {
    return null;
  }

  const serialNo = asString(raw.serialNo);
  const time = asString(chunk.dateTime) || null;

  return {
    id:
      serialNo || `${deviceId}:${time ?? ""}:${minor}:${asString(raw.cardNo)}`,
    deviceId,
    rawPayload,
    time,
    direction: classify(major, minor),
    label: labelForMinor(minor),
    major,
    minor,
    name: asString(raw.name),
    employeeNo: asString(raw.employeeNoString),
    cardNo: asString(raw.cardNo),
    readerNo: asNumber(raw.cardReaderNo),
    serialNo: serialNo || null,
    verifyMode: asVerifyMode(raw.currentVerifyMode),
    source: "live",
  };
}

/**
 * Normalize one item from a `POST /ISAPI/AccessControl/AcsEvent` page.
 * Items missing `serialNo`, or with non-coercible codes, are dropped: one
 * malformed row must not abort the rest of the page.
 */
export function normalizeHistoryItem(
  deviceId: string,
  item: Record<string, unknown>,
): AccessEvent | null {
  const serialNo = asString(item.serialNo);
  const major = asNumber(item.major);
  const minor = asNumber(item.minor);
  if (!serialNo || major === null || minor === null) {
    return null;
  }

  return {
    id: serialNo,
    deviceId,
    rawPayload: JSON.stringify(item),
    time: asString(item.time) || null,
    direction: classify(major, minor),
    label: labelForMinor(minor),
    major,
    minor,
    name: asString(item.name),
    employeeNo: asString(item.employeeNoString),
    cardNo: asString(item.cardNo),
    readerNo: asNumber(item.cardReaderNo),
    serialNo,
    verifyMode: asVerifyMode(item.currentVerifyMode),
    source: "backfill",
  };
}

/**
 * ISAPI wants local wall-clock time with an explicit offset, e.g.
 * `2025-01-27T08:44:18+00:00`. The terminal interprets these in its own
 * local time, so we send local components rather than UTC — sending UTC would
 * silently shift the window on every device that is not on UTC.
 */
export function toIsapiTime(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  // Offset is inverted: local ahead of UTC => "+".
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${offsetHours}:${offsetRemainder}`
  );
}
