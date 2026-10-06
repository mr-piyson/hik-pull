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
  21: "fingerprint invalid",
  22: "fingerprint valid",
  38: "card invalid",
  39: "card invalid",
  75: "door opened",
  76: "door closed",
  81: "door held open",
  82: "door forced open",
};

/**
 * 38 and 39 are listed by a DS-K1T671MF (V3.7.0) under `minorException` for
 * major 5 in `/ISAPI/AccessControl/AcsEvent/capabilities`, which is the
 * device's own statement that they are refusals rather than grants.
 */
const DENIED_MINORS = new Set([2, 6, 7, 8, 9, 10, 11, 12, 21, 38, 39]);
const DOOR_MINORS = new Set([75, 76, 81, 82]);
/** Known-good authentications. Face-comparison codes are firmware-specific
 * and therefore intentionally absent — they land in `other` until surveyed. */
const GRANTED_MINORS = new Set([1, 22]);

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
 * Normalize one chunk from `/ISAPI/Event/notification/alertStream`.
 * Returns `null` for chunks that are not access-control events.
 */
export function normalizeLiveChunk(
  deviceId: string,
  payload: Record<string, unknown>,
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
