import { searchAcsEvents } from "./client";
import { prisma } from "./db";
import { recordEvents } from "./event-store";
import { listDevices } from "./store";
import type { AccessEvent, DeviceRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const INITIAL_LOOKBACK_MS = DAY_MS;
const OVERLAP_MS = 5 * 60 * 1_000;
const MAX_WINDOW_MS = 30 * DAY_MS;
const BATCH_SIZE = 500;
const STARTUP_DELAY_MS = 60 * 1_000;
const DAILY_INTERVAL_MS = DAY_MS;

type SchedulerGlobal = typeof globalThis & {
  __hikDailyHistorySyncStarted?: boolean;
};

async function syncDeviceHistory(device: DeviceRecord): Promise<void> {
  const startedAt = new Date();
  const checkpoint = await prisma.device.findUnique({
    where: { id: device.id },
    select: { lastHistorySyncAt: true },
  });
  if (!checkpoint) {
    return;
  }

  const from = checkpoint.lastHistorySyncAt
    ? new Date(checkpoint.lastHistorySyncAt.getTime() - OVERLAP_MS)
    : new Date(startedAt.getTime() - INITIAL_LOOKBACK_MS);
  let windowStart = from;
  let fetched = 0;
  let inserted = 0;

  while (windowStart < startedAt) {
    const windowEnd = new Date(
      Math.min(windowStart.getTime() + MAX_WINDOW_MS, startedAt.getTime()),
    );
    const batch: AccessEvent[] = [];

    for await (const event of searchAcsEvents(device, {
      deviceId: device.id,
      from: windowStart,
      to: windowEnd,
    })) {
      batch.push(event);
      fetched += 1;
      if (batch.length === BATCH_SIZE) {
        inserted += await recordEvents(batch, device);
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      inserted += await recordEvents(batch, device);
    }
    windowStart = windowEnd;
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastHistorySyncAt: startedAt },
  });
  console.info(
    `[history-sync] Completed ${device.host}:${device.port}; ${fetched} events fetched, ${inserted} new events stored.`,
  );
}

async function runDailyHistorySync(): Promise<void> {
  try {
    const devices = await listDevices();
    for (const device of devices) {
      try {
        await syncDeviceHistory(device);
      } catch (error) {
        console.error(
          `[history-sync] Failed for ${device.host}:${device.port}; the checkpoint was not advanced and the range will be retried: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } catch (error) {
    console.error(
      `[history-sync] Could not list devices: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function startDailyHistorySync(): void {
  const globalState = globalThis as SchedulerGlobal;
  if (globalState.__hikDailyHistorySyncStarted) {
    return;
  }
  globalState.__hikDailyHistorySyncStarted = true;

  console.info(
    "[history-sync] Daily backfill scheduled; the first run starts shortly.",
  );
  const runAndScheduleNext = async () => {
    await runDailyHistorySync();
    setTimeout(() => {
      void runAndScheduleNext();
    }, DAILY_INTERVAL_MS);
  };
  setTimeout(() => {
    void runAndScheduleNext();
  }, STARTUP_DELAY_MS);
}
