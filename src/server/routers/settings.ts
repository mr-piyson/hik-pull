import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { configureDailyHistorySync } from "@/lib/hik/daily-history-sync";
import { getAppSettings, saveAppSettings } from "@/lib/hik/settings-store";
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
  })
  .refine(
    (settings) => settings.reconnectBaseSeconds <= settings.reconnectMaxSeconds,
    {
      message: "Maximum reconnect delay must be at least the base delay.",
      path: ["reconnectMaxSeconds"],
    },
  );

export const settingsRouter = router({
  get: publicProcedure.query(() => getAppSettings()),
  save: publicProcedure.input(settingsInput).mutation(async ({ input }) => {
    const settings = await saveAppSettings(input);
    try {
      await configureDailyHistorySync();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Settings were saved, but the history schedule could not be updated: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return settings;
  }),
});
