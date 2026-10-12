"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function SyncBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "FAILED" ? "destructive" : "secondary"}>
      {status}
    </Badge>
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
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Attendance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Person events
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Non-denied events containing person ID, name, or card data from
          configured terminals. Device time is retained verbatim in the raw time
          column.
        </p>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Attendance is collected when a terminal&apos;s live stream is running
          or its event history is pulled from{" "}
          <a
            href="/access-events"
            className="font-medium text-primary underline underline-offset-2"
          >
            Access events
          </a>
          .
        </p>
      </header>

      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Attendance records</CardTitle>
            <CardDescription>
              {logs.length} of {total} records ·{" "}
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : `Auto-refreshes every ${refreshSeconds} seconds`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Field orientation="horizontal" className="items-center gap-2">
              <FieldLabel htmlFor="attendance-cloud-filter">
                Cloud status
              </FieldLabel>
              <Select
                value={filter}
                onValueChange={(value) => {
                  if (
                    value === "ALL" ||
                    value === "PENDING" ||
                    value === "SYNCED" ||
                    value === "FAILED"
                  ) {
                    setFilter(value);
                  }
                }}
              >
                <SelectTrigger
                  id="attendance-cloud-filter"
                  size="sm"
                  aria-label="Filter by cloud status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="SYNCED">Synced</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="button"
              onClick={() => void pullAll()}
              disabled={pulling}
              size="sm"
            >
              {pulling ? "Pulling…" : "Pull from all devices"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[100rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Device IP</TableHead>
                  <TableHead>Device model</TableHead>
                  <TableHead>Device serial</TableHead>
                  <TableHead>Serial no</TableHead>
                  <TableHead>Person ID</TableHead>
                  <TableHead>Person name</TableHead>
                  <TableHead>Card no</TableHead>
                  <TableHead>Attendance direction</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Cloud</TableHead>
                  <TableHead>Date/time</TableHead>
                  <TableHead>Raw time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {display(log.deviceIp)}
                    </TableCell>
                    <TableCell>{display(log.deviceModel)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.deviceSerial)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.serialNo)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.personId)}
                    </TableCell>
                    <TableCell>{display(log.personName)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.cardNo)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {log.gateDirection}
                    </TableCell>
                    <TableCell>{display(log.verification)}</TableCell>
                    <TableCell>
                      <SyncBadge status={log.syncStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {displayDateTime(log.dateTime)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {display(log.timeRaw)}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No successful authentication records have been collected
                      yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {notice ? (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {hasMore ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loading}
              >
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
