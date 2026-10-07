import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAcsEventCapabilities, searchAcsEvents } from "@/lib/hik/client";
import { countEvents, queryEvents, recordEvents } from "@/lib/hik/event-store";
import { logBackfill } from "@/lib/hik/log";
import { getDevice } from "@/lib/hik/store";
import type { AccessEvent } from "@/lib/hik/types";
import { publicProcedure, router } from "../trpc";

const directions = ["in", "denied", "door", "other"] as const;

export const eventsRouter = router({
  get: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        direction: z.enum(directions).optional(),
        limit: z.number().int().min(1).max(20_000).default(20_000),
        refresh: z.boolean().default(true),
      }),
    )
    .query(async ({ input, ctx }) => {
      const device = await getDevice(input.id);
      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found.",
        });
      }

      const to = input.to ? new Date(input.to) : new Date();
      const from = input.from
        ? new Date(input.from)
        : new Date(to.getTime() - 240 * 60_000);
      if (from >= to) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "`from` must be earlier than `to`.",
        });
      }
      if (to.getTime() - from.getTime() > 31 * 86_400_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Range too large. The device pages history in small batches, so requests are capped at 31 days. Query a shorter window.",
        });
      }

      let truncated = false;
      let pulled = false;
      let pullError: string | null = null;
      let capabilities: {
        maxResultsPerPage: number;
        searchIdMaxLength: number;
        majorsSearched: number[];
      } | null = null;
      const needsFirstPull = (await countEvents(input.id)) === 0;

      if (input.refresh || needsFirstPull) {
        const fetched: AccessEvent[] = [];
        try {
          for await (const event of searchAcsEvents(device, {
            deviceId: input.id,
            from,
            to,
            signal: ctx.signal,
          })) {
            if (fetched.length >= input.limit) {
              truncated = true;
              break;
            }
            fetched.push(event);
          }
          pulled = true;
          fetched.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
          const unique = new Set(fetched.map((event) => event.id)).size;
          const stored = await recordEvents(fetched, device);
          logBackfill(device, fetched, truncated, { unique, new: stored });

          const caps = await getAcsEventCapabilities(device);
          capabilities = {
            maxResultsPerPage: caps.maxResults.max,
            searchIdMaxLength: caps.searchIdMaxLength,
            majorsSearched: caps.majors,
          };
        } catch (error) {
          if (ctx.signal.aborted) {
            throw error;
          }
          pullError = error instanceof Error ? error.message : String(error);
        }
      }

      const events = await queryEvents({
        deviceId: input.id,
        from,
        to,
        direction: input.direction,
        limit: input.limit,
      });

      if (pullError && events.length === 0) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `History search failed. ${pullError}`,
        });
      }

      return {
        events,
        truncated,
        pulled,
        pullError,
        deviceId: input.id,
        range: { from: from.toISOString(), to: to.toISOString() },
        capabilities,
      };
    }),
});
