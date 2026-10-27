import { prisma } from "./db";
import {
  type DeviceRecord,
  type DeviceScheme,
  parseGateDirection,
} from "./types";

/**
 * Device records live in SQLite now (they used to be a JSON file in
 * `.data/devices.json`). The exported signatures are unchanged so the API
 * routes that read and write devices did not have to change with them.
 *
 * Credentials are stored as plaintext, exactly as they were before. The app
 * runs on a LAN with no users and no TLS, so this is not a downgrade — and
 * no API response ever includes a password, only `hasPassword`.
 */

type DeviceRow = {
  id: string;
  label: string;
  scheme: string;
  host: string;
  port: number;
  username: string;
  password: string;
  gateDirection: string;
  createdAt: string;
  deviceModel?: string | null;
  deviceSerial?: string | null;
  status?: string | null;
};

function toRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    label: row.label,
    scheme: row.scheme === "https" ? "https" : "http",
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    gateDirection: parseGateDirection(row.gateDirection),
    createdAt: row.createdAt,
    deviceModel: row.deviceModel ?? null,
    deviceSerial: row.deviceSerial ?? null,
    status: row.status ?? "unknown",
  };
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const rows = await prisma.device.findMany({
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRecord);
}

export async function getDevice(id: string): Promise<DeviceRecord | null> {
  const row = await prisma.device.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export async function getDeviceMetadata(
  id: string,
): Promise<{ model: string | null; serial: string | null } | null> {
  const row = await prisma.device.findUnique({
    where: { id },
    select: { deviceModel: true, deviceSerial: true },
  });
  return row ? { model: row.deviceModel, serial: row.deviceSerial } : null;
}

export async function saveDeviceMetadata(
  id: string,
  metadata: { model: string; serial: string },
): Promise<void> {
  await prisma.device.update({
    where: { id },
    data: {
      deviceModel: metadata.model || null,
      deviceSerial: metadata.serial || null,
    },
  });
}

/** Insert-or-replace, which is what the old JSON store did too. */
export async function saveDevice(
  device: DeviceRecord,
  metadata?: { model: string; serial: string },
): Promise<DeviceRecord> {
  const data = {
    label: device.label,
    scheme: device.scheme,
    host: device.host,
    port: device.port,
    username: device.username,
    password: device.password,
    gateDirection: device.gateDirection,
    createdAt: device.createdAt,
    ...(metadata
      ? {
          deviceModel: metadata.model || null,
          deviceSerial: metadata.serial || null,
        }
      : {}),
  };
  await prisma.device.upsert({
    where: { id: device.id },
    create: { id: device.id, ...data },
    update: data,
  });
  return device;
}

export type DeviceSyncState = {
  id: string;
  label: string;
  status: string;
  lastHistorySyncAt: Date | null;
  lastEventTime: Date | null;
  lastEventKey: string | null;
  lastSyncError: string | null;
};

/** Operational view of every device's synchronization progress. */
export async function listDeviceSyncStates(): Promise<DeviceSyncState[]> {
  return prisma.device.findMany({
    select: {
      id: true,
      label: true,
      status: true,
      lastHistorySyncAt: true,
      lastEventTime: true,
      lastEventKey: true,
      lastSyncError: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Record the live-connection state for a terminal, for the status display. */
export async function setDeviceStatus(
  id: string,
  status: string,
): Promise<void> {
  await prisma.device.updateMany({ where: { id }, data: { status } });
}

/**
 * Persist the outcome of one history reconciliation. The cursor is only
 * advanced by callers after the sweep fully succeeds; on failure only the
 * error is recorded so the window is retried on the next run.
 */
export async function recordDeviceSyncResult(
  id: string,
  result: {
    lastEventTime?: Date | null;
    lastEventKey?: string | null;
    lastHistorySyncAt?: Date;
    error?: string | null;
  },
): Promise<void> {
  await prisma.device.update({
    where: { id },
    data: {
      ...(result.error === undefined
        ? {}
        : {
            lastSyncError: result.error,
            status: result.error ? "error" : "online",
          }),
      ...(result.lastEventTime !== undefined
        ? { lastEventTime: result.lastEventTime }
        : {}),
      ...(result.lastEventKey !== undefined
        ? { lastEventKey: result.lastEventKey }
        : {}),
      ...(result.lastHistorySyncAt
        ? { lastHistorySyncAt: result.lastHistorySyncAt }
        : {}),
    },
  });
}

export async function deleteDevice(id: string): Promise<boolean> {
  // `LogEvent.deviceId` cascades on delete, so a removed device takes its
  // stored events with it rather than leaving rows nothing can ever match.
  const { count } = await prisma.device.deleteMany({ where: { id } });
  return count > 0;
}

export function assertPort(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(
      `Port must be an integer between 1 and 65535, got ${value}.`,
    );
  }
}

const HOSTNAME_RE =
  /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export function assertHost(value: string): string {
  const host = value.trim();
  if (host.length === 0 || host.length > 253 || !HOSTNAME_RE.test(host)) {
    throw new Error(
      `"${value}" is not a valid host. Use a LAN IPv4 address (e.g. 192.168.1.64) or hostname.`,
    );
  }
  return host;
}

export function assertScheme(value: unknown): DeviceScheme {
  if (value === "http" || value === "https") {
    return value;
  }
  // ISAPI answers on plain HTTP on port 80 for these terminals even when the
  // web UI is served over HTTPS, so defaulting to http avoids most of the
  // self-signed-certificate pain.
  return "http";
}

export function assertUsername(value: string): string {
  const username = value.trim();
  if (username.length === 0 || username.length > 64) {
    throw new Error("Username is required (max 64 characters).");
  }
  return username;
}

export function assertPassword(value: string): string {
  if (value.length === 0 || value.length > 128) {
    throw new Error("Password is required (max 128 characters).");
  }
  return value;
}
