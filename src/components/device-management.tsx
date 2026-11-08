"use client";

import { LogIn, Plus, ServerCog, Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { ButtonLink } from "@/components/ui/button";
import type { PublicDevice } from "@/lib/hik/types";
import { DeviceGrid } from "./device-grid";

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

  const online = devices.filter((device) => device.status === "online").length;
  const offline = devices.length - online;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Infrastructure"
        title="Devices"
        description="Every reachable Hikvision terminal. Credentials stay on the server and are never returned to the browser."
        meta={
          <>
            <StatusPill tone="primary" icon={ServerCog}>
              {devices.length} configured
            </StatusPill>
            <StatusPill
              tone={online > 0 ? "success" : "neutral"}
              icon={Wifi}
              pulse={online > 0}
            >
              {online} online
            </StatusPill>
            {offline > 0 ? (
              <StatusPill tone="warning" icon={WifiOff}>
                {offline} unreachable
              </StatusPill>
            ) : null}
          </>
        }
        actions={
          <ButtonLink href="/devices/new">
            <Plus data-icon="inline-start" aria-hidden="true" />
            New device
          </ButtonLink>
        }
      />

      {devices.length > 0 ? (
        <section
          aria-label="Device summary"
          className="grid gap-3 sm:grid-cols-3"
        >
          <StatCard
            label="Registered terminals"
            value={devices.length}
            hint="Each one keeps its own live stream"
            icon={ServerCog}
            tone="primary"
          />
          <StatCard
            label="Online now"
            value={online}
            hint={online > 0 ? "Streams healthy" : "No terminal is responding"}
            icon={Wifi}
            tone={online > 0 ? "success" : "warning"}
          />
          <StatCard
            label="Attendance gates"
            value={
              devices.filter((device) => device.gateDirection !== "none").length
            }
            hint="Devices tagged as entry or exit"
            icon={LogIn}
            tone="neutral"
          />
        </section>
      ) : null}

      <DeviceGrid
        devices={devices}
        metaById={metaById}
        onSelect={(device) => {
          router.push(`/access-events?device=${encodeURIComponent(device.id)}`);
        }}
        onRemoved={(id) => {
          setDevices((previous) =>
            previous.filter((device) => device.id !== id),
          );
          router.refresh();
        }}
        onDirectionChanged={(id, gateDirection) => {
          setDevices((previous) =>
            previous.map((device) =>
              device.id === id ? { ...device, gateDirection } : device,
            ),
          );
        }}
      />
    </PageBody>
  );
}
