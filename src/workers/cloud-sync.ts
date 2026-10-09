import { CloudSyncError, postAttendanceBatch } from "@/lib/cloud/client";
import type {
  CloudAttendanceEvent,
  CloudBatchResponse,
} from "@/lib/cloud/types";
import { prisma } from "@/lib/hik/db";
import type { AppSettings } from "@/lib/hik/settings-store";

/** Cap the retry delay at one hour so a long outage still recovers promptly. */
const MAX_BACKOFF_SECS = 3_600;

export type CloudSyncResult = {
  /** Events considered in this run (0 when skipped or the queue is empty). */
  attempted: number;
  synced: number;
  failed: number;
  /** True when cloud sync is disabled or not fully configured. */
  skipped: boolean;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drain one batch from the outbox to the cloud ingestion API.
 *
 * Idempotent by construction: events stay in the database and are only marked
 * `SYNCED` after a 2xx response, and each carries its stable `sourceEventKey`
 * so the cloud can discard a batch that a timeout made look failed.
 */
export async function runCloudSync(
  settings: AppSettings,
  now = new Date(),
): Promise<CloudSyncResult> {
  const token = settings.cloudApiToken;
  if (!settings.cloudSyncEnabled || !settings.cloudEndpoint || !token) {
    return { attempted: 0, synced: 0, failed: 0, skipped: true };
  }

  const batch = await prisma.cloudSyncOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, settings.cloudBatchSize),
    include: { attendanceLog: true },
  });
  if (batch.length === 0) {
    return { attempted: 0, synced: 0, failed: 0, skipped: false };
  }

  const events: CloudAttendanceEvent[] = batch.map((row) => ({
    sourceEventKey: row.attendanceLog.sourceKey,
    organizationId: row.organizationId,
    deviceId: row.attendanceLog.deviceId,
    deviceSerial: row.attendanceLog.deviceSerial,
    personId: row.attendanceLog.personId,
    personName: row.attendanceLog.personName,
    cardNo: row.attendanceLog.cardNo,
    gateDirection: row.attendanceLog.gateDirection,
    eventType: row.attendanceLog.eventType,
    verification: row.attendanceLog.verification,
    timeRaw: row.attendanceLog.timeRaw,
    occurredAt: row.attendanceLog.dateTime?.toISOString() ?? null,
  }));

  let response: CloudBatchResponse;
  try {
    response = await postAttendanceBatch(settings.cloudEndpoint, token, events);
  } catch (error) {
    return recordFailure(batch, error, settings, now);
  }

  // A 2xx can still carry per-event validation failures. Never mark a rejected
  // event `SYNCED`: that is the one way an event could be silently lost.
  if ((response.rejected ?? 0) > 0) {
    return recordRejected(batch, response, settings, now);
  }

  await prisma.cloudSyncOutbox.updateMany({
    where: { id: { in: batch.map((row) => row.id) } },
    data: {
      status: "SYNCED",
      syncedAt: now,
      lastError: null,
      attempts: { increment: 1 },
    },
  });
  return {
    attempted: batch.length,
    synced: batch.length,
    failed: 0,
    skipped: false,
  };
}

/**
 * Split a batch the endpoint partly rejected. When the response names the
 * rejected indices, accepted rows are marked `SYNCED` and rejected rows
 * `FAILED` (validation is deterministic, so retrying cannot help). When more
 * rows were rejected than were named — the API only details the first 50 — we
 * cannot tell which are safe, so the whole batch is requeued; the cloud's
 * `source_event_key` uniqueness makes re-sending already-accepted rows a no-op.
 */
async function recordRejected(
  batch: { id: string; attempts: number }[],
  response: CloudBatchResponse,
  settings: AppSettings,
  now: Date,
): Promise<CloudSyncResult> {
  const rejected = response.rejected ?? 0;
  const rejectedById = new Map<number, string>();
  for (const detail of response.errors ?? []) {
    if (
      Number.isInteger(detail?.index) &&
      detail.index >= 0 &&
      detail.index < batch.length
    ) {
      rejectedById.set(detail.index, detail.reason || "Rejected by the cloud.");
    }
  }
  const fullyIdentified = rejectedById.size >= rejected;

  const syncedIds: string[] = [];
  const failedIds: string[] = [];
  const retryIds: { id: string; attempts: number }[] = [];

  batch.forEach((row, index) => {
    if (rejectedById.has(index)) {
      failedIds.push(row.id);
    } else if (fullyIdentified) {
      syncedIds.push(row.id);
    } else {
      retryIds.push(row);
    }
  });

  if (syncedIds.length > 0) {
    await prisma.cloudSyncOutbox.updateMany({
      where: { id: { in: syncedIds } },
      data: {
        status: "SYNCED",
        syncedAt: now,
        lastError: null,
        attempts: { increment: 1 },
      },
    });
  }

  if (failedIds.length > 0) {
    await prisma.cloudSyncOutbox.updateMany({
      where: { id: { in: failedIds } },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: "Rejected by the cloud ingestion API.",
        nextAttemptAt: now,
      },
    });
  }

  let retryFailed = 0;
  for (const row of retryIds) {
    const attempts = row.attempts + 1;
    const giveUp = attempts >= settings.cloudMaxAttempts;
    const delaySecs = Math.min(
      settings.cloudRetryBaseSecs * 2 ** (attempts - 1),
      MAX_BACKOFF_SECS,
    );
    await prisma.cloudSyncOutbox.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError: `${rejected} event(s) rejected without a per-event index.`,
        status: giveUp ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(now.getTime() + delaySecs * 1_000),
      },
    });
    if (giveUp) {
      retryFailed += 1;
    }
  }

  return {
    attempted: batch.length,
    synced: syncedIds.length,
    failed: failedIds.length + retryFailed,
    skipped: false,
  };
}

async function recordFailure(
  batch: { id: string; attempts: number }[],
  error: unknown,
  settings: AppSettings,
  now: Date,
): Promise<CloudSyncResult> {
  const message = messageOf(error);
  const retryable = error instanceof CloudSyncError ? error.retryable : true;
  let failed = 0;

  for (const row of batch) {
    const attempts = row.attempts + 1;
    const giveUp = !retryable || attempts >= settings.cloudMaxAttempts;
    const delaySecs = Math.min(
      settings.cloudRetryBaseSecs * 2 ** (attempts - 1),
      MAX_BACKOFF_SECS,
    );
    await prisma.cloudSyncOutbox.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError: message.slice(0, 500),
        status: giveUp ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(now.getTime() + delaySecs * 1_000),
      },
    });
    if (giveUp) {
      failed += 1;
    }
  }

  return {
    attempted: batch.length,
    synced: 0,
    failed,
    skipped: false,
  };
}
