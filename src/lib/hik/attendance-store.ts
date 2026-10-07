import { randomUUID } from "node:crypto";
import { getDeviceInfo } from "./client";
import { prisma } from "./db";
import { queryEvents } from "./event-store";
import { getDevice, getDeviceMetadata, saveDeviceMetadata } from "./store";
import {
  type AccessEvent,
  type DeviceRecord,
  type GateDirection,
  parseGateDirection,
} from "./types";

const INSERT_CHUNK = 200;
const AUTH_EVENT_WINDOW_MS = 10_000;

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

function hasCompletePersonIdentity(event: AccessEvent): boolean {
  return Boolean(nullableText(event.employeeNo) && nullableText(event.name));
}

type PersonIdentity = {
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
};

function identityFromEvent(event: {
  employeeNo: string;
  name: string;
  cardNo: string;
}): PersonIdentity | null {
  const identity = {
    personId: nullableText(event.employeeNo),
    personName: nullableText(event.name),
    cardNo: nullableText(event.cardNo),
  };
  return identity.personId && identity.personName ? identity : null;
}

function eventTimeMs(event: { time: string | null }): number | null {
  if (!event.time) {
    return null;
  }
  const time = Date.parse(event.time);
  return Number.isNaN(time) ? null : time;
}

async function findNearbyDoorIdentity(
  deviceId: string,
  event: { time: string | null },
): Promise<PersonIdentity | null> {
  const time = eventTimeMs(event);
  if (time === null) {
    return null;
  }
  const candidates = (
    await queryEvents({
      deviceId,
      from: new Date(time - AUTH_EVENT_WINDOW_MS),
      to: new Date(time + AUTH_EVENT_WINDOW_MS),
    })
  ).filter(
    (candidate) =>
      candidate.minor === 75 && hasCompletePersonIdentity(candidate),
  );
  const nearest = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.abs((eventTimeMs(candidate) ?? 0) - time),
    }))
    .sort((left, right) => left.distance - right.distance);
  const closest = nearest[0];
  if (!closest || closest.distance > AUTH_EVENT_WINDOW_MS) {
    return null;
  }
  if (
    nearest[1]?.distance === closest.distance &&
    (nearest[1].candidate.employeeNo !== closest.candidate.employeeNo ||
      nearest[1].candidate.name !== closest.candidate.name)
  ) {
    return null;
  }
  return identityFromEvent(closest.candidate);
}

async function resolveGrantIdentity(
  event: AccessEvent,
): Promise<PersonIdentity | null> {
  const ownIdentity = identityFromEvent(event);
  if (ownIdentity) {
    return ownIdentity;
  }
  return findNearbyDoorIdentity(event.deviceId, event);
}

async function nearbyGrantedEvents(
  deviceId: string,
  event: AccessEvent,
): Promise<AccessEvent[]> {
  const time = eventTimeMs(event);
  if (time === null) {
    return [];
  }
  return queryEvents({
    deviceId,
    from: new Date(time - AUTH_EVENT_WINDOW_MS),
    to: new Date(time + AUTH_EVENT_WINDOW_MS),
    direction: "in",
  });
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
 * Some terminals emit a generic grant without person fields and put the
 * identity on the corresponding "door opened" event. Pair same-device events
 * within a short time window and keep the grant's serial/time as attendance.
 */
export async function recordAttendanceEvents(
  device: DeviceRecord,
  events: AccessEvent[],
): Promise<number> {
  const grants = new Map<string, AccessEvent>();
  for (const event of events) {
    if (event.direction === "in") {
      grants.set(event.id, event);
    }
    if (event.minor === 75 && hasCompletePersonIdentity(event)) {
      for (const nearby of await nearbyGrantedEvents(device.id, event)) {
        grants.set(nearby.id, nearby);
      }
    }
  }
  if (grants.size === 0) {
    return 0;
  }

  const currentDevice = await getDevice(device.id);
  if (!currentDevice) {
    throw new Error(
      `Device ${device.id} was removed before attendance could be saved.`,
    );
  }
  const metadata = await resolveDeviceMetadata(device);
  const rows = [];
  for (const event of grants.values()) {
    let identity: PersonIdentity | null = null;
    try {
      identity = await resolveGrantIdentity(event);
    } catch (error) {
      console.error(
        `[attendance] Could not resolve identity for ${event.deviceId}/${event.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!identity?.personId || !identity.personName) {
      continue;
    }
    rows.push({
      id: randomUUID(),
      sourceKey: `${event.deviceId}:${event.id}`,
      deviceIp: `${device.host}:${device.port}`,
      deviceModel: metadata.model,
      deviceSerial: metadata.serial,
      serialNo: parseSerialNo(event.serialNo),
      personId: identity.personId,
      personName: identity.personName,
      cardNo: identity.cardNo,
      gateDirection: currentDevice.gateDirection,
      dateTime: parseDateTime(event.time),
      timeRaw: event.time,
    });
  }
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
          row.personId &&
          row.personName &&
          (!existing.personId || !existing.personName)
        ) {
          await tx.attendanceLog.update({
            where: { sourceKey: row.sourceKey },
            data: {
              personId: row.personId,
              personName: row.personName,
              cardNo: row.cardNo,
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
  const [rows, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: {
        AND: [
          { personId: { not: null } },
          { personName: { not: null } },
          { personId: { not: "" } },
          { personName: { not: "" } },
        ],
      },
      orderBy: [{ dateTime: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: offset,
      take: limit + 1,
    }),
    prisma.attendanceLog.count({
      where: {
        AND: [
          { personId: { not: null } },
          { personName: { not: null } },
          { personId: { not: "" } },
          { personName: { not: "" } },
        ],
      },
    }),
  ]);
  const hasMore = rows.length > limit;
  return {
    logs: rows.slice(0, limit).map(toAttendanceEntry),
    total,
    hasMore,
  };
}
