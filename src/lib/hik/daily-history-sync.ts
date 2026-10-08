import { searchAcsEvents } from "./client";
import { prisma } from "./db";
import { recordEvents } from "./event-store";
import type { AppSettings } from "./settings-store";
import { recordDeviceSyncResult } from "./store";
import type { AccessEvent, DeviceRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_WINDOW_MS = 30 * DAY_MS;

export type HistorySyncResult = {
  fetched: number;
  inserted: number;
};

/**
 * Reconcile one terminal's event history into the local database.
 *
 * The device's `AcsEvent` API accepts a time window, not an event cursor, so
 * the window is re-read from the previous checkpoint minus a small overlap.
 * The checkpoint advances only after the whole sweep succeeds: if the device
 * is unreachable the range is retried on the next run rather than skipped.
 */
export async function syncDeviceHistory(
  device: DeviceRecord,
  settings: AppSettings,
): Promise<HistorySyncResult> {
  const startedAt = new Date();
  const checkpoint = await prisma.device.findUnique({
    where: { id: device.id },
    select: { lastHistorySyncAt: true },
  });
  if (!checkpoint) {
    return { fetched: 0, inserted: 0 };
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
  let cursorTime: number | null = null;
  let cursorKey: string | null = null;

  const noteCursor = (event: AccessEvent): void => {
    const time = event.time ? Date.parse(event.time) : Number.NaN;
    if (!Number.isFinite(time)) {
      return;
    }
    const key = event.serialNo ?? event.id;
    const later =
      cursorTime === null ||
      time > cursorTime ||
      (time === cursorTime && cursorKey !== null && key > cursorKey);
    if (later) {
      cursorTime = time;
      cursorKey = key;
    }
  };

  try {
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
        noteCursor(event);
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
  } catch (error) {
    await recordDeviceSyncResult(device.id, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await recordDeviceSyncResult(device.id, {
    lastHistorySyncAt: startedAt,
    lastEventTime: cursorTime !== null ? new Date(cursorTime) : undefined,
    lastEventKey: cursorKey ?? undefined,
    error: null,
  });

  return { fetched, inserted };
}
