"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Monitoring</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Access events
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review saved history and follow new events from one terminal at a
          time.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Terminal stream</CardTitle>
          <CardDescription>
            Select a configured terminal to review its recent history and
            monitor new events.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="min-w-64 flex-1">
            <FieldLabel htmlFor="event-terminal">Terminal</FieldLabel>
            <Select
              value={activeId}
              onValueChange={(nextId) => {
                if (activeId && activeId !== nextId) {
                  void stop().then((stopped) => {
                    if (stopped) {
                      setActiveId(nextId || null);
                    }
                  });
                  return;
                }
                setActiveId(nextId || null);
              }}
              disabled={devices.length === 0}
            >
              <SelectTrigger id="event-terminal" className="w-full">
                <SelectValue placeholder="Select a terminal" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.label} · {device.host}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {activeDevice ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={reload}>
                Reload history
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void stop().then((stopped) => {
                    if (stopped) {
                      setActiveId(null);
                    }
                  });
                }}
              >
                Stop stream
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {devices.length === 0 ? (
        <Empty className="min-h-48 border">
          <EmptyHeader>
            <EmptyTitle>No terminals configured</EmptyTitle>
            <EmptyDescription>
              Add a device before viewing access events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {devices.length > 0 ? (
        <EventLog
          deviceLabel={activeDevice?.label ?? null}
          status={stream.status}
          message={stream.message}
          events={events}
          onReload={reload}
        />
      ) : null}
    </main>
  );
}
