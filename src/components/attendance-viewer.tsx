"use client";

import {
  CalendarClock,
  Check,
  Clock3,
  CloudDownload,
  Download,
  LoaderCircle,
  LogIn,
  LogOut,
  type LucideIcon,
  Minus,
  Search,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
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

const SYNC_BADGES: Record<
  CloudSyncStatus,
  {
    label: string;
    icon: LucideIcon;
    className?: string;
    variant?: "destructive";
  }
> = {
  PENDING: {
    label: "Pending",
    icon: Clock3,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  SYNCED: {
    label: "Synced",
    icon: Check,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  FAILED: {
    label: "Failed",
    icon: TriangleAlert,
    variant: "destructive",
  },
};

function SyncBadge({ status }: { status: CloudSyncStatus }) {
  const meta = SYNC_BADGES[status];
  const Icon = meta.icon;
  return (
    <Badge
      variant={meta.variant ?? "outline"}
      className={meta.className ?? "px-1.5 py-0 text-[10px]"}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {meta.label}
    </Badge>
  );
}

const DIRECTION_BADGES: Record<
  GateDirection,
  { label: string; icon: LucideIcon }
> = {
  in: { label: "In", icon: LogIn },
  out: { label: "Out", icon: LogOut },
  none: { label: "None", icon: Minus },
};

function DirectionBadge({ direction }: { direction: GateDirection }) {
  const meta = DIRECTION_BADGES[direction];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className="text-[10px]">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {meta.label}
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

  const hasFilters =
    filter !== "ALL" || dateFrom !== "" || dateTo !== "" || search !== "";

  const clearFilters = () => {
    setFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Attendance records
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Authentication history collected from your terminals, with cloud sync
          status for each record.
        </p>
      </header>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="attendance-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search person, card or device"
                className="h-8 w-56 pl-8"
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
            <Input
              id="attendance-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-8 w-36"
              aria-label="Filter from date"
            />
            <Input
              id="attendance-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-8 w-36"
              aria-label="Filter to date"
            />
            {hasFilters ? (
              <Button
                type="button"
                onClick={clearFilters}
                variant="ghost"
                size="sm"
              >
                <X aria-hidden="true" data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting}
              variant="outline"
              size="sm"
            >
              {exporting ? (
                <LoaderCircle
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Download aria-hidden="true" data-icon="inline-start" />
              )}
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              type="button"
              onClick={() => void pullAll()}
              disabled={pulling}
              size="sm"
            >
              {pulling ? (
                <LoaderCircle
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <CloudDownload aria-hidden="true" data-icon="inline-start" />
              )}
              {pulling ? "Pulling…" : "Pull from all devices"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-3 px-4 py-3">
          <div className="max-h-[62vh] overflow-auto rounded-md border">
            <Table className="min-w-[62rem] text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 bg-background">
                    Person
                  </TableHead>
                  <TableHead>Card no</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Cloud</TableHead>
                  <TableHead>Date & time</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Serial no</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="sticky left-0 z-[1] bg-background">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {display(log.personName)}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {display(log.personId)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.cardNo)}
                    </TableCell>
                    <TableCell>
                      <DirectionBadge direction={log.gateDirection} />
                    </TableCell>
                    <TableCell className="capitalize">
                      {display(log.verification)}
                    </TableCell>
                    <TableCell>
                      <SyncBadge status={log.syncStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap text-xs">
                          {displayDateTime(log.dateTime)}
                        </span>
                        <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {display(log.timeRaw)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{display(log.deviceModel)}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {display(log.deviceIp)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {display(log.serialNo)}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <Empty className="items-center border-0 py-12">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <CalendarClock aria-hidden="true" />
                          </EmptyMedia>
                          <EmptyTitle>No attendance records yet</EmptyTitle>
                          <EmptyDescription>
                            Records appear here once they have been pulled from
                            a terminal.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : visibleLogs.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <Empty className="items-center border-0 py-12">
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
                          <X aria-hidden="true" data-icon="inline-start" />
                          Clear filters
                        </Button>
                      </Empty>
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
          {hasMore && visibleLogs.length > 0 ? (
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
        <CardFooter className="flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {search.trim()
              ? `${visibleLogs.length} of ${logs.length} loaded records match · ${total} total`
              : `${logs.length} of ${total} records`}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            {refreshing ? (
              <LoaderCircle
                className="size-3 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : `Auto-refreshes every ${refreshSeconds}s`}
          </span>
        </CardFooter>
      </Card>
    </main>
  );
}
