"use client";

import { ArrowDown, Radio, Search, SearchX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
import type { AccessDirection, AccessEvent } from "@/lib/hik/types";
import { cn } from "@/lib/utils";
import type { StreamStatus } from "./use-device-stream";

const DIRECTION_TEXT: Record<AccessDirection, string> = {
  in: "Granted",
  denied: "Denied",
  door: "Door",
  other: "Other",
};

const DIRECTION_TONE: Record<AccessDirection, StatusTone> = {
  in: "success",
  denied: "danger",
  door: "warning",
  other: "neutral",
};

function clockTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dayLabel(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
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
  const [flashId, setFlashId] = useState<string | null>(null);
  const previousTop = useRef<string | null>(null);

  useEffect(() => {
    const top = events[0]?.id ?? null;
    if (top && previousTop.current && top !== previousTop.current) {
      previousTop.current = top;
      setFlashId(top);
      const timer = window.setTimeout(() => setFlashId(null), 1600);
      return () => window.clearTimeout(timer);
    }
    previousTop.current = top;
  }, [events]);

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (direction !== "all" && event.direction !== direction) {
        return false;
      }
      if (!needle) {
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

  if (!deviceLabel) {
    return (
      <Empty className="rounded-xl border border-dashed py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radio aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Select a terminal</EmptyTitle>
          <EmptyDescription>
            Pick a device above to load its recent history and open a live
            stream.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const filters: { value: AccessDirection | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in", label: "Granted" },
    { value: "denied", label: "Denied" },
    { value: "door", label: "Door" },
    { value: "other", label: "Other" },
  ];

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {deviceLabel}
            </h2>
            <StatusPill
              tone={
                status === "live"
                  ? "success"
                  : status === "error"
                    ? "danger"
                    : status === "connecting"
                      ? "warning"
                      : "neutral"
              }
              pulse={status === "live"}
              icon={Radio}
            >
              {status === "live"
                ? "Live"
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </StatusPill>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {events.length}
            </span>
          </div>
          {message ? (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {message}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReload}
          className="shrink-0"
        >
          Reload history
        </Button>
      </header>

      <div className="flex flex-col gap-2.5 border-b px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search person, employee or card"
            className="h-8 pl-8 text-[13px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          ) : null}
        </div>
        <fieldset className="scrollbar-subtle flex items-center gap-1 overflow-x-auto">
          <legend className="sr-only">Filter events by result</legend>
          {filters.map((filter) => {
            const active = direction === filter.value;
            const count =
              filter.value === "all" ? events.length : counts[filter.value];
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={active}
                onClick={() => setDirection(filter.value)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    active ? "text-primary/70" : "text-muted-foreground/70",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </fieldset>
        <span className="hidden text-[11px] text-muted-foreground sm:ml-auto sm:block">
          {filtered.length} shown
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="scrollbar-subtle max-h-[36rem] overflow-auto">
          <Table className="min-w-[54rem]">
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Time</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Reader</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="pr-5">Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((event) => (
                <TableRow
                  key={event.id}
                  className={cn("group", flashId === event.id && "row-enter")}
                >
                  <TableCell className="pl-5">
                    <span className="block font-mono text-xs tabular-nums">
                      {clockTime(event.time)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {dayLabel(event.time)}
                      {event.source === "backfill" ? " · history" : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={DIRECTION_TONE[event.direction]}>
                      {DIRECTION_TEXT[event.direction]}
                    </StatusPill>
                  </TableCell>
                  <TableCell>
                    {event.name ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={event.name} size="xs" />
                        <span className="truncate text-[13px] font-medium">
                          {event.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Unidentified
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.employeeNo || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.cardNo || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {event.readerNo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {event.label}
                  </TableCell>
                  <TableCell className="pr-5 font-mono text-[11px] text-muted-foreground">
                    {event.major}/{event.minor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="p-4">
          <Empty className="border-0 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {events.length === 0 ? (
                  <Radio aria-hidden="true" />
                ) : (
                  <SearchX aria-hidden="true" />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {events.length === 0
                  ? "Waiting for the first event"
                  : "No matching events"}
              </EmptyTitle>
              <EmptyDescription>
                {events.length === 0
                  ? "Trigger a face, card or fingerprint authentication on the terminal and it will appear here instantly."
                  : "Try a different search term or clear the result filter."}
              </EmptyDescription>
            </EmptyHeader>
            {events.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setDirection("all");
                }}
              >
                <X data-icon="inline-start" aria-hidden="true" />
                Clear filters
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReload}
              >
                <ArrowDown data-icon="inline-start" aria-hidden="true" />
                Reload history
              </Button>
            )}
          </Empty>
        </div>
      )}
    </section>
  );
}
