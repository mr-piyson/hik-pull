import { z } from "zod";
import { listAttendanceLogs } from "@/lib/hik/attendance-store";
import { publicProcedure, router } from "../trpc";

export const attendanceRouter = router({
  list: publicProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).max(2_147_483_647).default(0),
        limit: z.number().int().min(1).max(500).default(100),
        syncStatus: z.enum(["PENDING", "SYNCED", "FAILED"]).optional(),
      }),
    )
    .query(({ input }) =>
      listAttendanceLogs(input.offset, input.limit, input.syncStatus),
    ),
});
