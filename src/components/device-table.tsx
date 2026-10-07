"use client";

import { useState } from "react";
import type { PublicDevice } from "@/lib/hik/types";
import { trpc } from "@/trpc/client";

export function DeviceTable({
  devices,
  activeId,
  infoById,
  onSelect,
  onStop,
  onRemoved,
}: {
  devices: PublicDevice[];
  activeId: string | null;
  infoById: Record<
    string,
    { model: string; firmwareVersion: string; deviceName: string }
  >;
  onSelect: (device: PublicDevice) => void;
  onStop: () => void;
  onRemoved: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No devices yet. Add one above to start pulling access events.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
        <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th scope="col" className="px-3 py-2">
              Device
            </th>
            <th scope="col" className="px-3 py-2">
              Host
            </th>
            <th scope="col" className="px-3 py-2">
              Username
            </th>
            <th scope="col" className="px-3 py-2">
              Model / firmware
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const info = infoById[device.id];
            const isActive = device.id === activeId;
            return (
              <tr
                key={device.id}
                className={`border-t border-zinc-200 dark:border-zinc-800 ${
                  isActive ? "bg-blue-50 dark:bg-blue-950/40" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <span className="font-medium">{device.label}</span>
                  {isActive ? (
                    <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      streaming
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {device.scheme}://{device.host}:{device.port}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {device.username}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {info ? (
                    <>
                      <span className="block">
                        {info.model || "unknown model"}
                      </span>
                      <span className="block font-mono">
                        {info.firmwareVersion}
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={onStop}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(device);
                        }}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Events
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === device.id}
                      onClick={() => {
                        void remove(device);
                      }}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? (
        <p
          role="alert"
          className="px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
