"use client";

import {
  Activity,
  CircleAlert,
  Pencil,
  Plus,
  ServerCog,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import type { GateDirection, PublicDevice } from "@/lib/hik/types";
import { isGateDirection } from "@/lib/hik/types";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";
import type { DeviceMeta } from "./device-management";

function statusMeta(status: string): {
  label: string;
  tone: StatusTone;
  icon: typeof Wifi;
} {
  switch (status) {
    case "online":
      return { label: "Online", tone: "success", icon: Wifi };
    case "error":
      return { label: "Error", tone: "danger", icon: CircleAlert };
    case "offline":
      return { label: "Offline", tone: "warning", icon: WifiOff };
    default:
      return { label: "Unknown", tone: "neutral", icon: ServerCog };
  }
}

const DIRECTION_LABELS: Record<GateDirection, string> = {
  in: "Entry gate",
  out: "Exit gate",
  none: "Not an attendance gate",
};

export function DeviceGrid({
  devices,
  metaById = {},
  onSelect,
  onRemoved,
  onDirectionChanged,
}: {
  devices: PublicDevice[];
  metaById?: Record<string, DeviceMeta>;
  onSelect: (device: PublicDevice) => void;
  onRemoved: (id: string) => void;
  onDirectionChanged: (id: string, direction: GateDirection) => void;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PublicDevice | null>(null);

  const updateDirection = async (
    device: PublicDevice,
    gateDirection: GateDirection,
  ) => {
    setBusyId(device.id);
    setError(null);
    try {
      await trpc.devices.update.mutate({ id: device.id, gateDirection });
      onDirectionChanged(device.id, gateDirection);
      toast({
        title: "Direction updated",
        description: `${device.label} is treated as ${DIRECTION_LABELS[
          gateDirection
        ].toLowerCase()} for future attendance events.`,
        tone: "success",
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not update the device attendance direction.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (device: PublicDevice) => {
    setBusyId(device.id);
    setError(null);
    try {
      await trpc.devices.remove.mutate({ id: device.id });
      onRemoved(device.id);
      toast({
        title: "Device removed",
        description: `${device.label} was disconnected and its stored credentials deleted.`,
        tone: "success",
      });
      setPendingRemove(null);
    } catch {
      setError("Could not remove the device.");
    } finally {
      setBusyId(null);
    }
  };

  if (devices.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerCog aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No terminals registered</EmptyTitle>
          <EmptyDescription>
            Add a Hikvision terminal on the local network to start collecting
            access events and pushing identities.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ButtonLink href="/devices/new" size="sm">
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add a device
          </ButtonLink>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {devices.map((device) => {
          const meta = metaById[device.id];
          const status = statusMeta(device.status ?? meta?.status ?? "unknown");
          const StatusIcon = status.icon;
          const busy = busyId === device.id;
          return (
            <li
              key={device.id}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8 transition-all hover:ring-primary/25",
                busy && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
                      status.tone === "success"
                        ? "bg-success/10 text-success ring-success/20"
                        : status.tone === "danger"
                          ? "bg-destructive/10 text-destructive ring-destructive/20"
                          : status.tone === "warning"
                            ? "bg-warning/15 text-warning-foreground ring-warning/25 dark:text-warning"
                            : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    <StatusIcon aria-hidden="true" className="size-[1.15rem]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight">
                      {device.label}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {device.scheme}://{device.host}:{device.port}
                    </p>
                  </div>
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t px-4 py-3 text-[11px]">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="truncate font-medium">
                    {meta?.model ?? "Not reported"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Serial</dt>
                  <dd className="truncate font-mono font-medium">
                    {meta?.serial ?? "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="truncate font-mono font-medium">
                    {device.username}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Added</dt>
                  <dd className="truncate font-medium">
                    {formatDate(device.createdAt)}
                  </dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-col gap-3 border-t bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Attendance direction
                  </span>
                  <Select
                    value={device.gateDirection}
                    onValueChange={(value) => {
                      if (value && isGateDirection(value)) {
                        void updateDirection(device, value);
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger
                      aria-label={`Attendance direction for ${device.label}`}
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="in">In</SelectItem>
                        <SelectItem value="out">Out</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onSelect(device)}
                  >
                    <Activity data-icon="inline-start" aria-hidden="true" />
                    Events
                  </Button>
                  <ButtonLink
                    href={`/devices/${device.id}/edit`}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Edit
                  </ButtonLink>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${device.label}`}
                    title="Remove device"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => setPendingRemove(device)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        title={`Remove ${pendingRemove?.label ?? "device"}?`}
        description="Stored credentials are deleted and live collection stops. Access events already recorded by this terminal are removed with it; attendance history is kept."
        confirmLabel="Remove device"
        tone="destructive"
        busy={busyId === pendingRemove?.id}
        onConfirm={() => {
          if (pendingRemove) {
            void remove(pendingRemove);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3 text-xs">
          <span className="text-muted-foreground">Host</span>
          <span className="font-mono">
            {pendingRemove?.host}:{pendingRemove?.port}
          </span>
        </div>
      </ConfirmDialog>
    </div>
  );
}
