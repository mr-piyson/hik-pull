"use client";

import {
  CalendarClock,
  Check,
  CloudDownload,
  Download,
  LoaderCircle,
  LogIn,
  LogOut,
  Minus,
  RefreshCw,
  Search,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { formatDateTime, formatNumber } from "@/lib/format";
import type {
  AttendanceLogEntry,
  CloudSyncStatus,
} from "@/lib/hik/attendance-store";
import type { GateDirection } from "@/lib/hik/types";
import { trpc } from "@/trpc/client";

type AttendancePage = {
  logs: AttendanceLogEntry[];
  total: number;
  hasMore: boolean;
};

type SyncFilter = "ALL" | CloudSyncStatus;

const SYNC_TONE: Record<CloudSyncStatus, StatusTone> = {
  PENDING: "warning",
  SYNCED: "success",
  FAILED: "danger",
};

const SYNC_LABEL: Record<CloudSyncStatus, string> = {
  PENDING: "Pending",
  SYNCED: "Synced",
  FAILED: "Failed",
};

const DIRECTION_META: Record<
  GateDirection,
  { label: string; icon: typeof LogIn; tone: StatusTone }
> = {
  in: { label: "In", icon: LogIn, tone: "success" },
  out: { label: "Out", icon: LogOut, tone: "info" },
  none: { label: "None", icon: Minus, tone: "neutral" },
};

function sortLogs(left: AttendanceLogEntry, right: AttendanceLogEntry): number {
  const leftTime = left.dateTime
    ? new Date(left.dateTime).getTime()
    : Number.NEGATIVE_INFINITY;
  const rightTime = right.dateTime
    ? new Date(right.dateTime).getTime()
    : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || right.id.localeCompare(left.id);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function display(value: string | null): string {
  return value ?? "—";
}

export function AttendanceViewer({
  initialPage,
  refreshSeconds,
}: {
  initialPage: AttendancePage;
  refreshSeconds: number;
}) {
  const { toast } = useToast();
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SyncFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const queryInput = useCallback(
    (offset: number, limit: number) => ({
      offset,
      limit,
      ...(filter === "ALL" ? {} : { syncStatus: filter }),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [filter, dateFrom, dateTo],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
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
    } finally {
      setRefreshing(false);
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

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const all: AttendanceLogEntry[] = [];
      let offset = 0;
      while (true) {
        const page = await trpc.attendance.list.query(queryInput(offset, 500));
        all.push(...page.logs);
        if (!page.hasMore || page.logs.length === 0) {
          break;
        }
        offset += page.logs.length;
      }

      const header = [
        "id",
        "deviceIp",
        "deviceModel",
        "deviceSerial",
        "serialNo",
        "personId",
        "personName",
        "cardNo",
        "gateDirection",
        "eventType",
        "verification",
        "syncStatus",
        "dateTime",
        "timeRaw",
      ];
      const escapeCsv = (value: unknown) => {
        const text = value == null ? "" : String(value);
        if (/[",\n\r]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };
      const rows = all.map((log) =>
        [
          log.id,
          log.deviceIp,
          log.deviceModel,
          log.deviceSerial,
          log.serialNo,
          log.personId,
          log.personName,
          log.cardNo,
          log.gateDirection,
          log.eventType,
          log.verification,
          log.syncStatus,
          log.dateTime,
          log.timeRaw,
        ]
          .map(escapeCsv)
          .join(","),
      );
      const csv = [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fromPart = dateFrom || "all";
      const toPart = dateTo || "all";
      link.download = `attendance-${fromPart}-to-${toPart}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: `${all.length} record${all.length === 1 ? "" : "s"} written to CSV.`,
        tone: "success",
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not export attendance logs.",
      );
    } finally {
      setExporting(false);
    }
  };

  const pullAll = async () => {
    setPulling(true);
    setError(null);
    try {
      const result = await trpc.attendance.pull.mutate();
      const failureSuffix =
        result.failed > 0 ? ` (${result.failed} device(s) failed)` : "";
      toast({
        title: "Pull complete",
        description: `${result.inserted} new of ${result.fetched} events fetched from ${result.devices} device(s)${failureSuffix}.`,
        tone: result.failed > 0 ? "info" : "success",
      });
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

  // Client-side quick search over the rows loaded so far (server-side paging
  // and date/cloud filters keep narrowing what is loaded).
  const visibleLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return logs;
    }
    return logs.filter((log) =>
      [
        log.personName,
        log.personId,
        log.cardNo,
        log.deviceIp,
        log.deviceModel,
        log.deviceSerial,
        log.serialNo,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [logs, search]);

  const cloudCounts = useMemo(() => {
    const counts: Record<CloudSyncStatus, number> = {
      PENDING: 0,
      SYNCED: 0,
      FAILED: 0,
    };
    for (const log of logs) {
      counts[log.syncStatus] += 1;
    }
    return counts;
  }, [logs]);

  const hasFilters =
    filter !== "ALL" || dateFrom !== "" || dateTo !== "" || search !== "";

  const clearFilters = () => {
    setFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    const today = new Date();
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    const start = new Date(today);
    if (preset === "week") {
      start.setDate(start.getDate() - 6);
    }
    if (preset === "month") {
      start.setDate(start.getDate() - 29);
    }
    setDateFrom(dateInput(start));
    setDateTo(dateInput(today));
  };

  return (
    <PageBody>
      <PageHeader
        eyebrow="Monitoring"
        title="Attendance records"
        description="Authentication history collected from your terminals, with the cloud sync state of every record."
        meta={
          <>
            <StatusPill tone="neutral" icon={CalendarClock}>
              {formatNumber(total)} records
            </StatusPill>
            <StatusPill tone="warning">
              {cloudCounts.PENDING} pending
            </StatusPill>
            {cloudCounts.FAILED > 0 ? (
              <StatusPill tone="danger" icon={TriangleAlert}>
                {cloudCounts.FAILED} failed
              </StatusPill>
            ) : (
              <StatusPill tone="success" icon={Check}>
                Cloud healthy
              </StatusPill>
            )}
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void exportCsv()}
              disabled={exporting}
            >
              {exporting ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <Download data-icon="inline-start" aria-hidden="true" />
              )}
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              type="button"
              onClick={() => void pullAll()}
              disabled={pulling}
            >
              {pulling ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <CloudDownload data-icon="inline-start" aria-hidden="true" />
              )}
              {pulling ? "Pulling…" : "Pull from devices"}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
        <div className="flex flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="attendance-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search person, card or device"
                className="h-8 pl-8 text-[13px]"
                aria-label="Search records"
              />
            </div>
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
                className="w-fit"
                aria-label="Filter by cloud status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="ALL">Cloud: all</SelectItem>
                  <SelectItem value="PENDING">Cloud: pending</SelectItem>
                  <SelectItem value="SYNCED">Cloud: synced</SelectItem>
                  <SelectItem value="FAILED">Cloud: failed</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                id="attendance-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-8 w-[8.75rem] text-xs"
                aria-label="Filter from date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                id="attendance-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-8 w-[8.75rem] text-xs"
                aria-label="Filter to date"
              />
            </div>
            <div className="flex items-center gap-1">
              {(
                [
                  ["today", "Today"],
                  ["week", "7d"],
                  ["month", "30d"],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-transparent bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>
            {hasFilters ? (
              <Button
                type="button"
                onClick={clearFilters}
                variant="ghost"
                size="sm"
              >
                <X data-icon="inline-start" aria-hidden="true" />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            {refreshing ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3 animate-spin"
              />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3" />
            )}
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : `Auto-refresh every ${refreshSeconds}s`}
          </div>
        </div>

        <div className="scrollbar-subtle max-h-[68vh] overflow-auto">
          <Table className="min-w-[64rem] text-xs [&_td]:px-3 [&_td]:py-2 [&_th]:px-3">
            <TableHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-30 bg-card/95 pl-4">
                  Person
                </TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Cloud</TableHead>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="pr-4">Serial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLogs.map((log) => {
                const direction = DIRECTION_META[log.gateDirection];
                const DirectionIcon = direction.icon;
                return (
                  <TableRow key={log.id} className="group">
                    <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted/40">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={log.personName ?? log.personId ?? "?"}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">
                            {display(log.personName)}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {display(log.personId)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {display(log.cardNo)}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={direction.tone} icon={DirectionIcon}>
                        {direction.label}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {display(log.verification)}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={SYNC_TONE[log.syncStatus]}>
                        {SYNC_LABEL[log.syncStatus]}
                      </StatusPill>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap text-[11px] tabular-nums">
                          {formatDateTime(log.dateTime)}
                        </span>
                        <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                          {display(log.timeRaw)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate text-[11px]">
                          {display(log.deviceModel)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {display(log.deviceIp)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 font-mono text-[11px]">
                      {display(log.serialNo)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <Empty className="items-center border-0 py-14">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CalendarClock aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>No attendance records yet</EmptyTitle>
                        <EmptyDescription>
                          Records appear as soon as a terminal reports an
                          authentication with person data — pull from devices to
                          backfill.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void pullAll()}
                        disabled={pulling}
                      >
                        <CloudDownload
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        Pull from devices
                      </Button>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : visibleLogs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <Empty className="items-center border-0 py-14">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SearchX aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>No matching records</EmptyTitle>
                        <EmptyDescription>
                          Nothing matches the current search or filters.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        <X data-icon="inline-start" aria-hidden="true" />
                        Clear filters
                      </Button>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {search.trim()
              ? `${visibleLogs.length} of ${logs.length} loaded records match · ${formatNumber(total)} total`
              : `${logs.length} of ${formatNumber(total)} records loaded`}
          </p>
          {hasMore && visibleLogs.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {loading ? "Loading…" : "Load more"}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              All records in this view are loaded
            </span>
          )}
        </div>
      </section>
    </PageBody>
  );
}
