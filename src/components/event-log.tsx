"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AccessDirection, AccessEvent } from "@/lib/hik/types";
import type { StreamStatus } from "./use-device-stream";

const DIRECTION_TEXT: Record<AccessDirection, string> = {
  in: "Granted",
  denied: "Denied",
  door: "Door",
  other: "Other",
};

function directionVariant(
  direction: AccessDirection,
): "default" | "secondary" | "destructive" | "outline" {
  if (direction === "in") {
    return "secondary";
  }
  if (direction === "denied") {
    return "destructive";
  }
  return "outline";
}

function statusVariant(
  status: StreamStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "live") {
    return "default";
  }
  if (status === "error") {
    return "destructive";
  }
  return status === "connecting" ? "secondary" : "outline";
}

function formatTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  // The device omits the zone on some payloads; assume it is device-local.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function EventLog({
  deviceLabel,
  status,
  message,
  events,
  onReload,
}: {
  deviceLabel: string | null;
  status: StreamStatus;
  message: string | null;
  events: AccessEvent[];
  onReload: () => void;
}) {
  const [direction, setDirection] = useState<AccessDirection | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (direction !== "all" && event.direction !== direction) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }
      return (
        event.name.toLowerCase().includes(needle) ||
        event.employeeNo.toLowerCase().includes(needle) ||
        event.cardNo.toLowerCase().includes(needle) ||
        event.label.toLowerCase().includes(needle)
      );
    });
  }, [direction, events, query]);

  const counts = useMemo(() => {
    const tally: Record<AccessDirection, number> = {
      in: 0,
      denied: 0,
      door: 0,
      other: 0,
    };
    for (const event of events) {
      tally[event.direction] += 1;
    }
    return tally;
  }, [events]);

  if (!deviceLabel) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyTitle>Select a terminal</EmptyTitle>
          <EmptyDescription>
            Choose a device above to load its history and start a live event
            stream.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{deviceLabel}</CardTitle>
            <Badge variant={statusVariant(status)}>
              {status === "live"
                ? "Live"
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </div>
          {message ? (
            <CardDescription className="mt-1 break-words">
              {message}
            </CardDescription>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {events.length} loaded / {filtered.length} shown
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            Reload history
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Search events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, employee no, card…"
            className="min-w-56 flex-1"
          />
          <ToggleGroup
            aria-label="Filter events by result"
            value={[direction]}
            onValueChange={(values) => {
              setDirection((values[0] as AccessDirection | undefined) ?? "all");
            }}
            spacing={0}
            variant="outline"
            size="sm"
          >
            {(["all", "in", "denied", "door", "other"] as const).map(
              (value) => (
                <ToggleGroupItem key={value} value={value}>
                  {value === "all" ? "All" : DIRECTION_TEXT[value]}
                  {value !== "all" ? ` ${counts[value]}` : ""}
                </ToggleGroupItem>
              ),
            )}
          </ToggleGroup>
        </div>

        {filtered.length > 0 ? (
          <div className="max-h-[34rem] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee no</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead>Reader</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-mono text-xs">
                      {formatTime(event.time)}
                      {event.source === "backfill" ? (
                        <Badge variant="outline" className="ml-2">
                          History
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={directionVariant(event.direction)}>
                        {DIRECTION_TEXT[event.direction]}
                      </Badge>
                    </TableCell>
                    <TableCell>{event.name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.employeeNo || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.cardNo || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.readerNo ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.label}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.major}/{event.minor}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty className="min-h-48 border">
            <EmptyHeader>
              <EmptyTitle>
                {events.length === 0
                  ? "No events received"
                  : "No matching events"}
              </EmptyTitle>
              <EmptyDescription>
                {events.length === 0
                  ? "Trigger a face, card, or fingerprint event on the device to begin."
                  : "Try adjusting the search or result filter."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
