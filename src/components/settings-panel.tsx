"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/hik/settings-store";
import { trpc } from "@/trpc/client";

type NumericSettingKey = {
  [Key in keyof AppSettings]: AppSettings[Key] extends number ? Key : never;
}[keyof AppSettings];

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

export function SettingsPanel({
  initialSettings,
}: {
  initialSettings: AppSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setNumber(key: NumericSettingKey, value: number) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await trpc.settings.save.mutate(settings);
      setSettings(saved);
      setMessage("Settings saved and the history schedule was updated.");
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
          Configure how device events are collected, how often history is
          reconciled, and the image limits used for terminal enrollment. Changes
          are stored in the local database.
        </p>
      </header>

      <form
        onSubmit={(event) => void save(event)}
        className="flex flex-col gap-6"
      >
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="font-semibold">Device collection</h2>
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
                title="Scheduled history sync"
                description="Periodically retrieve device history and fill gaps in the live event stream."
                checked={settings.historySyncEnabled}
                onChange={(historySyncEnabled) =>
                  setSettings((current) => ({
                    ...current,
                    historySyncEnabled,
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
                label="History sync interval"
                description="Time between scheduled history reconciliations."
                value={settings.historySyncIntervalHours}
                min={1}
                max={168}
                unit="hours"
                onChange={(value) =>
                  setNumber("historySyncIntervalHours", value)
                }
              />
              <NumericField
                label="Startup delay"
                description="Wait after server start before the first history sync."
                value={settings.historyStartupDelaySecs}
                min={0}
                max={3600}
                unit="seconds"
                onChange={(value) =>
                  setNumber("historyStartupDelaySecs", value)
                }
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
            Intervals apply to the server schedule after saving. Open attendance
            pages use the new refresh interval when reloaded.
          </span>
        </div>
      </form>
    </main>
  );
}
