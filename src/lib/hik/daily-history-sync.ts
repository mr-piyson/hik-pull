import { searchAcsEvents } from "./client";
import { prisma } from "./db";
import { recordEvents } from "./event-store";
import { getAppSettings } from "./settings-store";
import { listDevices } from "./store";
import type { AccessEvent, DeviceRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_WINDOW_MS = 30 * DAY_MS;

type SchedulerGlobal = typeof globalThis & {
  __hikHistorySyncTimer?: NodeJS.Timeout;
  __hikHistorySyncRunning?: boolean;
};

async function syncDeviceHistory(device: DeviceRecord): Promise<void> {
  const settings = await getAppSettings();
  const startedAt = new Date();
  const checkpoint = await prisma.device.findUnique({
    where: { id: device.id },
    select: { lastHistorySyncAt: true },
  });
  if (!checkpoint) {
    return;
  }

  const from = checkpoint.lastHistorySyncAt
    ? new Date(
        checkpoint.lastHistorySyncAt.getTime() -
          settings.historyOverlapMinutes * 60_000,
      )
    : new Date(
        startedAt.getTime() - settings.historyLookbackHours * 60 * 60_000,
      );
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
      if (batch.length === settings.historyBatchSize) {
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

export async function configureDailyHistorySync(
  nextRun: "startup" | "interval" = "startup",
): Promise<void> {
  const globalState = globalThis as SchedulerGlobal;
  if (globalState.__hikHistorySyncTimer) {
    clearTimeout(globalState.__hikHistorySyncTimer);
    globalState.__hikHistorySyncTimer = undefined;
  }
  const settings = await getAppSettings();
  if (!settings.historySyncEnabled) {
    console.info("[history-sync] Scheduled history backfill is disabled.");
    return;
  }
  if (globalState.__hikHistorySyncRunning) {
    console.info(
      "[history-sync] A history backfill is running; the next schedule will use the latest settings.",
    );
    return;
  }

  const delay =
    nextRun === "startup"
      ? settings.historyStartupDelaySecs * 1_000
      : settings.historySyncIntervalHours * 60 * 60_000;
  console.info(
    nextRun === "startup"
      ? `[history-sync] Backfill scheduled in ${delay / 1_000}s, then every ${settings.historySyncIntervalHours}h.`
      : `[history-sync] Next backfill scheduled in ${settings.historySyncIntervalHours}h.`,
  );
  globalState.__hikHistorySyncTimer = setTimeout(() => {
    globalState.__hikHistorySyncTimer = undefined;
    globalState.__hikHistorySyncRunning = true;
    void runDailyHistorySync().finally(() => {
      globalState.__hikHistorySyncRunning = false;
      void configureDailyHistorySync("interval").catch((error: unknown) => {
        console.error(
          `[history-sync] Could not schedule the next backfill: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }, delay);
}
