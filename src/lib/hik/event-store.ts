import { prisma } from "./db";
import type { AccessDirection, AccessEvent } from "./types";

/**
 * The event log. Rows are keyed by `(deviceId, id)` — the device's own stable
 * id for that event — so the same physical swipe seen once on the live stream
 * and again by a history search becomes one row instead of two.
 */

/** SQLite caps bound parameters per statement; stay well under it. */
const INSERT_CHUNK = 200;

function toTimeMs(time: string | null): bigint | null {
  if (!time) {
    return null;
  }
  // `Date.parse` understands the `+03:00` offset these terminals emit, which a
  // plain string comparison against a UTC bound would not.
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) ? null : BigInt(parsed);
}

type EventRow = {
  id: string;
  deviceId: string;
  time: string | null;
  timeMs: bigint | null;
  direction: string;
  label: string;
  major: number;
  minor: number;
  name: string;
  employeeNo: string;
  cardNo: string;
  readerNo: number | null;
  serialNo: string | null;
  source: string;
};

function toAccessEvent(row: EventRow): AccessEvent {
  return {
    id: row.id,
    deviceId: row.deviceId,
    time: row.time,
    direction: row.direction as AccessDirection,
    label: row.label,
    major: row.major,
    minor: row.minor,
    name: row.name,
    employeeNo: row.employeeNo,
    cardNo: row.cardNo,
    readerNo: row.readerNo,
    serialNo: row.serialNo,
    source: row.source as AccessEvent["source"],
  };
}

/**
 * Store events, keeping whichever copy of a duplicate arrived first. Returns
 * how many rows were genuinely new.
 *
 * Duplicates are expected and normal: the stream's replay buffer overlaps the
 * history search, and reconnects re-deliver whatever the device still holds.
 * Losing a write would mean losing an event forever, so this never deletes or
 * overwrites.
 *
 * SQLite rejects Prisma's `skipDuplicates`, so the existing ids are read and
 * the new rows inserted inside one transaction — the read and the write have to
 * be atomic, or a live event arriving during a backfill could make the whole
 * insert fail on the unique constraint.
 */
export async function recordEvents(events: AccessEvent[]): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const rows = events.map((event) => ({
    id: event.id,
    deviceId: event.deviceId,
    time: event.time,
    timeMs: toTimeMs(event.time),
    direction: event.direction,
    label: event.label,
    major: event.major,
    minor: event.minor,
    name: event.name,
    employeeNo: event.employeeNo,
    cardNo: event.cardNo,
    readerNo: event.readerNo,
    serialNo: event.serialNo,
    source: event.source,
  }));

  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    inserted += await storeChunk(rows.slice(index, index + INSERT_CHUNK));
  }
  return inserted;
}

async function storeChunk(chunk: EventRow[]): Promise<number> {
  // Grouped by device: the existence check below is scoped to one device,
  // because `id` is only unique within a device.
  const byDevice = new Map<string, Map<string, EventRow>>();
  for (const row of chunk) {
    let rows = byDevice.get(row.deviceId);
    if (!rows) {
      rows = new Map<string, EventRow>();
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

export async function queryEvents(query: EventQuery): Promise<AccessEvent[]> {
  const where = {
    deviceId: query.deviceId,
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.from || query.to
      ? {
          timeMs: {
            ...(query.from ? { gte: BigInt(query.from.getTime()) } : {}),
            ...(query.to ? { lte: BigInt(query.to.getTime()) } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.logEvent.findMany({
    where,
    // Newest first, which is what anyone wants when opening a log. Events the
    // device never timestamped sort last rather than first.
    orderBy: [
      { timeMs: { sort: "desc", nulls: "last" } },
      { receivedAt: "desc" },
    ],
    take: query.limit,
  });

  return rows.map(toAccessEvent);
}
