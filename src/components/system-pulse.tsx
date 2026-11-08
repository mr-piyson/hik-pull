"use client";

import { CloudUpload, RefreshCw, Settings2, Webcam } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RelativeTime } from "@/components/relative-time";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

type WorkerStatus = Awaited<ReturnType<typeof trpc.worker.status.query>>;

export function SystemPulse({ showHeader = true }: { showHeader?: boolean }) {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await trpc.worker.status.query();
        if (active) {
          setStatus(next);
          setFailed(false);
        }
      } catch {
        if (active) {
          setFailed(true);
        }
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!status) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        {failed ? (
          <p className="text-xs text-destructive">
            Live status is unavailable right now.
          </p>
        ) : null}
      </div>
    );
  }

  const online = status.devices.filter(
    (device) => device.status === "online",
  ).length;
  const hikTone: StatusTone = status.enabled.hikvision ? "success" : "neutral";
  const cloudTone: StatusTone = !status.configured
    ? "neutral"
    : status.queue.failed > 0
      ? "danger"
      : status.enabled.cloud
        ? "success"
        : "warning";

  return (
    <section className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/8">
      <header
        className={cn(
          "flex items-center justify-between gap-3 border-b px-5 py-3.5",
          !showHeader && "hidden",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span
              aria-hidden="true"
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-70",
                status.enabled.hikvision
                  ? "bg-success pulse-dot"
                  : "bg-muted-foreground",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex size-2 rounded-full",
                status.enabled.hikvision ? "bg-success" : "bg-muted-foreground",
              )}
            />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">System pulse</h2>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Configure
          <Settings2 aria-hidden="true" className="size-3.5" />
        </Link>
      </header>

      <div className="flex flex-col divide-y">
        <PulseRow
          icon={Webcam}
          label="Terminals online"
          value={`${online} / ${status.devices.length}`}
          tone={
            online === 0 && status.devices.length > 0 ? "danger" : "success"
          }
        />

        <PulseRow
          icon={RefreshCw}
          label="Hikvision collector"
          value={
            status.enabled.hikvision ? (
              <span className="flex items-center gap-1.5">
                <StatusPill tone={hikTone}>Running</StatusPill>
                <RelativeTime
                  value={status.lastHikvisionRunAt}
                  className="text-[11px] text-muted-foreground"
                />
              </span>
            ) : (
              <StatusPill tone="neutral">Paused</StatusPill>
            )
          }
          tone={hikTone}
        />

        <PulseRow
          icon={CloudUpload}
          label="Cloud queue"
          value={
            <span className="flex items-center gap-1.5">
              <StatusPill tone={cloudTone}>
                {status.configured
                  ? status.enabled.cloud
                    ? "Enabled"
                    : "Paused"
                  : "Not configured"}
              </StatusPill>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {status.queue.pending} pending
              </span>
            </span>
          }
          tone={cloudTone}
        />
      </div>

      {status.queue.failed > 0 ? (
        <p className="border-t bg-destructive/5 px-5 py-2.5 text-[11px] text-destructive">
          {status.queue.failed} cloud event
          {status.queue.failed === 1 ? "" : "s"} failed permanently — retry from
          Settings.
        </p>
      ) : null}
      {status.lastHikvisionError ? (
        <p className="line-clamp-2 border-t px-5 py-2.5 text-[11px] text-muted-foreground">
          Last collector error: {status.lastHikvisionError}
        </p>
      ) : null}
    </section>
  );
}

function PulseRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Webcam;
  label: string;
  value: React.ReactNode;
  tone: StatusTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            tone === "danger" ? "text-destructive" : "text-muted-foreground/70",
          )}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-[13px] font-medium">{value}</span>
    </div>
  );
}
