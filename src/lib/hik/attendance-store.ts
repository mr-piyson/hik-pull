import { randomUUID } from "node:crypto";
import { getDeviceInfo } from "./client";
import { prisma } from "./db";
import { getDevice, getDeviceMetadata, saveDeviceMetadata } from "./store";
import {
  type AccessEvent,
  type DeviceRecord,
  type GateDirection,
  parseGateDirection,
} from "./types";

const INSERT_CHUNK = 200;

export type AttendanceLogEntry = {
  id: string;
  deviceIp: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  serialNo: string | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: GateDirection;
  dateTime: string | null;
  timeRaw: string | null;
};

type AttendanceRow = {
  id: string;
  deviceIp: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  serialNo: bigint | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: string;
  dateTime: Date | null;
  timeRaw: string | null;
};

function toAttendanceEntry(row: AttendanceRow): AttendanceLogEntry {
  return {
    id: row.id,
    deviceIp: row.deviceIp,
    deviceModel: row.deviceModel,
    deviceSerial: row.deviceSerial,
    serialNo: row.serialNo?.toString() ?? null,
    personId: row.personId,
    personName: row.personName,
    cardNo: row.cardNo,
    gateDirection: parseGateDirection(row.gateDirection),
    dateTime: row.dateTime?.toISOString() ?? null,
    timeRaw: row.timeRaw,
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
 * Store any event carrying person data, regardless of event direction or code.
 * Some terminals only attach person data to the fingerprint event itself, so
 * do not infer eligibility from event classification or correlate neighbors.
 */
export async function recordAttendanceEvents(
  device: DeviceRecord,
  events: AccessEvent[],
): Promise<number> {
  const eventsWithUserData = events.filter(hasUserData);
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
    deviceIp: `${device.host}:${device.port}`,
    deviceModel: metadata.model,
    deviceSerial: metadata.serial,
    serialNo: parseSerialNo(event.serialNo),
    personId: nullableText(event.employeeNo),
    personName: nullableText(event.name),
    cardNo: nullableText(event.cardNo),
    gateDirection: currentDevice.gateDirection,
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
          await tx.attendanceLog.create({ data: row });
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

export async function listAttendanceLogs(
  offset = 0,
  limit = 100,
): Promise<{
  logs: AttendanceLogEntry[];
  total: number;
  hasMore: boolean;
}> {
  const where = {
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
  const [rows, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      where,
      orderBy: [{ dateTime: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: offset,
      take: limit + 1,
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
