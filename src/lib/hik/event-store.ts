import { Prisma } from "@/generated/prisma/client";
import { recordAttendanceEvents } from "./attendance-store";
import { prisma } from "./db";
import { normalizeHistoryItem, normalizeLiveChunk, unwrapRoot } from "./events";
import { looksLikeXml, xmlToJson } from "./multipart";
import type { AccessDirection, AccessEvent, DeviceRecord } from "./types";

/** SQLite caps bound parameters per statement; stay well under it. */
const INSERT_CHUNK = 200;

const HISTORY_FIELDS = {
  major: "major",
  minor: "minor",
  time: "time",
  doorNo: "doorNo",
  serialNo: "serialNo",
  currentVerifyMode: "currentVerifyMode",
  mask: "mask",
  cardNo: "cardNo",
  cardType: "cardType",
  name: "name",
  cardReaderNo: "cardReaderNo",
  employeeNoString: "employeeNoString",
  userType: "userType",
  pictureURL: "pictureURL",
  remoteHostAddr: "remoteHostAddr",
} as const satisfies Record<string, keyof Prisma.LogEventCreateManyInput>;

const FACE_RECT_FIELDS = {
  height: "faceRectHeight",
  width: "faceRectWidth",
  x: "faceRectX",
  y: "faceRectY",
} as const satisfies Record<string, keyof Prisma.LogEventCreateManyInput>;

const LIVE_FIELDS = {
  eventType: "eventType",
  dateTime: "dateTime",
  eventState: "eventState",
  eventDescription: "eventDescription",
  deviceID: "deviceID",
  activePostCount: "activePostCount",
  ipAddress: "ipAddress",
  remoteHostAddr: "remoteHostAddr",
  portNo: "portNo",
  protocol: "protocol",
  macAddress: "macAddress",
  channelID: "channelID",
} as const satisfies Record<string, keyof Prisma.LogEventCreateManyInput>;

const LIVE_ACCESS_FIELDS = {
  deviceName: "accessDeviceName",
  majorEventType: "accessMajorEventType",
  subEventType: "accessSubEventType",
  cardNo: "accessCardNo",
  cardType: "accessCardType",
  name: "accessName",
  cardReaderKind: "accessCardReaderKind",
  cardReaderNo: "accessCardReaderNo",
  doorNo: "accessDoorNo",
  verifyNo: "accessVerifyNo",
  employeeNoString: "accessEmployeeNoString",
  serialNo: "accessSerialNo",
  userType: "accessUserType",
  currentVerifyMode: "accessCurrentVerifyMode",
  currentEvent: "accessCurrentEvent",
  frontSerialNo: "accessFrontSerialNo",
  attendanceStatus: "accessAttendanceStatus",
  label: "accessLabel",
  statusValue: "accessStatusValue",
  mask: "accessMask",
  helmet: "accessHelmet",
  purePwdVerifyEnable: "accessPurePwdVerifyEnable",
} as const satisfies Record<string, keyof Prisma.LogEventCreateManyInput>;

type EventRow = Prisma.LogEventGetPayload<Record<string, never>>;
type EventCreate = Prisma.LogEventCreateManyInput;
type JsonColumn = Prisma.InputJsonValue | typeof Prisma.JsonNull;

function jsonColumn(value: unknown): JsonColumn {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  // The column is JSON, so keep structured values verbatim instead of failing
  // the whole batch: firmware differs on which fields are scalars.
  if (Array.isArray(value) || typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }
  return Prisma.JsonNull;
}

/**
 * Devices add fields between firmware revisions. A field with no column is
 * dropped rather than rejected — one unknown field must never block an entire
 * history window. Each field name is reported once so a survey can still spot
 * schema drift.
 */
const warnedUnknownFields = new Set<string>();

function warnUnknownFields(
  scope: string,
  deviceId: string,
  fields: string[],
): void {
  const fresh = fields.filter(
    (field) => !warnedUnknownFields.has(`${scope}:${field}`),
  );
  if (fresh.length === 0) {
    return;
  }
  for (const field of fresh) {
    warnedUnknownFields.add(`${scope}:${field}`);
  }
  console.warn(
    `[events] Ignoring unmapped ${scope} field(s) from device ${deviceId}: ${fresh.join(", ")}.`,
  );
}

function recordValue(
  record: Record<string, unknown>,
  key: string,
  columns: Record<string, JsonColumn>,
  column: keyof EventCreate,
): void {
  if (Object.hasOwn(record, key)) {
    columns[column] = jsonColumn(record[key]);
  }
}

export function mapApiEventFields(
  deviceId: string,
  id: string,
  source: AccessEvent["source"],
  rawPayload: string,
): EventCreate {
  if (rawPayload === undefined) {
    throw new Error(`Event ${deviceId}/${id} has no original API payload.`);
  }

  let value: unknown;
  try {
    value = looksLikeXml(rawPayload)
      ? xmlToJson(rawPayload)
      : JSON.parse(rawPayload);
  } catch (error) {
    throw new Error(
      `Could not read original API payload for event ${deviceId}/${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `API payload for event ${deviceId}/${id} is not an object.`,
    );
  }

  const payload = unwrapRoot(value as Record<string, unknown>);
  const columns: Record<string, JsonColumn> = {};

  if (source === "backfill") {
    for (const [field, column] of Object.entries(HISTORY_FIELDS)) {
      recordValue(payload, field, columns, column);
    }
    const faceRect = payload.FaceRect;
    if (
      typeof faceRect === "object" &&
      faceRect !== null &&
      !Array.isArray(faceRect)
    ) {
      for (const [field, column] of Object.entries(FACE_RECT_FIELDS)) {
        recordValue(
          faceRect as Record<string, unknown>,
          field,
          columns,
          column,
        );
      }
    }
    const knownFields = new Set([...Object.keys(HISTORY_FIELDS), "FaceRect"]);
    const unknownFields = Object.keys(payload).filter(
      (field) => !knownFields.has(field),
    );
    if (unknownFields.length > 0) {
      warnUnknownFields("history", deviceId, unknownFields);
    }
  } else {
    for (const [field, column] of Object.entries(LIVE_FIELDS)) {
      recordValue(payload, field, columns, column);
    }
    const accessEvent = payload.AccessControllerEvent;
    if (
      typeof accessEvent === "object" &&
      accessEvent !== null &&
      !Array.isArray(accessEvent)
    ) {
      const access = accessEvent as Record<string, unknown>;
      for (const [field, column] of Object.entries(LIVE_ACCESS_FIELDS)) {
        recordValue(access, field, columns, column);
      }
      const unknownAccessFields = Object.keys(access).filter(
        (field) => !Object.hasOwn(LIVE_ACCESS_FIELDS, field),
      );
      if (unknownAccessFields.length > 0) {
        warnUnknownFields(
          "live AccessControllerEvent",
          deviceId,
          unknownAccessFields,
        );
      }
    }
    const knownFields = new Set([
      ...Object.keys(LIVE_FIELDS),
      "AccessControllerEvent",
    ]);
    const unknownFields = Object.keys(payload).filter(
      (field) => !knownFields.has(field),
    );
    if (unknownFields.length > 0) {
      warnUnknownFields("live", deviceId, unknownFields);
    }
  }

  // Every dynamic column key comes from the schema-checked API field maps above.
  return {
    id,
    deviceId,
    source,
    ...columns,
  } as EventCreate;
}

function rawValue(row: EventRow, column: keyof EventRow): unknown | undefined {
  const value = row[column];
  return value === null ? undefined : value;
}

function addMappedFields(
  row: EventRow,
  payload: Record<string, unknown>,
  fields: Record<string, keyof EventRow>,
): void {
  for (const [field, column] of Object.entries(fields)) {
    const value = rawValue(row, column);
    if (value !== undefined) {
      payload[field] = value;
    }
  }
}

function parseEvent(row: EventRow): AccessEvent {
  const payload: Record<string, unknown> = {};
  if (row.source === "backfill") {
    addMappedFields(row, payload, HISTORY_FIELDS);
    const faceRect: Record<string, unknown> = {};
    addMappedFields(row, faceRect, FACE_RECT_FIELDS);
    if (Object.keys(faceRect).length > 0) {
      payload.FaceRect = faceRect;
    }
    const event = normalizeHistoryItem(row.deviceId, payload);
    if (!event) {
      throw new Error(
        `Stored history API fields for ${row.deviceId}/${row.id} could not be interpreted.`,
      );
    }
    const { rawPayload: _rawPayload, ...displayEvent } = event;
    return displayEvent;
  }

  addMappedFields(row, payload, LIVE_FIELDS);
  const accessEvent: Record<string, unknown> = {};
  addMappedFields(row, accessEvent, LIVE_ACCESS_FIELDS);
  if (Object.keys(accessEvent).length > 0) {
    payload.AccessControllerEvent = accessEvent;
  }
  const event = normalizeLiveChunk(row.deviceId, payload);
  if (!event) {
    throw new Error(
      `Stored live API fields for ${row.deviceId}/${row.id} could not be interpreted.`,
    );
  }
  const { rawPayload: _rawPayload, ...displayEvent } = event;
  return displayEvent;
}

/**
 * Persist each original API event field in its own column. Derived display
 * fields are computed for clients and attendance, not stored in LogEvent.
 */
export async function recordEvents(
  events: AccessEvent[],
  device: DeviceRecord,
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }
  // A single unreadable payload must not abort the whole batch (and, for
  // history, must not block the checkpoint). Skip it loudly and keep going.
  const rows: EventCreate[] = [];
  for (const event of events) {
    try {
      if (event.rawPayload === undefined) {
        throw new Error("no original API payload");
      }
      rows.push(
        mapApiEventFields(device.id, event.id, event.source, event.rawPayload),
      );
    } catch (error) {
      console.error(
        `[events] Skipping unreadable event ${event.deviceId}/${event.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    inserted += await storeChunk(rows.slice(index, index + INSERT_CHUNK));
  }
  try {
    await recordAttendanceEvents(device, events);
  } catch (error) {
    // Rethrow so callers keep the history checkpoint behind these events and
    // replay the window. LogEvent rows are deduped on retry, so the sweep is
    // safely idempotent; swallowing here would lose the attendance rows.
    console.error(
      `[attendance] Could not save events with person data for ${device.host}:${device.port}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
  return inserted;
}

async function storeChunk(chunk: EventCreate[]): Promise<number> {
  const byDevice = new Map<string, Map<string, EventCreate>>();
  for (const row of chunk) {
    let rows = byDevice.get(row.deviceId);
    if (!rows) {
      rows = new Map();
      byDevice.set(row.deviceId, rows);
    }
    rows.set(row.id, row);
  }

  return prisma.$transaction(
    async (tx) => {
      let inserted = 0;
      for (const [deviceId, rowsById] of byDevice) {
        const rows = [...rowsById.values()];
        const existing = await tx.logEvent.findMany({
          where: { deviceId, id: { in: rows.map((row) => row.id) } },
          select: { id: true },
        });
        const known = new Set(existing.map((row) => row.id));
        const fresh = rows.filter((row) => !known.has(row.id));
        if (fresh.length > 0) {
          await tx.logEvent.createMany({ data: fresh });
        }
        inserted += fresh.length;
      }
      return inserted;
    },
    { timeout: 30_000 },
  );
}

export async function countEvents(deviceId: string): Promise<number> {
  return prisma.logEvent.count({ where: { deviceId } });
}

export type EventQuery = {
  deviceId: string;
  /** Device-reported time window; either bound is optional. */
  from?: Date;
  to?: Date;
  direction?: AccessDirection;
  limit?: number;
};

export async function getEvent(
  deviceId: string,
  id: string,
): Promise<AccessEvent | null> {
  const row = await prisma.logEvent.findUnique({
    where: { deviceId_id: { deviceId, id } },
  });
  return row ? parseEvent(row) : null;
}

export async function queryEvents(query: EventQuery): Promise<AccessEvent[]> {
  const rows = await prisma.logEvent.findMany({
    where: { deviceId: query.deviceId },
    orderBy: { receivedAt: "desc" },
  });
  const from = query.from?.getTime();
  const to = query.to?.getTime();
  const events = rows
    .map((row) => ({ row, event: parseEvent(row) }))
    .filter(({ event }) => {
      if (query.direction && event.direction !== query.direction) {
        return false;
      }
      const time = event.time ? Date.parse(event.time) : Number.NaN;
      if (from !== undefined && (!Number.isFinite(time) || time < from)) {
        return false;
      }
      if (to !== undefined && (!Number.isFinite(time) || time > to)) {
        return false;
      }
      return true;
    });

  events.sort((left, right) => {
    const leftTime = left.event.time ? Date.parse(left.event.time) : Number.NaN;
    const rightTime = right.event.time
      ? Date.parse(right.event.time)
      : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      return rightTime - leftTime;
    }
    if (Number.isFinite(leftTime)) {
      return -1;
    }
    if (Number.isFinite(rightTime)) {
      return 1;
    }
    return right.row.receivedAt.getTime() - left.row.receivedAt.getTime();
  });

  return events.slice(0, query.limit).map(({ event }) => event);
}
