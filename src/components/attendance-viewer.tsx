"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AttendanceLogEntry,
  CloudSyncStatus,
} from "@/lib/hik/attendance-store";
import { trpc } from "@/trpc/client";

type AttendancePage = {
  logs: AttendanceLogEntry[];
  total: number;
  hasMore: boolean;
};

type SyncFilter = "ALL" | CloudSyncStatus;

function display(value: string | null): string {
  return value ?? "—";
}

function sortLogs(left: AttendanceLogEntry, right: AttendanceLogEntry): number {
  const leftTime = left.dateTime
    ? new Date(left.dateTime).getTime()
    : Number.NEGATIVE_INFINITY;
  const rightTime = right.dateTime
    ? new Date(right.dateTime).getTime()
    : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || right.id.localeCompare(left.id);
}

function displayDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
}

const SYNC_TONE: Record<string, string> = {
  SYNCED:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  FAILED:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

function SyncBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        SYNC_TONE[status] ?? SYNC_TONE.PENDING
      }`}
    >
      {status}
    </span>
  );
}

export function AttendanceViewer({
  initialPage,
  refreshSeconds,
}: {
  initialPage: AttendancePage;
  refreshSeconds: number;
}) {
  const [logs, setLogs] = useState(initialPage.logs);
  // Rows fetched from the server so far, used as the next `Load more` offset.
  // Tracked separately from `logs.length` because the live refresh merges new
  // rows into `logs`, which would otherwise over-advance the offset and skip
  // records.
  const [loadedCount, setLoadedCount] = useState(initialPage.logs.length);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [total, setTotal] = useState(initialPage.total);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<SyncFilter>("ALL");

  const queryInput = useCallback(
    (offset: number, limit: number) => ({
      offset,
      limit,
      ...(filter === "ALL" ? {} : { syncStatus: filter }),
    }),
    [filter],
  );

  const refresh = useCallback(async () => {
    try {
      const page = await trpc.attendance.list.query(queryInput(0, 100));
      setLogs((current) => {
        const byId = new Map(current.map((log) => [log.id, log]));
        for (const log of page.logs) {
          byId.set(log.id, log);
        }
        return Array.from(byId.values()).sort(sortLogs);
      });
      setHasMore(page.hasMore);
      setTotal(page.total);
      setError(null);
      setLastUpdated(new Date());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not refresh attendance logs.",
      );
    }
  }, [queryInput]);

  // Replace the list (rather than merge) whenever the filter changes, so rows
  // that no longer match are not left behind.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await trpc.attendance.list.query(queryInput(0, 100));
        if (cancelled) {
          return;
        }
        setLogs(page.logs);
        setLoadedCount(page.logs.length);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLastUpdated(new Date());
      } catch {
        // The interval refresh reports errors; this reset stays quiet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryInput]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, refreshSeconds * 1_000);
    return () => clearInterval(interval);
  }, [refresh, refreshSeconds]);

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await trpc.attendance.list.query(
        queryInput(loadedCount, 100),
      );
      setLogs((current) => {
        const byId = new Map(current.map((log) => [log.id, log]));
        for (const log of page.logs) {
          byId.set(log.id, log);
        }
        return Array.from(byId.values()).sort(sortLogs);
      });
      setLoadedCount((count) => count + page.logs.length);
      setHasMore(page.hasMore);
      setTotal(page.total);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load attendance logs.",
      );
    } finally {
      setLoading(false);
    }
  };

  const pullAll = async () => {
    setPulling(true);
    setError(null);
    setNotice(null);
    try {
      const result = await trpc.attendance.pull.mutate();
      const failureSuffix =
        result.failed > 0 ? ` (${result.failed} device(s) failed)` : "";
      setNotice(
        `Pulled ${result.fetched} event(s) — ${result.inserted} new — from ${result.devices} device(s)${failureSuffix}.`,
      );
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not pull attendance logs.",
      );
    } finally {
      setPulling(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          Attendance
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Person events
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Non-denied events containing person ID, name, or card data from
          configured terminals. Device time is retained verbatim in the raw time
          column.
        </p>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Attendance is collected when a terminal&apos;s live stream is running
          or its event history is pulled from{" "}
          <a
            href="/access-events"
            className="font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300"
          >
            Access events
          </a>
          .
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-semibold">Attendance records</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            Cloud status
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as SyncFilter)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="SYNCED">Synced</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void pullAll()}
            disabled={pulling}
            className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {pulling ? "Pulling…" : "Pull from all devices"}
          </button>
          <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
            Showing {logs.length} of {total}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : `Auto-refreshes every ${refreshSeconds} seconds`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[100rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Device IP
                </th>
                <th scope="col" className="px-4 py-3">
                  Device model
                </th>
                <th scope="col" className="px-4 py-3">
                  Device serial
                </th>
                <th scope="col" className="px-4 py-3">
                  Serial no
                </th>
                <th scope="col" className="px-4 py-3">
                  Person ID
                </th>
                <th scope="col" className="px-4 py-3">
                  Person name
                </th>
                <th scope="col" className="px-4 py-3">
                  Card no
                </th>
                <th scope="col" className="px-4 py-3">
                  Attendance direction
                </th>
                <th scope="col" className="px-4 py-3">
                  Verification
                </th>
                <th scope="col" className="px-4 py-3">
                  Cloud
                </th>
                <th scope="col" className="px-4 py-3">
                  Date/time
                </th>
                <th scope="col" className="px-4 py-3">
                  Raw time
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-zinc-200 align-top dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {display(log.deviceIp)}
                  </td>
                  <td className="px-4 py-3">{display(log.deviceModel)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {display(log.deviceSerial)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {display(log.serialNo)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {display(log.personId)}
                  </td>
                  <td className="px-4 py-3">{display(log.personName)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {display(log.cardNo)}
                  </td>
                  <td className="px-4 py-3 capitalize">{log.gateDirection}</td>
                  <td className="px-4 py-3">{display(log.verification)}</td>
                  <td className="px-4 py-3">
                    <SyncBadge status={log.syncStatus} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {displayDateTime(log.dateTime)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {display(log.timeRaw)}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No successful authentication records have been collected
                    yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {notice ? (
          <output className="block border-t border-emerald-200 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
            {notice}
          </output>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-t border-red-200 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
        {hasMore ? (
          <div className="border-t border-zinc-200 p-4 text-center dark:border-zinc-800">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
