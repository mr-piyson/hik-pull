"use client";

import { useMemo, useState } from "react";
import type { AccessDirection, AccessEvent } from "@/lib/hik/types";
import type { StreamStatus } from "./use-device-stream";

const DIRECTION_STYLES: Record<AccessDirection, string> = {
  in: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  denied: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  door: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  other: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const DIRECTION_TEXT: Record<AccessDirection, string> = {
  in: "Granted",
  denied: "Denied",
  door: "Door",
  other: "Other",
};

const STATUS_STYLES: Record<StreamStatus, string> = {
  idle: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  connecting:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  error: "Error",
};

function formatTime(value: string | null): string {
  if (!value) {
    return "-";
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
      <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Select a terminal above to load history and start its live event stream.
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{deviceLabel}</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
        >
          {STATUS_TEXT[status]}
        </span>
        {message ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {message}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
          {events.length} loaded / {filtered.length} shown
        </span>
        <button
          type="button"
          onClick={onReload}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Reload history
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <label className="sr-only" htmlFor="event-search">
          Search events
        </label>
        <input
          id="event-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search name, employee no, card..."
          className="min-w-56 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
        {(["all", "in", "denied", "door", "other"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setDirection(value);
            }}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              direction === value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {value === "all" ? "All" : DIRECTION_TEXT[value]}
            {value !== "all" ? ` ${counts[value]}` : ""}
          </button>
        ))}
      </div>

      <div className="max-h-[34rem] overflow-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2">
                Time
              </th>
              <th scope="col" className="px-3 py-2">
                Result
              </th>
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="px-3 py-2">
                Employee no
              </th>
              <th scope="col" className="px-3 py-2">
                Card
              </th>
              <th scope="col" className="px-3 py-2">
                Reader
              </th>
              <th scope="col" className="px-3 py-2">
                Event
              </th>
              <th scope="col" className="px-3 py-2">
                Code
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((event) => (
              <tr
                key={event.id}
                className="border-t border-zinc-100 dark:border-zinc-800/60"
              >
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {formatTime(event.time)}
                  {event.source === "backfill" ? (
                    <span
                      className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      title="Loaded from device history"
                    >
                      hist
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${DIRECTION_STYLES[event.direction]}`}
                  >
                    {DIRECTION_TEXT[event.direction]}
                  </span>
                </td>
                <td className="px-3 py-1.5">{event.name || "-"}</td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  {event.employeeNo || "-"}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  {event.cardNo || "-"}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  {event.readerNo ?? "-"}
                </td>
                <td className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {event.label}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-500">
                  {event.major}/{event.minor}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {events.length === 0
                    ? "No events received yet. Trigger a face, card or fingerprint on the device."
                    : "No events match the current filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
