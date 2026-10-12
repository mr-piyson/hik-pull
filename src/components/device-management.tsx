"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">
          Infrastructure
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Register each reachable Hikvision terminal. Credentials stay on the
          server and are never shown back in the browser.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Add a terminal</CardTitle>
          <CardDescription>
            Connect a device on the local network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddDeviceForm
            onAdded={(device, info) => {
              setDevices((previous) => [...previous, device]);
              setInfoById((previous) => ({ ...previous, [device.id]: info }));
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured terminals</CardTitle>
          <CardDescription>
            {devices.length} device{devices.length === 1 ? "" : "s"} connected
            to the master directory.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </main>
  );
}
