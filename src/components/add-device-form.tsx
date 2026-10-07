"use client";

import { type FormEvent, useState } from "react";
import {
  type DeviceInfo,
  type GateDirection,
  isGateDirection,
  type PublicDevice,
} from "@/lib/hik/types";
import { trpc } from "@/trpc/client";

type FormState = {
  label: string;
  host: string;
  port: string;
  scheme: "http" | "https";
  username: string;
  password: string;
  gateDirection: GateDirection;
};

const EMPTY: FormState = {
  label: "",
  host: "",
  port: "80",
  scheme: "http",
  username: "admin",
  password: "",
  gateDirection: "none",
};

export function AddDeviceForm({
  onAdded,
}: {
  onAdded: (device: PublicDevice, info: DeviceInfo) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await trpc.devices.create.mutate({
        ...form,
        port: Number(form.port),
      });
      onAdded(payload.device, payload.info);
      setForm(EMPTY);
      setShowPassword(false);
    } catch {
      setError("Could not reach the app server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label className="flex flex-col gap-1 text-sm lg:col-span-2">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          IP address / hostname
        </span>
        <input
          required
          value={form.host}
          onChange={(event) => {
            update("host", event.target.value);
          }}
          placeholder="192.168.1.64"
          autoComplete="off"
          spellCheck={false}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Label
        </span>
        <input
          value={form.label}
          onChange={(event) => {
            update("label", event.target.value);
          }}
          placeholder="Front door"
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Attendance direction
        </span>
        <select
          value={form.gateDirection}
          onChange={(event) => {
            const direction = event.target.value;
            if (isGateDirection(direction)) {
              update("gateDirection", direction);
            }
          }}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="in">In</option>
          <option value="out">Out</option>
          <option value="none">None</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Username
        </span>
        <input
          required
          value={form.username}
          onChange={(event) => {
            update("username", event.target.value);
          }}
          autoComplete="off"
          spellCheck={false}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Password
        </span>
        <input
          required
          type={showPassword ? "text" : "password"}
          value={form.password}
          onChange={(event) => {
            update("password", event.target.value);
          }}
          autoComplete="new-password"
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="flex flex-col justify-end gap-2">
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">Port</span>
            <input
              value={form.port}
              onChange={(event) => {
                update("port", event.target.value.replace(/\D/g, ""));
              }}
              inputMode="numeric"
              aria-label="Port"
              className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">Scheme</span>
            <select
              value={form.scheme}
              onChange={(event) => {
                update("scheme", event.target.value as "http" | "https");
              }}
              aria-label="Scheme"
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => {
              setShowPassword(event.target.checked);
            }}
          />
          Show password
        </label>
      </div>

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Testing connection..." : "Add device"}
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Credentials are verified against the device before being saved, and
          stored server-side only in SQLite.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2 lg:col-span-6 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
