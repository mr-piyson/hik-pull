import { db } from "./db";
import type { NormalizedEvent } from "./types";

const JSON_MAX = 1_000;

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clamp(value: string | null, max: number): string | null {
  if (value && value.length > max) {
    return value.slice(0, max);
  }
  return value;
}

/**
 * Validate and shape one inbound event. Only `sourceEventKey` is mandatory;
 * everything else is coerced to a bounded string or null so one malformed
 * field cannot reject an otherwise good attendance record.
 *
 * The organization is taken from the authenticated installation, never from
 * the request body: a token must not be able to write into another tenant's
 * data by asserting an `organizationId`.
 */
export function normalizeEvent(
  raw: unknown,
  organizationId: string,
): { event: NormalizedEvent } | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "event must be a JSON object" };
  }
  const record = raw as Record<string, unknown>;

  const sourceEventKey = asString(record.sourceEventKey);
  if (!sourceEventKey) {
    return { error: "sourceEventKey is required" };
  }

  let occurredAt: Date | null = null;
  const rawOccurredAt = record.occurredAt;
  if (typeof rawOccurredAt === "string" && rawOccurredAt.trim()) {
    const parsed = new Date(rawOccurredAt);
    if (!Number.isNaN(parsed.getTime())) {
      occurredAt = parsed;
    }
  }

  return {
    event: {
      organizationId: clamp(organizationId, 128) ?? "default",
      sourceEventKey: clamp(sourceEventKey, 191) ?? sourceEventKey,
      deviceId: clamp(asString(record.deviceId), 191),
      deviceSerial: clamp(asString(record.deviceSerial), 191),
      personId: clamp(asString(record.personId), 191),
      personName: clamp(asString(record.personName), 255),
      cardNo: clamp(asString(record.cardNo), 191),
      gateDirection: clamp(asString(record.gateDirection), 32) ?? "none",
      eventType: clamp(asString(record.eventType), 64),
      verification: clamp(asString(record.verification), 64),
      timeRaw: clamp(asString(record.timeRaw), 64),
      occurredAt,
    },
  };
}

export type InsertResult = {
  accepted: number;
  duplicates: number;
};

/**
 * Insert a batch with a single atomic statement. The unique key
 * (organization_id, source_event_key) makes re-delivery idempotent: a duplicate
 * is a no-op (`id = id`), so a batch retried after a timeout never doubles rows.
 * `affectedRows` counts only freshly inserted rows; the remainder are
 * duplicates.
 */
export async function insertEvents(
  installationId: string,
  events: NormalizedEvent[],
): Promise<InsertResult> {
  if (events.length === 0) {
    return { accepted: 0, duplicates: 0 };
  }
  const receivedAt = new Date();
  const rows = events.map((event) => ({
    id: crypto.randomUUID(),
    organization_id: event.organizationId,
    source_event_key: event.sourceEventKey,
    device_id: event.deviceId,
    device_serial: event.deviceSerial,
    person_id: event.personId,
    person_name: event.personName,
    card_no: event.cardNo,
    gate_direction: event.gateDirection,
    event_type: event.eventType,
    verification: event.verification,
    time_raw: event.timeRaw,
    occurred_at: event.occurredAt,
    received_at: receivedAt,
    installation_id: installationId,
  }));

  const result = await db`
    INSERT INTO attendance_events ${db(rows)}
    ON DUPLICATE KEY UPDATE id = id
  `;
  const inserted = Number(result.affectedRows ?? events.length);
  const accepted = Number.isFinite(inserted) ? inserted : events.length;
  return { accepted, duplicates: Math.max(0, events.length - accepted) };
}

export type EventQuery = {
  organizationId: string;
  from?: Date | null;
  to?: Date | null;
  personId?: string | null;
  deviceId?: string | null;
  limit: number;
  offset: number;
};

export type StoredEvent = {
  id: string;
  organizationId: string;
  sourceEventKey: string;
  deviceId: string | null;
  deviceSerial: string | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: string;
  eventType: string | null;
  verification: string | null;
  timeRaw: string | null;
  occurredAt: string | null;
  receivedAt: string;
};

type StoredEventRow = {
  id: string;
  organization_id: string;
  source_event_key: string;
  device_id: string | null;
  device_serial: string | null;
  person_id: string | null;
  person_name: string | null;
  card_no: string | null;
  gate_direction: string;
  event_type: string | null;
  verification: string | null;
  time_raw: string | null;
  occurred_at: Date | null;
  received_at: Date;
};

function toIso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Read back stored events, for verification from the collector or dashboards. */
export async function listEvents(query: EventQuery): Promise<StoredEvent[]> {
  const rows = await db<StoredEventRow[]>`
    SELECT id, organization_id, source_event_key, device_id, device_serial,
           person_id, person_name, card_no, gate_direction, event_type,
           verification, time_raw, occurred_at, received_at
    FROM attendance_events
    WHERE organization_id = ${query.organizationId}
      ${query.from ? db`AND occurred_at >= ${query.from}` : db``}
      ${query.to ? db`AND occurred_at <= ${query.to}` : db``}
      ${query.personId ? db`AND person_id = ${query.personId}` : db``}
      ${query.deviceId ? db`AND device_id = ${query.deviceId}` : db``}
    ORDER BY occurred_at IS NULL, occurred_at DESC, received_at DESC
    LIMIT ${query.limit} OFFSET ${query.offset}
  `;
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    sourceEventKey: row.source_event_key,
    deviceId: row.device_id,
    deviceSerial: row.device_serial,
    personId: row.person_id,
    personName: row.person_name,
    cardNo: row.card_no,
    gateDirection: row.gate_direction,
    eventType: row.event_type,
    verification: row.verification,
    timeRaw: row.time_raw,
    occurredAt: toIso(row.occurred_at),
    receivedAt: toIso(row.received_at) ?? new Date().toISOString(),
  }));
}

export { JSON_MAX };
