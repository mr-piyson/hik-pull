import {
  backfillCloudOutbox,
  reconcileAttendanceFromEvents,
} from "@/lib/hik/attendance-store";
import { syncDeviceHistory } from "@/lib/hik/daily-history-sync";
import { prisma } from "@/lib/hik/db";
import { startDevice } from "@/lib/hik/registry";
import {
  type AppSettings,
  getAppSettings,
  recordWorkerRun,
} from "@/lib/hik/settings-store";
import { listDevices } from "@/lib/hik/store";
import { runCloudSync } from "./cloud-sync";

/** How often the supervisor wakes up to check whether a job is due. */
const TICK_MS = 5_000;

type WorkerLoopState = {
  started: boolean;
  liveStarted: boolean;
  hikvisionInitialized: boolean;
  outboxBackfilled: boolean;
  attendanceReconciled: boolean;
  nextHikvisionAt: number;
  nextCloudAt: number;
};

/**
 * Anchored on `globalThis` deliberately, like the Prisma client and device
 * registry: Next.js hot reload re-evaluates modules, and a second supervisor
 * would double every device query.
 */
type WorkerGlobal = typeof globalThis & { __hikWorkerLoop?: WorkerLoopState };

function loopState(): WorkerLoopState {
  const scope = globalThis as WorkerGlobal;
  scope.__hikWorkerLoop ??= {
    started: false,
    liveStarted: false,
    hikvisionInitialized: false,
    outboxBackfilled: false,
    attendanceReconciled: false,
    nextHikvisionAt: 0,
    nextCloudAt: 0,
  };
  return scope.__hikWorkerLoop;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Start the attendance worker. Safe to call more than once; only the first
 * call starts the loop. The worker is always alive — Settings pause its jobs
 * through the database rather than stopping any process.
 */
export function startAttendanceWorker(): void {
  const state = loopState();
  if (state.started) {
    return;
  }
  state.started = true;
  console.info(
    "[worker] Attendance worker started (Hikvision + cloud sync, database-controlled).",
  );
  void loop();
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error(`[worker] Cycle failed: ${messageOf(error)}`);
    }
    await sleep(TICK_MS);
  }
}

async function tick(): Promise<void> {
  const settings = await getAppSettings();
  const state = loopState();
  const now = Date.now();

  if (!state.liveStarted && settings.autoStartLiveStreams) {
    state.liveStarted = true;
    await ensureLiveStreams();
  }

  if (!state.outboxBackfilled) {
    // Only latch once the backfill actually succeeds, so a transient failure is
    // retried on the next tick instead of stranding pre-outbox rows forever.
    try {
      const queued = await backfillCloudOutbox();
      state.outboxBackfilled = true;
      if (queued > 0) {
        console.info(
          `[worker] Queued ${queued} pre-existing attendance event(s) for cloud sync.`,
        );
      }
    } catch (error) {
      console.error(
        `[worker] Outbox backfill failed (will retry): ${messageOf(error)}`,
      );
    }
  }

  if (!state.attendanceReconciled) {
    // One-time re-derive of the attendance log from stored events, so a
    // classification fix reaches events written before it. Latches only on
    // success, so a transient failure retries instead of being lost.
    try {
      const reconciled = await reconcileAttendanceFromEvents();
      state.attendanceReconciled = true;
      if (reconciled > 0) {
        console.info(
          `[worker] Rebuilt ${reconciled} attendance event(s) from stored events.`,
        );
      }
    } catch (error) {
      console.error(
        `[worker] Attendance reconcile failed (will retry): ${messageOf(error)}`,
      );
    }
  }

  if (settings.hikvisionSyncEnabled) {
    if (!state.hikvisionInitialized) {
      // Preserve the configured warm-up before the first history sweep, then
      // run on the normal interval.
      state.hikvisionInitialized = true;
      state.nextHikvisionAt = now + settings.historyStartupDelaySecs * 1_000;
    }
    if (now >= state.nextHikvisionAt) {
      state.nextHikvisionAt = now + settings.hikvisionIntervalSecs * 1_000;
      await runHikvisionJob(settings);
    }
  }

  if (settings.cloudSyncEnabled && now >= state.nextCloudAt) {
    state.nextCloudAt = now + settings.cloudIntervalSecs * 1_000;
    await runCloudJob(settings);
  }
}

/** Start a shared live connection per terminal; `startDevice` is idempotent. */
async function ensureLiveStreams(): Promise<void> {
  const devices = await listDevices();
  for (const device of devices) {
    startDevice(device);
  }
  console.info(
    `[worker] Live collection started for ${devices.length} configured device(s).`,
  );
}

async function runHikvisionJob(settings: AppSettings): Promise<void> {
  let devices: Awaited<ReturnType<typeof listDevices>>;
  try {
    devices = await listDevices();
  } catch (error) {
    console.error(`[worker] Could not list devices: ${messageOf(error)}`);
    await recordWorkerRun("hikvision", { error: messageOf(error) });
    return;
  }

  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const device of devices) {
    try {
      const result = await syncDeviceHistory(device, settings);
      succeeded += 1;
      console.info(
        `[worker] Hikvision ${device.label}: ${result.fetched} fetched, ${result.inserted} new.`,
      );
    } catch (error) {
      failed += 1;
      lastError = messageOf(error);
      console.error(
        `[worker] Hikvision ${device.label} failed (checkpoint not advanced): ${lastError}`,
      );
    }
  }
  // Only report a run-level error when nothing succeeded; a partial failure is
  // already visible per device in the status table.
  await recordWorkerRun("hikvision", {
    error: failed > 0 && succeeded === 0 ? lastError : null,
  });
}

async function runCloudJob(settings: AppSettings): Promise<void> {
  try {
    const result = await runCloudSync(settings);
    await recordWorkerRun("cloud", { error: null });
    if (result.synced > 0 || result.failed > 0) {
      console.info(
        `[worker] Cloud sync: ${result.synced} synced, ${result.failed} failed, ${result.attempted} attempted.`,
      );
    }
  } catch (error) {
    await recordWorkerRun("cloud", { error: messageOf(error) });
    console.error(`[worker] Cloud sync failed: ${messageOf(error)}`);
  }
}

/** Snapshot of queue pressure, used by the status API. */
export async function cloudQueueCounts(): Promise<{
  pending: number;
  failed: number;
  synced: number;
}> {
  const [pending, failed, synced] = await Promise.all([
    prisma.cloudSyncOutbox.count({ where: { status: "PENDING" } }),
    prisma.cloudSyncOutbox.count({ where: { status: "FAILED" } }),
    prisma.cloudSyncOutbox.count({ where: { status: "SYNCED" } }),
  ]);
  return { pending, failed, synced };
}
