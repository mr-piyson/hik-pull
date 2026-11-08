"use client";

import { Radio, RefreshCw, ServerCog, Square, Webcam } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { PublicDevice } from "@/lib/hik/types";
import { cn } from "@/lib/utils";
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

  const selectDevice = (nextId: string) => {
    if (activeId === nextId) {
      return;
    }
    if (activeId) {
      void stop().then((stopped) => {
        if (stopped) {
          setActiveId(nextId);
        }
      });
      return;
    }
    setActiveId(nextId);
  };

  return (
    <PageBody>
      <PageHeader
        eyebrow="Monitoring"
        title="Access events"
        description="Review a terminal's recent history and follow new authentications live. History requests and the live stream are deduplicated into one ordered feed."
        meta={
          activeDevice ? (
            <>
              <StatusPill
                tone={
                  stream.status === "live"
                    ? "success"
                    : stream.status === "error"
                      ? "danger"
                      : "warning"
                }
                pulse={stream.status === "live"}
                icon={Radio}
              >
                {stream.status === "live"
                  ? "Live"
                  : stream.status === "connecting"
                    ? "Connecting"
                    : stream.status === "error"
                      ? "Connection issue"
                      : "Idle"}
              </StatusPill>
              <StatusPill tone="neutral">
                {events.length} events loaded
              </StatusPill>
            </>
          ) : (
            <StatusPill tone="neutral" icon={Webcam}>
              No terminal selected
            </StatusPill>
          )
        }
        actions={
          activeDevice ? (
            <>
              <Button variant="outline" onClick={reload}>
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
                Reload
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void stop().then((stopped) => {
                    if (stopped) {
                      setActiveId(null);
                    }
                  });
                }}
              >
                <Square data-icon="inline-start" aria-hidden="true" />
                Stop
              </Button>
            </>
          ) : devices.length > 0 ? (
            <Button onClick={() => selectDevice(devices[0].id)}>
              <Radio data-icon="inline-start" aria-hidden="true" />
              Start with {devices[0].label}
            </Button>
          ) : null
        }
      />

      {devices.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ServerCog aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No terminals configured</EmptyTitle>
            <EmptyDescription>
              Register a terminal first — access events are read from a device.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink href="/devices/new" size="sm">
              Add a device
            </ButtonLink>
          </EmptyContent>
        </Empty>
      ) : (
        <section
          aria-label="Select terminal"
          className="scrollbar-subtle -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {devices.map((device) => {
            const active = device.id === activeId;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => selectDevice(device.id)}
                aria-pressed={active}
                className={cn(
                  "group flex min-w-[13rem] flex-col gap-1.5 rounded-xl border bg-card px-4 py-3 text-left transition-all outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40",
                  active
                    ? "border-primary/50 ring-1 ring-primary/25"
                    : "border-transparent ring-1 ring-foreground/8",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {device.label}
                  </span>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      active
                        ? "bg-success pulse-dot"
                        : device.status === "online"
                          ? "bg-success"
                          : "bg-muted-foreground/50",
                    )}
                  />
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {device.host}:{device.port}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {devices.length > 0 ? (
        <EventLog
          deviceLabel={activeDevice?.label ?? null}
          status={stream.status}
          message={stream.message}
          events={events}
          onReload={reload}
        />
      ) : null}
    </PageBody>
  );
}
