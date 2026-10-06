"use client";

import { useState } from "react";
import type { DeviceInfo, PublicDevice } from "@/lib/hik/types";
import { AddDeviceForm } from "./add-device-form";
import { DeviceTable } from "./device-table";
import { EventLog } from "./event-log";
import { useDeviceStream } from "./use-device-stream";

export function Dashboard({
  initialDevices,
}: {
  initialDevices: PublicDevice[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [infoById, setInfoById] = useState<Record<string, DeviceInfo>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  // Bumping this forces the stream hook to re-run history + live from scratch.
  const [reloadToken, setReloadToken] = useState(0);

  const { stream, events, stop } = useDeviceStream(activeId, reloadToken);

  const activeDevice = devices.find((device) => device.id === activeId) ?? null;

  const reload = () => {
    setReloadToken((previous) => previous + 1);
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hikvision access events
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect to a Hikvision face / card terminal over ISAPI and list its
          access events as they arrive, backfilled from device history.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Devices
        </h2>
        <div className="flex flex-col gap-3">
          <AddDeviceForm
            onAdded={(device, info) => {
              setDevices((previous) => [...previous, device]);
              setInfoById((previous) => ({ ...previous, [device.id]: info }));
            }}
          />
          <DeviceTable
            devices={devices}
            activeId={activeId}
            infoById={infoById}
            onSelect={(device) => {
              setActiveId(device.id);
            }}
            onStop={() => {
              void stop();
              setActiveId(null);
            }}
            onRemoved={(id) => {
              setDevices((previous) =>
                previous.filter((device) => device.id !== id),
              );
              setActiveId((previous) => (previous === id ? null : previous));
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Events
        </h2>
        <EventLog
          deviceLabel={activeDevice?.label ?? null}
          status={stream.status}
          message={stream.message}
          events={events}
          onReload={reload}
        />
      </section>
    </main>
  );
}
