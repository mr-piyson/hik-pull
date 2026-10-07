"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccessEvent, ConnectionState } from "@/lib/hik/types";
import { trpc } from "@/trpc/client";

const MAX_ROWS = 2_000;

export type StreamStatus = "idle" | "connecting" | "live" | "error";

export type DeviceStream = {
  status: StreamStatus;
  message: string | null;
  eventsReceived: number;
  lastEventAt: string | null;
};

const IDLE: DeviceStream = {
  status: "idle",
  message: null,
  eventsReceived: 0,
  lastEventAt: null,
};

function toStreamState(state: ConnectionState): DeviceStream {
  return {
    status:
      state.status === "live" || state.status === "reconnecting"
        ? "live"
        : state.status === "error"
          ? "error"
          : state.status === "connecting"
            ? "connecting"
            : "idle",
    message: state.message,
    eventsReceived: state.eventsReceived,
    lastEventAt: state.lastEventAt,
  };
}

export function useDeviceStream(deviceId: string | null) {
  const [stream, setStream] = useState<DeviceStream>(IDLE);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  // Dedupe across backfill + live. The device's `serialNo` is stable for the
  // same physical event, so a backfill that overlaps an already-streamed event
  // collapses to one row instead of showing it twice.
  const seen = useRef(new Set<string>());
  const sourceRef = useRef<EventSource | null>(null);

  // The counter intentionally retriggers history loading when the user asks to reload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: This state is an explicit effect trigger.
  useEffect(() => {
    if (!deviceId) {
      return;
    }

    setStream({
      ...IDLE,
      status: "connecting",
      message: "Fetching recent history, then going live...",
    });
    setEvents([]);
    seen.current = new Set();

    let cancelled = false;

    const run = async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 4 * 60 * 60 * 1000);
      let historyNotice: string | null = null;
      try {
        const payload = await trpc.events.get.query({
          id: deviceId,
          from: from.toISOString(),
          to: to.toISOString(),
        });
        if (cancelled) {
          return;
        }
        const fresh: AccessEvent[] = [];
        for (const event of payload.events) {
          if (!seen.current.has(event.id)) {
            seen.current.add(event.id);
            fresh.push(event);
          }
        }
        if (!cancelled) {
          setEvents(fresh.slice(0, MAX_ROWS));
        }
        if (payload.pullError) {
          historyNotice = `History search failed: ${payload.pullError}`;
        }
      } catch (failure) {
        historyNotice =
          failure instanceof Error
            ? `Could not load event history: ${failure.message}`
            : "Could not load event history.";
      }
      if (cancelled) {
        return;
      }
      if (historyNotice) {
        setStream((previous) => ({ ...previous, message: historyNotice }));
      }

      const source = new EventSource(`/api/devices/${deviceId}/stream`);
      sourceRef.current = source;

      source.addEventListener("state", (message) => {
        const state = JSON.parse(
          (message as MessageEvent<string>).data,
        ) as ConnectionState;
        setStream({
          ...toStreamState(state),
          message: historyNotice ?? state.message,
        });
      });
      source.addEventListener("access", (message) => {
        const event = JSON.parse(
          (message as MessageEvent<string>).data,
        ) as AccessEvent;
        if (seen.current.has(event.id)) {
          return;
        }
        seen.current.add(event.id);
        setEvents((previous) => {
          const next = [event, ...previous];
          if (next.length > MAX_ROWS) {
            seen.current.delete(next[MAX_ROWS].id);
            return next.slice(0, MAX_ROWS);
          }
          return next;
        });
      });
      source.onerror = () => {
        setStream((previous) => ({
          ...previous,
          status: previous.status === "live" ? "live" : "error",
          message: "Lost connection to the event stream. Retrying...",
        }));
      };
    };

    void run();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [deviceId, reloadToken]);

  const stop = useCallback(async () => {
    if (!deviceId) {
      return true;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    try {
      await trpc.devices.stopStream.mutate({ id: deviceId });
      setStream(IDLE);
      return true;
    } catch (failure) {
      setStream({
        ...IDLE,
        status: "error",
        message:
          failure instanceof Error
            ? failure.message
            : "Could not stop the device stream.",
      });
      return false;
    }
  }, [deviceId]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return { stream, events, stop, reload };
}
