import { retryFailedCloudEvents } from "@/lib/hik/attendance-store";
import { getAppSettings, getWorkerStatus } from "@/lib/hik/settings-store";
import { listDeviceSyncStates } from "@/lib/hik/store";
import { cloudQueueCounts } from "@/workers/attendance";
import { publicProcedure, router } from "../trpc";

export const workerRouter = router({
  /** Operational snapshot for the Settings status panel. */
  status: publicProcedure.query(async () => {
    const [settings, worker, devices, queue] = await Promise.all([
      getAppSettings(),
      getWorkerStatus(),
      listDeviceSyncStates(),
      cloudQueueCounts(),
    ]);

    return {
      enabled: {
        hikvision: settings.hikvisionSyncEnabled,
        cloud: settings.cloudSyncEnabled,
      },
      configured: Boolean(settings.cloudEndpoint && settings.cloudApiToken),
      endpoint: settings.cloudEndpoint,
      lastHikvisionRunAt: worker.lastHikvisionRunAt,
      lastCloudRunAt: worker.lastCloudRunAt,
      lastCloudError: worker.lastCloudError,
      queue,
      devices: devices.map((device) => ({
        id: device.id,
        label: device.label,
        status: device.status,
        lastHistorySyncAt: device.lastHistorySyncAt?.toISOString() ?? null,
        lastEventTime: device.lastEventTime?.toISOString() ?? null,
        lastEventKey: device.lastEventKey,
        lastSyncError: device.lastSyncError,
      })),
    };
  }),

  /** Requeue every failed event so the cloud job retries it. */
  retryFailed: publicProcedure.mutation(async () => ({
    requeued: await retryFailedCloudEvents(),
  })),
});
