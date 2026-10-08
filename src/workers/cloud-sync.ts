import { CloudSyncError, postAttendanceBatch } from "@/lib/cloud/client";
import type { CloudAttendanceEvent } from "@/lib/cloud/types";
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

  try {
    await postAttendanceBatch(settings.cloudEndpoint, token, events);
  } catch (error) {
    return recordFailure(batch, error, settings, now);
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
