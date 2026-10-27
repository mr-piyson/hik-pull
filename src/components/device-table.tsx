"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type GateDirection,
  isGateDirection,
  type PublicDevice,
} from "@/lib/hik/types";
import { trpc } from "@/trpc/client";
import type { DeviceMeta } from "./device-management";

export function DeviceTable({
  devices,
  activeId,
  infoById,
  metaById = {},
  onSelect,
  onStop,
  onRemoved,
  onDirectionChanged,
}: {
  devices: PublicDevice[];
  activeId: string | null;
  infoById: Record<
    string,
    { model: string; firmwareVersion: string; deviceName: string }
  >;
  metaById?: Record<string, DeviceMeta>;
  onSelect: (device: PublicDevice) => void;
  onStop: () => void;
  onRemoved: (id: string) => void;
  onDirectionChanged: (id: string, direction: GateDirection) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateDirection = async (
    device: PublicDevice,
    gateDirection: GateDirection,
  ) => {
    setBusyId(device.id);
    setError(null);
    try {
      await trpc.devices.update.mutate({
        id: device.id,
        gateDirection,
      });
      onDirectionChanged(device.id, gateDirection);
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
    const confirmed = window.confirm(
      `Remove ${device.label}? Its stored credentials are deleted from the database.`,
    );
    if (!confirmed) {
      return;
    }
    setBusyId(device.id);
    setError(null);
    try {
      await trpc.devices.remove.mutate({ id: device.id });
      onRemoved(device.id);
    } catch {
      setError("Could not remove the device.");
    } finally {
      setBusyId(null);
    }
  };

  if (devices.length === 0) {
    return (
      <Empty className="min-h-48 border">
        <EmptyHeader>
          <EmptyTitle>No devices configured</EmptyTitle>
          <EmptyDescription>
            Add a terminal above to start collecting access events.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Model / firmware</TableHead>
            <TableHead>Attendance direction</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => {
            const info = infoById[device.id];
            const isActive = device.id === activeId;
            const meta = metaById[device.id];
            const model = info?.model || meta?.model || "—";
            const firmwareVersion = info?.firmwareVersion || "—";
            return (
              <TableRow
                key={device.id}
                data-state={isActive ? "selected" : undefined}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {device.label}
                    {isActive ? <Badge>Streaming</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const status = device.status ?? meta?.status ?? "unknown";
                    const online = status === "online";
                    return (
                      <Badge variant={online ? "default" : "outline"}>
                        {online ? "Online" : "Offline"}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {device.scheme}://{device.host}:{device.port}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {device.username}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(info || meta?.model) ? (
                    <>
                      <span className="block">
                        {model || "Unknown model"}
                      </span>
                      <span className="block font-mono">
                        {firmwareVersion}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={device.gateDirection}
                    onValueChange={(value) => {
                      if (value && isGateDirection(value)) {
                        void updateDirection(device, value);
                      }
                    }}
                    disabled={busyId === device.id}
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
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Link href={`/devices/${device.id}/edit`}>
                      <Button type="button" variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    {isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onStop}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelect(device)}
                      >
                        Events
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busyId === device.id}
                      onClick={() => void remove(device)}
                    >
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
