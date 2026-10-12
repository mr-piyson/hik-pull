"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const id = `setting-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex max-w-sm items-center gap-3">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-32"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Allowed: {min}–{max} {unit}
      </p>
    </Field>
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
  const id = `setting-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-md"
      />
    </Field>
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
  const id = `setting-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <Field
      orientation="horizontal"
      className="items-center justify-between gap-4"
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>{title}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
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
  const variant =
    tone === "red"
      ? "destructive"
      : tone === "online" || tone === "green"
        ? "default"
        : tone === "amber"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{children}</Badge>;
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
      <p className="text-sm text-muted-foreground">Loading worker status…</p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <p className="text-xs text-muted-foreground">Hikvision sync</p>
            <div className="flex items-center gap-2 text-sm font-medium">
              <StatusBadge tone={status.enabled.hikvision ? "green" : "gray"}>
                {status.enabled.hikvision ? "Enabled" : "Paused"}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                {relative(status.lastHikvisionRunAt)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <p className="text-xs text-muted-foreground">Cloud sync</p>
            <div className="flex items-center gap-2 text-sm font-medium">
              <StatusBadge tone={status.enabled.cloud ? "green" : "gray"}>
                {status.enabled.cloud ? "Enabled" : "Paused"}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                {status.configured
                  ? relative(status.lastCloudRunAt)
                  : "not configured"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <p className="text-xs text-muted-foreground">
              Pending cloud events
            </p>
            <p className="text-2xl font-semibold">{status.queue.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <p className="text-xs text-muted-foreground">Synced / failed</p>
            <p className="text-2xl font-semibold">
              {status.queue.synced}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {status.queue.failed}
              </span>
            </p>
            {status.queue.failed > 0 ? (
              <Button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                variant="outline"
                size="sm"
              >
                {retrying ? "Requeuing…" : "Retry failed"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {status.lastHikvisionError ? (
        <Alert>
          <AlertDescription>
            Last Hikvision error: {status.lastHikvisionError}
          </AlertDescription>
        </Alert>
      ) : null}

      {status.lastCloudError ? (
        <Alert>
          <AlertDescription>
            Last cloud error: {status.lastCloudError}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last history sync</TableHead>
              <TableHead>Last event key</TableHead>
              <TableHead>Last error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status.devices.map((device) => (
              <TableRow key={device.id}>
                <TableCell className="font-medium">{device.label}</TableCell>
                <TableCell>
                  <StatusBadge tone={deviceTone(device.status)}>
                    {device.status}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relative(device.lastHistorySyncAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {device.lastEventKey ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-destructive">
                  {device.lastSyncError ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {status.devices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-20 text-center text-muted-foreground"
                >
                  No devices configured.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
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
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          System configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Settings &amp; sync
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Configure how device events are collected and how they reach the
          cloud. The attendance worker is always running; these toggles pause or
          resume its jobs through the database, so no process is ever restarted.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Worker status</CardTitle>
          <CardDescription>
            Live snapshot of both synchronization jobs and the local queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkerStatusPanel
            status={status}
            onRetry={() => void retryFailed()}
            retrying={retrying}
          />
        </CardContent>
      </Card>

      <form
        onSubmit={(event) => void save(event)}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Hikvision collection</CardTitle>
            <CardDescription>
              Live streams receive events immediately; history sync recovers
              events missed while a device or server was offline.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cloud synchronization</CardTitle>
            <CardDescription>
              Attendance events are queued in the local database and sent to the
              cloud ingestion API in batches. A network outage or restart never
              loses an event: it stays pending and is retried.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance display</CardTitle>
            <CardDescription>
              The page refreshes from the local event database; this does not
              change the device polling rate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NumericField
              label="Attendance refresh interval"
              description="How often the open attendance page checks for new saved records."
              value={settings.attendanceRefreshSeconds}
              min={5}
              max={300}
              unit="seconds"
              onChange={(value) => setNumber("attendanceRefreshSeconds", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Face photo upload</CardTitle>
            <CardDescription>
              Incoming images are compressed to JPEG before being sent to
              terminals. The configured target is capped below the device 200 KB
              limit.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
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
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert aria-live="polite">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Intervals apply to the worker after saving; the running process is
            never restarted.
          </span>
        </div>
      </form>
    </main>
  );
}
