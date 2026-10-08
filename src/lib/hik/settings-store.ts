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
};

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
  };
}

export async function saveAppSettings(
  settings: AppSettings,
): Promise<AppSettings> {
  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global", ...settings },
    update: settings,
  });
  return settings;
}
