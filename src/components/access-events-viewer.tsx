"use client";

import { useState } from "react";
import type { PublicDevice } from "@/lib/hik/types";
import { EventLog } from "./event-log";
import { useDeviceStream } from "./use-device-stream";

export function AccessEventsViewer({
  devices,
  initialDeviceId,
}: {
  devices: PublicDevice[];
  initialDeviceId: string | null;
}) {
  const [activeId, setActiveId] = useState(
    devices.some((device) => device.id === initialDeviceId)
      ? initialDeviceId
      : null,
  );
  const { stream, events, stop, reload } = useDeviceStream(activeId);
  const activeDevice = devices.find((device) => device.id === activeId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          Monitoring
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Access events
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Review saved history and follow new events from one terminal at a
          time.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Terminal</span>
          <select
            value={activeId ?? ""}
            onChange={(event) => {
              const nextId = event.target.value || null;
              if (activeId && activeId !== nextId) {
                void stop().then((stopped) => {
                  if (stopped) {
                    setActiveId(nextId);
                  }
                });
                return;
              }
              setActiveId(nextId);
            }}
            disabled={devices.length === 0}
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-zinc-700"
          >
            <option value="">Select a terminal</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label} · {device.host}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          {activeDevice ? (
            <>
              <button
                type="button"
                onClick={reload}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Reload history
              </button>
              <button
                type="button"
                onClick={() => {
                  void stop().then((stopped) => {
                    if (stopped) {
                      setActiveId(null);
                    }
                  });
                }}
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                Stop stream
              </button>
            </>
          ) : null}
        </div>
      </section>

      <EventLog
        deviceLabel={activeDevice?.label ?? null}
        status={stream.status}
        message={stream.message}
        events={events}
        onReload={reload}
      />
    </main>
  );
}
