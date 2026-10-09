"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicAppSettings } from "@/lib/hik/settings-store";
import { trpc } from "@/trpc/client";

type NumericSettingKey = {
  [Key in keyof PublicAppSettings]: PublicAppSettings[Key] extends number
    ? Key
    : never;
}[keyof PublicAppSettings];

type WorkerStatus = Awaited<ReturnType<typeof trpc.worker.status.query>>;

type NumericFieldProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
};

function NumericField({
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: NumericFieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </span>
      <span className="flex max-w-sm items-center gap-3">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{unit}</span>
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        Allowed: {min}–{max} {unit}
      </span>
    </label>
  );
}

function TextField({
  label,
  description,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function ToggleSetting({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-blue-600"
      />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
      </span>
    </label>
  );
}

function relative(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1_000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return `${Math.round(minutes / 60)}h ago`;
}

function StatusBadge({ tone, children }: { tone: string; children: string }) {
  const tones: Record<string, string> = {
    online:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
    gray: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.gray}`}
    >
      {children}
    </span>
  );
}

function deviceTone(status: string): string {
  if (status === "online") {
    return "online";
  }
  if (status === "error") {
    return "red";
  }
  if (status === "offline") {
    return "gray";
  }
  return "amber";
}

function WorkerStatusPanel({
  status,
  onRetry,
  retrying,
}: {
  status: WorkerStatus | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (!status) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Loading worker status…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Hikvision sync
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium">
            <StatusBadge tone={status.enabled.hikvision ? "green" : "gray"}>
              {status.enabled.hikvision ? "Enabled" : "Paused"}
            </StatusBadge>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {relative(status.lastHikvisionRunAt)}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cloud sync
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium">
            <StatusBadge tone={status.enabled.cloud ? "green" : "gray"}>
              {status.enabled.cloud ? "Enabled" : "Paused"}
            </StatusBadge>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {status.configured
                ? relative(status.lastCloudRunAt)
                : "not configured"}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pending cloud events
          </p>
          <p className="mt-1 text-2xl font-semibold">{status.queue.pending}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Synced / failed
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {status.queue.synced}
            <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
              {" "}
              / {status.queue.failed}
            </span>
          </p>
          {status.queue.failed > 0 ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="mt-2 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {retrying ? "Requeuing…" : "Retry failed"}
            </button>
          ) : null}
        </div>
      </div>

      {status.lastHikvisionError ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Last Hikvision error: {status.lastHikvisionError}
        </p>
      ) : null}

      {status.lastCloudError ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Last cloud error: {status.lastCloudError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">Device</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last history sync</th>
              <th className="px-4 py-2">Last event key</th>
              <th className="px-4 py-2">Last error</th>
            </tr>
          </thead>
          <tbody>
            {status.devices.map((device) => (
              <tr
                key={device.id}
                className="border-t border-zinc-200 align-top dark:border-zinc-800"
              >
                <td className="px-4 py-2 font-medium">{device.label}</td>
                <td className="px-4 py-2">
                  <StatusBadge tone={deviceTone(device.status)}>
                    {device.status}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {relative(device.lastHistorySyncAt)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {device.lastEventKey ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs text-red-700 dark:text-red-300">
                  {device.lastSyncError ?? "—"}
                </td>
              </tr>
            ))}
            {status.devices.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No devices configured.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPanel({
  initialSettings,
}: {
  initialSettings: PublicAppSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkerStatus | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await trpc.worker.status.query());
    } catch {
      // The status panel is informational; a failed poll is not an error.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => void loadStatus(), 5_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  function setNumber(key: NumericSettingKey, value: number) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  async function retryFailed() {
    setRetrying(true);
    setMessage(null);
    setError(null);
    try {
      const { requeued } = await trpc.worker.retryFailed.mutate();
      setMessage(
        requeued === 0
          ? "No failed events to retry."
          : `${requeued} failed event(s) requeued for cloud sync.`,
      );
      await loadStatus();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not retry events.",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await trpc.settings.save.mutate({
        ...settings,
        ...(apiToken.length > 0 ? { cloudApiToken: apiToken } : {}),
      });
      setSettings(saved);
      setApiToken("");
      setMessage("Settings saved. The worker applies them on its next cycle.");
      void loadStatus();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          System configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Settings &amp; sync
        </h1>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Configure how device events are collected and how they reach the
          cloud. The attendance worker is always running; these toggles pause or
          resume its jobs through the database, so no process is ever restarted.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="font-semibold">Worker status</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live snapshot of both synchronization jobs and the local queue.
          </p>
        </div>
        <div className="p-5">
          <WorkerStatusPanel
            status={status}
            onRetry={() => void retryFailed()}
            retrying={retrying}
          />
        </div>
      </section>

      <form
        onSubmit={(event) => void save(event)}
        className="flex flex-col gap-6"
      >
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Hikvision collection</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Live streams receive events immediately; history sync recovers
              events missed while a device or server was offline.
            </p>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <ToggleSetting
                title="Auto-start live streams"
                description="Start device streams at server boot and when devices are added or updated. You can still start a stream manually."
                checked={settings.autoStartLiveStreams}
                onChange={(autoStartLiveStreams) =>
                  setSettings((current) => ({
                    ...current,
                    autoStartLiveStreams,
                  }))
                }
              />
              <ToggleSetting
                title="Hikvision history sync"
                description="Periodically retrieve device history and fill gaps in the live event stream."
                checked={settings.hikvisionSyncEnabled}
                onChange={(hikvisionSyncEnabled) =>
                  setSettings((current) => ({
                    ...current,
                    hikvisionSyncEnabled,
                  }))
                }
              />
              <NumericField
                label="Live reconnect base delay"
                description="Initial wait before retrying a dropped device stream."
                value={settings.reconnectBaseSeconds}
                min={1}
                max={300}
                unit="seconds"
                onChange={(value) => setNumber("reconnectBaseSeconds", value)}
              />
              <NumericField
                label="Maximum live reconnect delay"
                description="Upper bound for exponential backoff between stream retries."
                value={settings.reconnectMaxSeconds}
                min={1}
                max={1800}
                unit="seconds"
                onChange={(value) => setNumber("reconnectMaxSeconds", value)}
              />
            </div>
            <div className="grid content-start gap-5 sm:grid-cols-2">
              <NumericField
                label="Hikvision sync interval"
                description="Time between scheduled history reconciliations."
                value={settings.hikvisionIntervalSecs}
                min={5}
                max={86400}
                unit="seconds"
                onChange={(value) => setNumber("hikvisionIntervalSecs", value)}
              />
              <NumericField
                label="Initial history lookback"
                description="Used when a device has no successful history-sync checkpoint."
                value={settings.historyLookbackHours}
                min={1}
                max={720}
                unit="hours"
                onChange={(value) => setNumber("historyLookbackHours", value)}
              />
              <NumericField
                label="Checkpoint overlap"
                description="Re-read this time before the last checkpoint to catch late device events."
                value={settings.historyOverlapMinutes}
                min={0}
                max={1440}
                unit="minutes"
                onChange={(value) => setNumber("historyOverlapMinutes", value)}
              />
              <NumericField
                label="History batch size"
                description="Maximum events written in one batch while backfilling."
                value={settings.historyBatchSize}
                min={50}
                max={1000}
                unit="events"
                onChange={(value) => setNumber("historyBatchSize", value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Cloud synchronization</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Attendance events are queued in the local database and sent to the
              cloud ingestion API in batches. A network outage or restart never
              loses an event: it stays pending and is retried.
            </p>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <ToggleSetting
                title="Cloud sync"
                description="Send locally stored attendance events to the cloud ingestion API."
                checked={settings.cloudSyncEnabled}
                onChange={(cloudSyncEnabled) =>
                  setSettings((current) => ({ ...current, cloudSyncEnabled }))
                }
              />
              <TextField
                label="Cloud endpoint"
                description="Base URL of the AWS ingestion API, e.g. https://api.example.com."
                value={settings.cloudEndpoint}
                placeholder="https://api.example.com"
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    cloudEndpoint: value,
                  }))
                }
              />
              <TextField
                label="API token"
                description={
                  settings.hasCloudApiToken
                    ? "A token is stored. Leave blank to keep it, or enter a new one to replace it."
                    : "Bearer token for this installation. Stored server-side and never returned to the browser."
                }
                value={apiToken}
                type="password"
                placeholder={
                  settings.hasCloudApiToken
                    ? "•••••••• (stored)"
                    : "paste token"
                }
                onChange={setApiToken}
              />
            </div>
            <div className="grid content-start gap-5 sm:grid-cols-2">
              <NumericField
                label="Cloud sync interval"
                description="Time between cloud upload attempts."
                value={settings.cloudIntervalSecs}
                min={5}
                max={86400}
                unit="seconds"
                onChange={(value) => setNumber("cloudIntervalSecs", value)}
              />
              <NumericField
                label="Cloud batch size"
                description="Maximum events sent per upload."
                value={settings.cloudBatchSize}
                min={1}
                max={1000}
                unit="events"
                onChange={(value) => setNumber("cloudBatchSize", value)}
              />
              <NumericField
                label="Retry base delay"
                description="Initial wait before retrying a failed upload; doubles each attempt."
                value={settings.cloudRetryBaseSecs}
                min={1}
                max={3600}
                unit="seconds"
                onChange={(value) => setNumber("cloudRetryBaseSecs", value)}
              />
              <NumericField
                label="Maximum upload attempts"
                description="After this many failures an event is marked failed and left for manual review."
                value={settings.cloudMaxAttempts}
                min={1}
                max={100}
                unit="attempts"
                onChange={(value) => setNumber("cloudMaxAttempts", value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Attendance display</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The page refreshes from the local event database; this does not
              change the device polling rate.
            </p>
          </div>
          <div className="p-5">
            <NumericField
              label="Attendance refresh interval"
              description="How often the open attendance page checks for new saved records."
              value={settings.attendanceRefreshSeconds}
              min={5}
              max={300}
              unit="seconds"
              onChange={(value) => setNumber("attendanceRefreshSeconds", value)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Face photo upload</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Incoming images are compressed to JPEG before being sent to
              terminals. The configured target is capped below the device 200 KB
              limit.
            </p>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <NumericField
              label="Maximum compressed photo size"
              description="Target limit after image conversion and compression."
              value={settings.facePhotoTargetKB}
              min={50}
              max={190}
              unit="KB"
              onChange={(value) => setNumber("facePhotoTargetKB", value)}
            />
            <NumericField
              label="Maximum source image upload"
              description="Reject larger files before image processing begins."
              value={settings.maxPhotoUploadMB}
              min={1}
              max={50}
              unit="MB"
              onChange={(value) => setNumber("maxPhotoUploadMB", value)}
            />
          </div>
        </section>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}
        {message ? (
          <output
            aria-live="polite"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          >
            {message}
          </output>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Intervals apply to the worker after saving; the running process is
            never restarted.
          </span>
        </div>
      </form>
    </main>
  );
}
