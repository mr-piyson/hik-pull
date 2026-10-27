"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DeviceInfo, PublicDevice } from "@/lib/hik/types";
import { DeviceTable } from "./device-table";

export type DeviceMeta = {
  model?: string | null;
  serial?: string | null;
  status?: string | null;
};

export function DeviceManagement({
  initialDevices,
  metaById = {},
}: {
  initialDevices: PublicDevice[];
  metaById?: Record<string, DeviceMeta>;
}) {
  const router = useRouter();
  const [devices, setDevices] = useState(initialDevices);
  const [infoById] = useState<Record<string, DeviceInfo>>({});

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Infrastructure
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Register each reachable Hikvision terminal. Credentials stay on the
            server and are never shown back in the browser.
          </p>
        </div>
        <Link href="/devices/new">
          <Button>New device</Button>
        </Link>
      </header>

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
            metaById={metaById}
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
