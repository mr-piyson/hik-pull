import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDeviceInfo } from "./client";
import { DEFAULT_ORGANIZATION_ID } from "./constants";
import { prisma } from "./db";
import { listStoredEvents } from "./event-store";
import { DENIED_MINORS } from "./events";
import { getDevice, getDeviceMetadata, saveDeviceMetadata } from "./store";
import {
  type AccessEvent,
  type DeviceRecord,
  type GateDirection,
  parseGateDirection,
} from "./types";

const INSERT_CHUNK = 200;

/** Outbox states. Kept as strings because SQLite has no enums. */
export type CloudSyncStatus = "PENDING" | "SYNCED" | "FAILED";

type AttendanceCleanupGlobal = typeof globalThis & {
  __hikDeniedAttendanceCleanup?: Promise<void>;
  __hikDeniedAttendanceCleaned?: boolean;
};

export type AttendanceLogEntry = {
  id: string;
  deviceId: string | null;
  deviceIp: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  serialNo: string | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: GateDirection;
  eventType: string | null;
  verification: string | null;
  dateTime: string | null;
  timeRaw: string | null;
  syncStatus: CloudSyncStatus;
};

type AttendanceRow = {
  id: string;
  deviceId: string | null;
  deviceIp: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  serialNo: bigint | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: string;
  eventType: string | null;
  verification: string | null;
  dateTime: Date | null;
  timeRaw: string | null;
  outbox: { status: string } | null;
};

function toCloudSyncStatus(value: string | undefined): CloudSyncStatus {
  return value === "SYNCED" || value === "FAILED" ? value : "PENDING";
}

function toAttendanceEntry(row: AttendanceRow): AttendanceLogEntry {
  return {
    id: row.id,
    deviceId: row.deviceId,
    deviceIp: row.deviceIp,
    deviceModel: row.deviceModel,
    deviceSerial: row.deviceSerial,
    serialNo: row.serialNo?.toString() ?? null,
    personId: row.personId,
    personName: row.personName,
    cardNo: row.cardNo,
    gateDirection: parseGateDirection(row.gateDirection),
    eventType: row.eventType,
    verification: row.verification,
    dateTime: row.dateTime?.toISOString() ?? null,
    timeRaw: row.timeRaw,
    syncStatus: toCloudSyncStatus(row.outbox?.status),
  };
}

function nullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasUserData(event: AccessEvent): boolean {
  return Boolean(
    nullableText(event.employeeNo) ||
      nullableText(event.name) ||
      nullableText(event.cardNo),
  );
}

function isEligibleAttendanceEvent(event: AccessEvent): boolean {
  return event.direction !== "denied" && hasUserData(event);
}

async function removeDeniedAttendanceRows(): Promise<void> {
  const globalState = globalThis as AttendanceCleanupGlobal;
  if (globalState.__hikDeniedAttendanceCleaned) {
    return;
  }
  if (globalState.__hikDeniedAttendanceCleanup) {
    await globalState.__hikDeniedAttendanceCleanup;
    return;
  }

  const deniedMinors = Prisma.join([...DENIED_MINORS]);
  const cleanup = prisma.$executeRaw`
    DELETE FROM "attendance_logs"
    WHERE EXISTS (
      SELECT 1
      FROM "LogEvent" AS event
      WHERE "attendance_logs"."_source_key" =
        event."_device_id" || ':' || event."_event_id"
        AND (
          CAST(json_extract(event."minor", '$') AS INTEGER) IN (${deniedMinors})
          OR CAST(json_extract(event."AccessControllerEvent.subEventType", '$') AS INTEGER)
            IN (${deniedMinors})
        )
    )
  `.then(() => {
    globalState.__hikDeniedAttendanceCleaned = true;
  });
  globalState.__hikDeniedAttendanceCleanup = cleanup;
  try {
    await cleanup;
  } finally {
    globalState.__hikDeniedAttendanceCleanup = undefined;
  }
}

function parseSerialNo(value: string | null): bigint | null {
  if (!value || !/^-?\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
}

function parseDateTime(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveDeviceMetadata(device: DeviceRecord) {
  const stored = await getDeviceMetadata(device.id);
  if (stored?.model && stored.serial) {
    return stored;
  }

  try {
    const info = await getDeviceInfo(device);
    const metadata = { model: info.model, serial: info.serialNumber };
    if (metadata.model || metadata.serial) {
      await saveDeviceMetadata(device.id, metadata);
    }
    return {
      model: metadata.model || stored?.model || null,
      serial: metadata.serial || stored?.serial || null,
    };
  } catch (error) {
    console.error(
      `[attendance] Could not read model/serial from ${device.host}:${device.port}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { model: stored?.model ?? null, serial: stored?.serial ?? null };
  }
}

/**
 * Store non-denied events carrying person data. Some terminals only attach
 * person data to the fingerprint event itself, so do not correlate neighbors.
 */
export async function recordAttendanceEvents(
  device: DeviceRecord,
  events: AccessEvent[],
): Promise<number> {
  const deniedSourceKeys = events
    .filter((event) => event.direction === "denied")
    .map((event) => `${event.deviceId}:${event.id}`);
  if (deniedSourceKeys.length > 0) {
    await prisma.attendanceLog.deleteMany({
      where: { sourceKey: { in: deniedSourceKeys } },
    });
  }

  const eventsWithUserData = events.filter(isEligibleAttendanceEvent);
  if (eventsWithUserData.length === 0) {
    return 0;
  }

  const currentDevice = await getDevice(device.id);
  if (!currentDevice) {
    throw new Error(
      `Device ${device.id} was removed before attendance could be saved.`,
    );
  }
  const metadata = await resolveDeviceMetadata(device);
  const rows = eventsWithUserData.map((event) => ({
    id: randomUUID(),
    sourceKey: `${event.deviceId}:${event.id}`,
    deviceId: currentDevice.id,
    deviceIp: `${device.host}:${device.port}`,
    deviceModel: metadata.model,
    deviceSerial: metadata.serial,
    serialNo: parseSerialNo(event.serialNo),
    personId: nullableText(event.employeeNo),
    personName: nullableText(event.name),
    cardNo: nullableText(event.cardNo),
    gateDirection: currentDevice.gateDirection,
    eventType: nullableText(event.label),
    verification: event.verifyMode,
    organizationId: DEFAULT_ORGANIZATION_ID,
    dateTime: parseDateTime(event.time),
    timeRaw: event.time,
  }));
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const chunk = rows.slice(index, index + INSERT_CHUNK);
    inserted += await prisma.$transaction(async (tx) => {
      let created = 0;
      for (const row of chunk) {
        const existing = await tx.attendanceLog.findUnique({
          where: { sourceKey: row.sourceKey },
          select: { personId: true, personName: true, cardNo: true },
        });
        if (!existing) {
          const { organizationId: _organizationId, ...attendance } = row;
          await tx.attendanceLog.create({ data: attendance });
          // Transactional outbox: the event and its cloud-sync queue entry are
          // written together, so the local database is a durable queue that
          // survives a network outage or a worker restart.
          await tx.cloudSyncOutbox.create({
            data: {
              id: randomUUID(),
              attendanceLogId: row.id,
              organizationId: DEFAULT_ORGANIZATION_ID,
            },
          });
          created += 1;
          continue;
        }
        if (
          (row.personId && !existing.personId) ||
          (row.personName && !existing.personName) ||
          (row.cardNo && !existing.cardNo)
        ) {
          await tx.attendanceLog.update({
            where: { sourceKey: row.sourceKey },
            data: {
              ...(row.personId ? { personId: row.personId } : {}),
              ...(row.personName ? { personName: row.personName } : {}),
              ...(row.cardNo ? { cardNo: row.cardNo } : {}),
            },
          });
        }
      }
      return created;
    });
  }
  return inserted;
}

/**
 * Re-derive the attendance log from events already stored in `LogEvent`.
 * Attendance rows are computed when an event is first written, so a change to
 * event classification (a code that was wrongly treated as denied) does not
 * reach events stored before it. Replaying them through the normal writer is
 * idempotent: rows dedupe on `sourceKey` and denied rows are pruned.
 */
export async function reconcileAttendanceFromEvents(): Promise<number> {
  const events = await listStoredEvents();
  if (events.length === 0) {
    return 0;
  }

  const byDevice = new Map<string, AccessEvent[]>();
  for (const event of events) {
    const group = byDevice.get(event.deviceId);
    if (group) {
      group.push(event);
    } else {
      byDevice.set(event.deviceId, [event]);
    }
  }

  let inserted = 0;
  for (const [deviceId, deviceEvents] of byDevice) {
    const device = await getDevice(deviceId);
    if (!device) {
      // Events cascade-delete with their device, so this is only a race.
      continue;
    }
    inserted += await recordAttendanceEvents(device, deviceEvents);
  }
  return inserted;
}

export async function listAttendanceLogs(
  offset = 0,
  limit = 100,
  syncStatus?: CloudSyncStatus,
): Promise<{
  logs: AttendanceLogEntry[];
  total: number;
  hasMore: boolean;
}> {
  await removeDeniedAttendanceRows();
  const personWhere = {
    OR: [
      {
        AND: [{ personId: { not: null } }, { personId: { not: "" } }],
      },
      {
        AND: [{ personName: { not: null } }, { personName: { not: "" } }],
      },
      {
        AND: [{ cardNo: { not: null } }, { cardNo: { not: "" } }],
      },
    ],
  };
  const where = syncStatus
    ? {
        AND: [
          personWhere,
          syncStatus === "PENDING"
            ? {
                OR: [
                  { outbox: { status: "PENDING" } },
                  // Rows queued before the outbox existed have no entry yet.
                  { outbox: { is: null } },
                ],
              }
            : { outbox: { status: syncStatus } },
        ],
      }
    : personWhere;
  const [rows, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      where,
      orderBy: [{ dateTime: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: offset,
      take: limit + 1,
      include: { outbox: { select: { status: true } } },
    }),
    prisma.attendanceLog.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  return {
    logs: rows.slice(0, limit).map(toAttendanceEntry),
    total,
    hasMore,
  };
}

/**
 * Give every attendance row that predates the outbox a queue entry, so events
 * stored before cloud sync existed are not stranded. Idempotent: it only
 * selects rows with no outbox, so it is safe to run on every worker start.
 */
export async function backfillCloudOutbox(): Promise<number> {
  const missing = await prisma.attendanceLog.findMany({
    where: { outbox: { is: null } },
    select: { id: true, organizationId: true },
  });
  if (missing.length === 0) {
    return 0;
  }
  await prisma.cloudSyncOutbox.createMany({
    data: missing.map((log) => ({
      id: randomUUID(),
      attendanceLogId: log.id,
      organizationId: log.organizationId,
    })),
  });
  return missing.length;
}

/** Number of attendance events still waiting to reach the cloud. */
export async function countPendingCloudEvents(): Promise<number> {
  return prisma.cloudSyncOutbox.count({ where: { status: "PENDING" } });
}

/** Requeue every event that exhausted its retry budget, for another attempt. */
export async function retryFailedCloudEvents(): Promise<number> {
  const { count } = await prisma.cloudSyncOutbox.updateMany({
    where: { status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  });
  return count;
}
