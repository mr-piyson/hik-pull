import { prisma } from "./db";

export type AppSettings = {
  autoStartLiveStreams: boolean;
  historySyncEnabled: boolean;
  historySyncIntervalHours: number;
  historyStartupDelaySecs: number;
  historyLookbackHours: number;
  historyOverlapMinutes: number;
  historyBatchSize: number;
  reconnectBaseSeconds: number;
  reconnectMaxSeconds: number;
  attendanceRefreshSeconds: number;
  facePhotoTargetKB: number;
  maxPhotoUploadMB: number;
  hikvisionSyncEnabled: boolean;
  hikvisionIntervalSecs: number;
  cloudSyncEnabled: boolean;
  cloudIntervalSecs: number;
  cloudBatchSize: number;
  cloudRetryBaseSecs: number;
  cloudMaxAttempts: number;
  cloudEndpoint: string;
  /** Server-side only. Never returned to the browser. */
  cloudApiToken: string;
};

/** Operator-facing shape: the API token is replaced by a presence flag. */
export type PublicAppSettings = Omit<AppSettings, "cloudApiToken"> & {
  hasCloudApiToken: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoStartLiveStreams: true,
  historySyncEnabled: true,
  historySyncIntervalHours: 24,
  historyStartupDelaySecs: 60,
  historyLookbackHours: 24,
  historyOverlapMinutes: 5,
  historyBatchSize: 500,
  reconnectBaseSeconds: 1,
  reconnectMaxSeconds: 30,
  attendanceRefreshSeconds: 10,
  facePhotoTargetKB: 190,
  maxPhotoUploadMB: 10,
  hikvisionSyncEnabled: true,
  hikvisionIntervalSecs: 30,
  cloudSyncEnabled: false,
  cloudIntervalSecs: 60,
  cloudBatchSize: 100,
  cloudRetryBaseSecs: 30,
  cloudMaxAttempts: 10,
  cloudEndpoint: "",
  cloudApiToken: "",
};

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  const { cloudApiToken, ...rest } = settings;
  return { ...rest, hasCloudApiToken: cloudApiToken.length > 0 };
}

export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  return {
    autoStartLiveStreams: row.autoStartLiveStreams,
    historySyncEnabled: row.historySyncEnabled,
    historySyncIntervalHours: row.historySyncIntervalHours,
    historyStartupDelaySecs: row.historyStartupDelaySecs,
    historyLookbackHours: row.historyLookbackHours,
    historyOverlapMinutes: row.historyOverlapMinutes,
    historyBatchSize: row.historyBatchSize,
    reconnectBaseSeconds: row.reconnectBaseSeconds,
    reconnectMaxSeconds: row.reconnectMaxSeconds,
    attendanceRefreshSeconds: row.attendanceRefreshSeconds,
    facePhotoTargetKB: row.facePhotoTargetKB,
    maxPhotoUploadMB: row.maxPhotoUploadMB,
    hikvisionSyncEnabled: row.hikvisionSyncEnabled,
    hikvisionIntervalSecs: row.hikvisionIntervalSecs,
    cloudSyncEnabled: row.cloudSyncEnabled,
    cloudIntervalSecs: row.cloudIntervalSecs,
    cloudBatchSize: row.cloudBatchSize,
    cloudRetryBaseSecs: row.cloudRetryBaseSecs,
    cloudMaxAttempts: row.cloudMaxAttempts,
    cloudEndpoint: row.cloudEndpoint,
    cloudApiToken: row.cloudApiToken || process.env.CLOUD_API_TOKEN || "",
  };
}

export type SaveAppSettingsInput = Omit<AppSettings, "cloudApiToken"> & {
  /**
   * Omitted or empty keeps the stored token, so the browser never has to round
   * trip the secret. A non-empty value replaces it.
   */
  cloudApiToken?: string;
};

export async function saveAppSettings(
  settings: SaveAppSettingsInput,
): Promise<AppSettings> {
  const { cloudApiToken, ...rest } = settings;
  const data = {
    ...rest,
    ...(cloudApiToken ? { cloudApiToken } : {}),
  };
  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
  return getAppSettings();
}

export type WorkerStatus = {
  lastHikvisionRunAt: string | null;
  lastCloudRunAt: string | null;
  lastCloudError: string | null;
};

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const row = await prisma.workerState.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  return {
    lastHikvisionRunAt: row.lastHikvisionRunAt?.toISOString() ?? null,
    lastCloudRunAt: row.lastCloudRunAt?.toISOString() ?? null,
    lastCloudError: row.lastCloudError,
  };
}

export async function recordWorkerRun(
  job: "hikvision" | "cloud",
  options: { error?: string | null } = {},
): Promise<void> {
  const now = new Date();
  const data =
    job === "hikvision"
      ? { lastHikvisionRunAt: now }
      : {
          lastCloudRunAt: now,
          lastCloudError: options.error ?? null,
        };
  await prisma.workerState.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
}
