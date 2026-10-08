import { z } from "zod";
import {
  getAppSettings,
  saveAppSettings,
  toPublicSettings,
} from "@/lib/hik/settings-store";
import { publicProcedure, router } from "../trpc";

const settingsInput = z
  .object({
    autoStartLiveStreams: z.boolean(),
    historySyncEnabled: z.boolean(),
    historySyncIntervalHours: z.number().int().min(1).max(168),
    historyStartupDelaySecs: z.number().int().min(0).max(3600),
    historyLookbackHours: z.number().int().min(1).max(720),
    historyOverlapMinutes: z.number().int().min(0).max(1440),
    historyBatchSize: z.number().int().min(50).max(1000),
    reconnectBaseSeconds: z.number().int().min(1).max(300),
    reconnectMaxSeconds: z.number().int().min(1).max(1800),
    attendanceRefreshSeconds: z.number().int().min(5).max(300),
    facePhotoTargetKB: z.number().int().min(50).max(190),
    maxPhotoUploadMB: z.number().int().min(1).max(50),
    hikvisionSyncEnabled: z.boolean(),
    hikvisionIntervalSecs: z.number().int().min(5).max(86_400),
    cloudSyncEnabled: z.boolean(),
    cloudIntervalSecs: z.number().int().min(5).max(86_400),
    cloudBatchSize: z.number().int().min(1).max(1000),
    cloudRetryBaseSecs: z.number().int().min(1).max(3600),
    cloudMaxAttempts: z.number().int().min(1).max(100),
    cloudEndpoint: z.string().trim().max(500),
    // Omitted or empty keeps the stored token; a value replaces it.
    cloudApiToken: z.string().max(500).optional(),
  })
  .refine(
    (settings) => settings.reconnectBaseSeconds <= settings.reconnectMaxSeconds,
    {
      message: "Maximum reconnect delay must be at least the base delay.",
      path: ["reconnectMaxSeconds"],
    },
  );

export const settingsRouter = router({
  get: publicProcedure.query(async () =>
    toPublicSettings(await getAppSettings()),
  ),
  save: publicProcedure.input(settingsInput).mutation(async ({ input }) => {
    const settings = await saveAppSettings(input);
    return toPublicSettings(settings);
  }),
});
