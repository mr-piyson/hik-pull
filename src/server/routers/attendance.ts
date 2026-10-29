import { z } from "zod";
import { listAttendanceLogs } from "@/lib/hik/attendance-store";
import { syncDeviceHistory } from "@/lib/hik/daily-history-sync";
import { getAppSettings, recordWorkerRun } from "@/lib/hik/settings-store";
import { listDevices } from "@/lib/hik/store";
import { publicProcedure, router } from "../trpc";

export type PullOutcome = {
  deviceId: string;
  label: string;
  fetched: number;
  inserted: number;
  error: string | null;
};

export const attendanceRouter = router({
  list: publicProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).max(2_147_483_647).default(0),
        limit: z.number().int().min(1).max(500).default(100),
        syncStatus: z.enum(["PENDING", "SYNCED", "FAILED"]).optional(),
        dateFrom: z
          .string()
          .regex(/^\\d{4}-\\d{2}-\\d{2}$/)
          .optional(),
        dateTo: z
          .string()
          .regex(/^\\d{4}-\\d{2}-\\d{2}$/)
          .optional(),
      }),
    )
    .query(({ input }) =>
      listAttendanceLogs(
        input.offset,
        input.limit,
        input.syncStatus,
        input.dateFrom,
        input.dateTo,
      ),
    ),

  /** Pull event history from every configured terminal on demand. */
  pull: publicProcedure.mutation(async () => {
    const [devices, settings] = await Promise.all([
      listDevices(),
      getAppSettings(),
    ]);

    const outcomes: PullOutcome[] = [];
    let fetched = 0;
    let inserted = 0;
    let lastError: string | null = null;

    for (const device of devices) {
      try {
        const result = await syncDeviceHistory(device, settings);
        fetched += result.fetched;
        inserted += result.inserted;
        outcomes.push({
          deviceId: device.id,
          label: device.label,
          fetched: result.fetched,
          inserted: result.inserted,
          error: null,
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        outcomes.push({
          deviceId: device.id,
          label: device.label,
          fetched: 0,
          inserted: 0,
          error: lastError,
        });
      }
    }

    const failed = outcomes.filter((outcome) => outcome.error !== null).length;
    await recordWorkerRun("hikvision", {
      error: failed > 0 && failed === outcomes.length ? lastError : null,
    });

    return {
      devices: outcomes.length,
      fetched,
      inserted,
      failed,
      outcomes,
    };
  }),
});
