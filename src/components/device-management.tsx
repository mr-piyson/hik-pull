"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DeviceInfo, PublicDevice } from "@/lib/hik/types";
import { AddDeviceForm } from "./add-device-form";
import { DeviceTable } from "./device-table";

export function DeviceManagement({
  initialDevices,
}: {
  initialDevices: PublicDevice[];
}) {
  const router = useRouter();
  const [devices, setDevices] = useState(initialDevices);
  const [infoById, setInfoById] = useState<Record<string, DeviceInfo>>({});

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          Infrastructure
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Register each reachable Hikvision terminal. Credentials stay on the
          server and are never shown back in the browser.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Add a terminal</h2>
        <AddDeviceForm
          onAdded={(device, info) => {
            setDevices((previous) => [...previous, device]);
            setInfoById((previous) => ({ ...previous, [device.id]: info }));
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Configured terminals
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {devices.length} device{devices.length === 1 ? "" : "s"} connected
              to the master directory.
            </p>
          </div>
        </div>
        <DeviceTable
          devices={devices}
          activeId={null}
          infoById={infoById}
          onSelect={(device) => {
            router.push(
              `/access-events?device=${encodeURIComponent(device.id)}`,
            );
          }}
          onStop={() => undefined}
          onRemoved={(id) => {
            setDevices((previous) =>
              previous.filter((device) => device.id !== id),
            );
          }}
          onDirectionChanged={(id, gateDirection) => {
            setDevices((previous) =>
              previous.map((device) =>
                device.id === id ? { ...device, gateDirection } : device,
              ),
            );
          }}
        />
      </section>
    </main>
  );
}
