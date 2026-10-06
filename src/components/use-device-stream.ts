"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccessEvent, ConnectionState } from "@/lib/hik/types";

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

export function useDeviceStream(deviceId: string | null, reloadToken = 0) {
  const [stream, setStream] = useState<DeviceStream>(IDLE);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  // Dedupe across backfill + live. The device's `serialNo` is stable for the
  // same physical event, so a backfill that overlaps an already-streamed event
  // collapses to one row instead of showing it twice.
  const seen = useRef(new Set<string>());
  const sourceRef = useRef<EventSource | null>(null);

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
      try {
        const query = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        // `t` is a cache-buster. Without it the browser may serve "Reload
        // history" straight from the HTTP cache and silently show stale rows.
        query.set("t", String(reloadToken));
        const response = await fetch(
          `/api/devices/${deviceId}/events?${query}`,
        );
        if (cancelled) {
          return;
        }
        if (response.ok) {
          const payload = (await response.json()) as { events?: AccessEvent[] };
          const rows = payload.events ?? [];
          const fresh: AccessEvent[] = [];
          for (const event of rows) {
            if (!seen.current.has(event.id)) {
              seen.current.add(event.id);
              fresh.push(event);
            }
          }
          if (!cancelled) {
            setEvents(fresh.slice(0, MAX_ROWS));
          }
        }
      } catch {
        // Backfill is best-effort. Live events are what actually matter, so a
        // failed history query downgrades to a notice rather than an error.
      }
      if (cancelled) {
        return;
      }

      const source = new EventSource(
        `/api/devices/${deviceId}/stream?action=start`,
      );
      sourceRef.current = source;

      source.addEventListener("state", (message) => {
        const state = JSON.parse(
          (message as MessageEvent<string>).data,
        ) as ConnectionState;
        setStream(toStreamState(state));
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
      return;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    await fetch(`/api/devices/${deviceId}/stream?action=stop`).catch(
      () => undefined,
    );
    setStream(IDLE);
  }, [deviceId]);

  return { stream, events, stop };
}
