"use client";

import { useState } from "react";
import type { AttendanceLogEntry } from "@/lib/hik/attendance-store";
import { trpc } from "@/trpc/client";

type AttendancePage = {
  logs: AttendanceLogEntry[];
  total: number;
  hasMore: boolean;
};

function display(value: string | null): string {
  return value ?? "—";
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

export function AttendanceViewer({
  initialPage,
}: {
  initialPage: AttendancePage;
}) {
  const [logs, setLogs] = useState(initialPage.logs);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [total, setTotal] = useState(initialPage.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await trpc.attendance.list.query({
        offset: logs.length,
        limit: 100,
      });
      setLogs((current) => [...current, ...page.logs]);
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

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          Attendance
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Successful authentications
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Successful person-authentication events captured from configured
          terminals. Device time is retained verbatim in the raw time column.
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
          <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
            Showing {logs.length} of {total}
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
                    colSpan={9}
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
