import { getAcsEventCapabilities, searchAcsEvents } from "@/lib/hik/client";
import { countEvents, queryEvents, recordEvents } from "@/lib/hik/event-store";
import { logBackfill } from "@/lib/hik/log";
import { getDevice } from "@/lib/hik/store";
import type { AccessDirection, AccessEvent } from "@/lib/hik/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_MINUTES = 240;
const MAX_LOOKBACK_DAYS = 31;
const MAX_EVENTS = 20_000;

const DIRECTIONS: readonly AccessDirection[] = [
  "in",
  "denied",
  "door",
  "other",
];

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The event log for one device.
 *
 * `GET /api/devices/{id}/events?from=<iso>&to=<iso>&direction=<d>&limit=<n>&refresh=0|1`
 *
 * Reads always come from SQLite, so history survives a restart and opens
 * instantly. The device is queried only when:
 *
 *   - `refresh=1` (the UI sends it for an explicit "Reload history"), or
 *   - this is the first time we have ever seen this device, or
 *   - it has no stored events at all.
 *
 * The terminal holds up to 50,000 events and answers a small page at a time
 * (its own `maxResults @max`, typically 10-30), each page costing two round
 * trips because of the single-use nonce. An unbounded range would therefore
 * look like a hang, so the pull is capped and `truncated` is reported honestly
 * rather than silently returning a partial list.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/devices/[id]/events">,
) {
  const { id } = await context.params;
  const device = await getDevice(id);
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const to = parseDate(url.searchParams.get("to"), new Date());
  const from = parseDate(
    url.searchParams.get("from"),
    new Date(to.getTime() - DEFAULT_LOOKBACK_MINUTES * 60_000),
  );

  if (from >= to) {
    return Response.json(
      { error: "`from` must be earlier than `to`." },
      { status: 400 },
    );
  }
  const spanMs = to.getTime() - from.getTime();
  if (spanMs > MAX_LOOKBACK_DAYS * 86_400_000) {
    return Response.json(
      {
        error: `Range too large. The device pages history in small batches, so requests are capped at ${MAX_LOOKBACK_DAYS} days. Query a shorter window.`,
      },
      { status: 400 },
    );
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? MAX_EVENTS);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(1, Math.floor(requestedLimit)), MAX_EVENTS)
    : MAX_EVENTS;

  const directionParam = url.searchParams.get("direction");
  const direction = DIRECTIONS.includes(directionParam as AccessDirection)
    ? (directionParam as AccessDirection)
    : undefined;

  // `refresh=0` means "answer from the database and never touch the device",
  // which is what makes reopening a log instant.
  const wantsRefresh = url.searchParams.get("refresh") !== "0";

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => {
    controller.abort();
  });

  let truncated = false;
  let pulled = false;
  let pullError: string | null = null;
  let capabilities: {
    maxResultsPerPage: number;
    searchIdMaxLength: number;
    majorsSearched: number[];
  } | null = null;

  const needsFirstPull = (await countEvents(id)) === 0;

  if (wantsRefresh || needsFirstPull) {
    const fetched: AccessEvent[] = [];
    try {
      for await (const event of searchAcsEvents(device, {
        deviceId: id,
        from,
        to,
        signal: controller.signal,
      })) {
        if (fetched.length >= limit) {
          truncated = true;
          break;
        }
        fetched.push(event);
      }
      pulled = true;
      // Newest first: the terminal pages oldest-first, which is the opposite of
      // what anyone wants when opening a log.
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
      if (controller.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      pullError = errorMessage(error);
    }
  }

  const events = await queryEvents({
    deviceId: id,
    from,
    to,
    direction,
    limit,
  });

  // Stored history still answers when the device is unreachable — a terminal
  // going offline should not blank a log we already have. It is only an error
  // when there is nothing to fall back on.
  if (pullError && events.length === 0) {
    return Response.json(
      { error: "History search failed.", detail: pullError },
      { status: 502 },
    );
  }

  return Response.json({
    events,
    truncated,
    pulled,
    pullError,
    deviceId: id,
    range: { from: from.toISOString(), to: to.toISOString() },
    capabilities,
  });
}
