"use client";

import {
  ArrowDownUp,
  CircleAlert,
  CircleCheck,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PageBody, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { RelativeTime } from "@/components/relative-time";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
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
import type { UserSyncLogEntry } from "@/lib/hik/user-types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "success" | "failure";

const PAGE_SIZE = 15;

export function SyncHistory({ entries }: { entries: UserSyncLogEntry[] }) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const successful = entries.filter(
    (entry) => entry.status === "success",
  ).length;
  const failed = entries.length - successful;
  const successRate =
    entries.length === 0 ? 0 : Math.round((successful / entries.length) * 100);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.status !== filter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        entry.userName.toLowerCase().includes(needle) ||
        entry.employeeNo.toLowerCase().includes(needle) ||
        entry.deviceLabel.toLowerCase().includes(needle) ||
        entry.operation.toLowerCase().includes(needle)
      );
    });
  }, [entries, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: entries.length },
    { value: "success", label: "Successful", count: successful },
    { value: "failure", label: "Failed", count: failed },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="Audit"
        title="Sync history"
        description="Per-device outcomes for every identity and face-photo change, newest first."
      />

      <section aria-label="Sync summary" className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Attempts recorded"
          value={entries.length}
          hint="User and photo changes pushed to terminals"
          icon={ArrowDownUp}
          tone="primary"
        />
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          hint={`${successful} confirmed by the device`}
          icon={CircleCheck}
          tone={successRate >= 90 ? "success" : "info"}
        />
        <StatCard
          label="Needs attention"
          value={failed}
          hint={
            failed === 0
              ? "No failures on record"
              : "Retry from the person record"
          }
          icon={CircleAlert}
          tone={failed > 0 ? "danger" : "success"}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/8 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search person, device or operation"
              aria-label="Search sync history"
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
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Filter by result</legend>
            {filters.map((option) => {
              const active = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(option.value);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                  <span className="font-mono text-[10px] tabular-nums opacity-70">
                    {option.count}
                  </span>
                </button>
              );
            })}
          </fieldset>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-foreground/8">
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {entries.length === 0 ? (
                    <ArrowDownUp aria-hidden="true" />
                  ) : (
                    <SearchX aria-hidden="true" />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {entries.length === 0
                    ? "No sync attempts recorded"
                    : "No matching attempts"}
                </EmptyTitle>
                <EmptyDescription>
                  {entries.length === 0
                    ? "Saving a person or uploading a photo pushes the change to every terminal; results appear here."
                    : "Adjust the search text or the result filter."}
                </EmptyDescription>
              </EmptyHeader>
              {entries.length === 0 ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="pr-4">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((entry) => (
                  <TableRow key={entry.id} className="group">
                    <TableCell className="pl-4">
                      <RelativeTime
                        value={entry.createdAt}
                        className="block text-xs whitespace-nowrap text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={entry.userName} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">
                            {entry.userName}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {entry.employeeNo}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.deviceLabel}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {entry.operation}
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        tone={entry.status === "success" ? "success" : "danger"}
                      >
                        {entry.status === "success" ? "Synced" : "Failed"}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="max-w-md pr-4">
                      <p
                        className="truncate text-[11px] text-muted-foreground"
                        title={entry.message ?? undefined}
                      >
                        {entry.message ?? "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of {filtered.length} attempts
              </p>
              <Pagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </section>
    </PageBody>
  );
}
