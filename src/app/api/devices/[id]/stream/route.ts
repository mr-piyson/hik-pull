import {
  getState,
  startDevice,
  stopDevice,
  subscribeEvents,
  subscribeState,
} from "@/lib/hik/registry";
import { getDevice } from "@/lib/hik/store";
import type { AccessEvent, ConnectionState } from "@/lib/hik/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for one device.
 *
 * `GET /api/devices/{id}/stream?action=start|stop`
 *
 * Opening this endpoint connects to the device; `action=stop` tears the
 * connection down. The device connection is owned by the registry and shared,
 * so several browser tabs observe a single socket rather than each opening
 * their own.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/devices/[id]/stream">,
) {
  const { id } = await context.params;
  const device = await getDevice(id);
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  const action = new URL(request.url).searchParams.get("action") ?? "start";
  if (action === "stop") {
    stopDevice(id);
    return Response.json({ ok: true, status: "idle" });
  }
  if (action !== "start") {
    return Response.json(
      { error: '`action` must be "start" or "stop".' },
      { status: 400 },
    );
  }

  startDevice(device);

  const encoder = new TextEncoder();
  let unsubscribeEvents: (() => void) | undefined;
  let unsubscribeState: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Client vanished mid-write; teardown runs via `cancel`.
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));

      unsubscribeEvents = subscribeEvents(id, (event: AccessEvent) => {
        send("access", event);
      });
      unsubscribeState = subscribeState(id, (state: ConnectionState) => {
        send("state", state);
      });

      // `subscribeState` only reports *changes*, and `startDevice` is a no-op
      // when the shared connection is already running — so a tab opened
      // against a live stream would otherwise receive nothing at all until
      // the device happened to emit an event. Replay the current state.
      send("state", getState(id));

      // Proxies drop idle connections and the device can stay quiet for long
      // stretches, so keep the pipe warm explicitly.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // Ignored: `cancel` handles teardown.
        }
      }, 20_000);
    },

    cancel() {
      unsubscribeEvents?.();
      unsubscribeState?.();
      if (heartbeat !== undefined) {
        clearInterval(heartbeat);
      }
      // Deliberately NOT stopping the device here: the registry connection
      // outlives any one browser tab, so closing a tab must not cut off the
      // events other tabs are still showing.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers SSE by default, which would batch every event.
      "X-Accel-Buffering": "no",
    },
  });
}
