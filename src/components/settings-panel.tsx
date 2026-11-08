"use client";

import {
  Activity,
  CloudUpload,
  Database,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  TriangleAlert,
  Webcam,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PageBody, PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { StatusPill, type StatusTone } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

type NumericSettingKey = {
  [Key in keyof PublicAppSettings]: PublicAppSettings[Key] extends number
    ? Key
    : never;
}[keyof PublicAppSettings];

type WorkerStatus = Awaited<ReturnType<typeof trpc.worker.status.query>>;

const SECTIONS = [
  { id: "status", label: "Worker status", icon: Activity },
  { id: "collection", label: "Collection", icon: Webcam },
  { id: "cloud", label: "Cloud sync", icon: CloudUpload },
  { id: "display", label: "Attendance display", icon: SlidersHorizontal },
  { id: "photos", label: "Face photos", icon: ImageIcon },
] as const;

function deviceTone(status: string): StatusTone {
  if (status === "online") {
    return "success";
  }
  if (status === "error") {
    return "danger";
  }
  if (status === "offline") {
    return "warning";
  }
  return "neutral";
}

function NumericField({
  id,
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="relative mt-1 max-w-40">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="pr-16 font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">
          {unit}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Allowed {min}–{max} {unit}
      </p>
    </Field>
  );
}

function ToggleSetting({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/25 p-3.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-xl bg-card ring-1 ring-foreground/8"
    >
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="text-sm font-semibold tracking-tight"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile
          label="Hikvision job"
          tone={status.enabled.hikvision ? "success" : "neutral"}
          value={status.enabled.hikvision ? "Running" : "Paused"}
          hint={
            <RelativeTime
              value={status.lastHikvisionRunAt}
              className="text-[11px] text-muted-foreground"
            />
          }
        />
        <StatusTile
          label="Cloud job"
          tone={
            !status.configured
              ? "neutral"
              : status.enabled.cloud
                ? "success"
                : "warning"
          }
          value={
            !status.configured
              ? "Not configured"
              : status.enabled.cloud
                ? "Running"
                : "Paused"
          }
          hint={
            <span className="text-[11px] text-muted-foreground">
              {status.configured ? (
                <RelativeTime value={status.lastCloudRunAt} />
              ) : (
                "Set an endpoint and token"
              )}
            </span>
          }
        />
        <StatusTile
          label="Pending queue"
          tone={status.queue.pending > 0 ? "warning" : "success"}
          value={String(status.queue.pending)}
          hint={
            <span className="text-[11px] text-muted-foreground">
              events waiting to upload
            </span>
          }
        />
        <StatusTile
          label="Synced / failed"
          tone={status.queue.failed > 0 ? "danger" : "success"}
          value={`${status.queue.synced} / ${status.queue.failed}`}
          hint={
            status.queue.failed > 0 ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3", retrying && "animate-spin")}
                />
                {retrying ? "Requeuing…" : "Retry failed"}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                nothing to retry
              </span>
            )
          }
        />
      </div>

      {status.lastHikvisionError ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Last collector error: {status.lastHikvisionError}
          </AlertDescription>
        </Alert>
      ) : null}

      {status.lastCloudError ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Last cloud error: {status.lastCloudError}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">Device</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last history sync</TableHead>
              <TableHead>Last event</TableHead>
              <TableHead className="pr-3">Last error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status.devices.map((device) => (
              <TableRow key={device.id}>
                <TableCell className="pl-3 text-[13px] font-medium">
                  {device.label}
                </TableCell>
                <TableCell>
                  <StatusPill tone={deviceTone(device.status)}>
                    {device.status}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <RelativeTime value={device.lastHistorySyncAt} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <RelativeTime value={device.lastEventTime} />
                </TableCell>
                <TableCell className="max-w-64 truncate pr-3 text-[11px] text-destructive">
                  {device.lastSyncError ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {status.devices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-16 text-center text-xs text-muted-foreground"
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

function StatusTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: React.ReactNode;
  tone: StatusTone;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <StatusPill tone={tone}>{value}</StatusPill>
      {hint}
    </div>
  );
}

export function SettingsPanel({
  initialSettings,
}: {
  initialSettings: PublicAppSettings;
}) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkerStatus | null>(null);

  const dirty = useMemo(
    () =>
      apiToken.length > 0 ||
      JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [apiToken, initialSettings, settings],
  );

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
    setError(null);
  }

  async function retryFailed() {
    setRetrying(true);
    setError(null);
    try {
      const { requeued } = await trpc.worker.retryFailed.mutate();
      toast({
        title: requeued === 0 ? "Nothing to retry" : "Events requeued",
        description:
          requeued === 0
            ? "There are no permanently failed events."
            : `${requeued} failed event(s) will be retried by the cloud job.`,
        tone: "success",
      });
      await loadStatus();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not retry events.",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await trpc.settings.save.mutate({
        ...settings,
        ...(apiToken.length > 0 ? { cloudApiToken: apiToken } : {}),
      });
      setSettings(saved);
      setApiToken("");
      toast({
        title: "Settings saved",
        description:
          "The worker picks up new intervals on its next cycle — no restart needed.",
        tone: "success",
      });
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
    <PageBody>
      <PageHeader
        eyebrow="System configuration"
        title="Settings"
        description="Control how events are collected from terminals and delivered to the cloud. The attendance worker always runs; these toggles pause or resume its jobs through the database."
        meta={
          dirty ? (
            <StatusPill tone="warning">Unsaved changes</StatusPill>
          ) : (
            <StatusPill tone="success">All changes saved</StatusPill>
          )
        }
        actions={
          <>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSettings(initialSettings);
                  setApiToken("");
                  setError(null);
                }}
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Reset
              </Button>
            ) : null}
            <Button type="submit" form="settings-form" disabled={saving}>
              {saving ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <Save data-icon="inline-start" aria-hidden="true" />
              )}
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="hidden xl:sticky xl:top-24 xl:block xl:self-start"
        >
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground/70 group-hover:text-foreground"
                  />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <form
          id="settings-form"
          onSubmit={(event) => void save(event)}
          className="flex min-w-0 flex-col gap-6"
        >
          <SettingsSection
            id="status"
            title="Worker status"
            description="Live snapshot of both synchronization jobs, the local queue and each terminal."
            icon={Activity}
          >
            <WorkerStatusPanel
              status={status}
              onRetry={() => void retryFailed()}
              retrying={retrying}
            />
          </SettingsSection>

          <SettingsSection
            id="collection"
            title="Hikvision collection"
            description="Live streams receive events immediately; history sync recovers anything missed while a device or server was offline."
            icon={Webcam}
          >
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 lg:grid-cols-2">
                <ToggleSetting
                  id="auto-start-live-streams"
                  title="Auto-start live streams"
                  description="Start device streams at boot and whenever a device is added or updated."
                  checked={settings.autoStartLiveStreams}
                  onChange={(autoStartLiveStreams) =>
                    setSettings((current) => ({
                      ...current,
                      autoStartLiveStreams,
                    }))
                  }
                />
                <ToggleSetting
                  id="hikvision-sync-enabled"
                  title="History sync"
                  description="Periodically retrieve device history to fill gaps in the live stream."
                  checked={settings.hikvisionSyncEnabled}
                  onChange={(hikvisionSyncEnabled) =>
                    setSettings((current) => ({
                      ...current,
                      hikvisionSyncEnabled,
                    }))
                  }
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <NumericField
                  id="hikvision-interval"
                  label="Sync interval"
                  description="Time between scheduled history reconciliations."
                  value={settings.hikvisionIntervalSecs}
                  min={5}
                  max={86400}
                  unit="seconds"
                  onChange={(value) =>
                    setNumber("hikvisionIntervalSecs", value)
                  }
                />
                <NumericField
                  id="history-lookback"
                  label="Initial lookback"
                  description="Used when a device has no successful checkpoint."
                  value={settings.historyLookbackHours}
                  min={1}
                  max={720}
                  unit="hours"
                  onChange={(value) => setNumber("historyLookbackHours", value)}
                />
                <NumericField
                  id="history-overlap"
                  label="Checkpoint overlap"
                  description="Re-read this window before the checkpoint to catch late events."
                  value={settings.historyOverlapMinutes}
                  min={0}
                  max={1440}
                  unit="minutes"
                  onChange={(value) =>
                    setNumber("historyOverlapMinutes", value)
                  }
                />
                <NumericField
                  id="history-batch"
                  label="History batch size"
                  description="Maximum events written in one backfill batch."
                  value={settings.historyBatchSize}
                  min={50}
                  max={1000}
                  unit="events"
                  onChange={(value) => setNumber("historyBatchSize", value)}
                />
                <NumericField
                  id="reconnect-base"
                  label="Reconnect base delay"
                  description="Initial wait before retrying a dropped stream."
                  value={settings.reconnectBaseSeconds}
                  min={1}
                  max={300}
                  unit="seconds"
                  onChange={(value) => setNumber("reconnectBaseSeconds", value)}
                />
                <NumericField
                  id="reconnect-max"
                  label="Maximum reconnect delay"
                  description="Upper bound for exponential backoff."
                  value={settings.reconnectMaxSeconds}
                  min={1}
                  max={1800}
                  unit="seconds"
                  onChange={(value) => setNumber("reconnectMaxSeconds", value)}
                />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="cloud"
            title="Cloud synchronization"
            description="Attendance is written locally first and queued. An outage or restart never loses an event — it stays pending and is retried."
            icon={CloudUpload}
          >
            <div className="flex flex-col gap-5">
              <ToggleSetting
                id="cloud-sync-enabled"
                title="Cloud sync"
                description="Send locally stored attendance events to the cloud ingestion API."
                checked={settings.cloudSyncEnabled}
                onChange={(cloudSyncEnabled) =>
                  setSettings((current) => ({ ...current, cloudSyncEnabled }))
                }
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="cloud-endpoint">
                    Cloud endpoint
                  </FieldLabel>
                  <FieldDescription>
                    Base URL of the ingestion API, e.g. https://api.example.com.
                  </FieldDescription>
                  <Input
                    id="cloud-endpoint"
                    value={settings.cloudEndpoint}
                    placeholder="https://api.example.com"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        cloudEndpoint: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cloud-token">API token</FieldLabel>
                  <FieldDescription>
                    {settings.hasCloudApiToken
                      ? "A token is stored. Leave blank to keep it, or enter a new one to replace it."
                      : "Bearer token for this installation. Stored server-side and never returned to the browser."}
                  </FieldDescription>
                  <Input
                    id="cloud-token"
                    type="password"
                    value={apiToken}
                    placeholder={
                      settings.hasCloudApiToken
                        ? "•••••••• (stored)"
                        : "paste token"
                    }
                    autoComplete="off"
                    onChange={(event) => setApiToken(event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <NumericField
                  id="cloud-interval"
                  label="Sync interval"
                  description="Time between upload attempts."
                  value={settings.cloudIntervalSecs}
                  min={5}
                  max={86400}
                  unit="seconds"
                  onChange={(value) => setNumber("cloudIntervalSecs", value)}
                />
                <NumericField
                  id="cloud-batch"
                  label="Batch size"
                  description="Maximum events sent per upload."
                  value={settings.cloudBatchSize}
                  min={1}
                  max={1000}
                  unit="events"
                  onChange={(value) => setNumber("cloudBatchSize", value)}
                />
                <NumericField
                  id="cloud-retry-base"
                  label="Retry base delay"
                  description="Initial wait before retry; doubles each attempt."
                  value={settings.cloudRetryBaseSecs}
                  min={1}
                  max={3600}
                  unit="seconds"
                  onChange={(value) => setNumber("cloudRetryBaseSecs", value)}
                />
                <NumericField
                  id="cloud-max-attempts"
                  label="Maximum attempts"
                  description="Then the event is marked failed for review."
                  value={settings.cloudMaxAttempts}
                  min={1}
                  max={100}
                  unit="attempts"
                  onChange={(value) => setNumber("cloudMaxAttempts", value)}
                />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="display"
            title="Attendance display"
            description="The attendance page refreshes from the local database; this does not change device polling."
            icon={SlidersHorizontal}
          >
            <NumericField
              id="attendance-refresh"
              label="Refresh interval"
              description="How often an open attendance page checks for new saved records."
              value={settings.attendanceRefreshSeconds}
              min={5}
              max={300}
              unit="seconds"
              onChange={(value) => setNumber("attendanceRefreshSeconds", value)}
            />
          </SettingsSection>

          <SettingsSection
            id="photos"
            title="Face photo processing"
            description="Incoming images are compressed to JPEG before being sent to terminals, capped below the device's 200 KB limit."
            icon={ImageIcon}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <NumericField
                id="photo-target"
                label="Maximum compressed size"
                description="Target limit after conversion and compression."
                value={settings.facePhotoTargetKB}
                min={50}
                max={190}
                unit="KB"
                onChange={(value) => setNumber("facePhotoTargetKB", value)}
              />
              <NumericField
                id="photo-upload"
                label="Maximum source upload"
                description="Reject larger files before processing begins."
                value={settings.maxPhotoUploadMB}
                min={1}
                max={50}
                unit="MB"
                onChange={(value) => setNumber("maxPhotoUploadMB", value)}
              />
            </div>
          </SettingsSection>

          <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/90 px-4 py-3 backdrop-blur">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database aria-hidden="true" className="size-3.5" />
              {dirty
                ? "Unsaved changes — the worker keeps the last saved values until you save."
                : "Settings are stored in SQLite and applied by the running worker."}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSettings(initialSettings);
                  setApiToken("");
                  setError(null);
                }}
                disabled={!dirty || saving}
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Reset
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <Save data-icon="inline-start" aria-hidden="true" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Settings2 aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            Intervals apply to the worker on its next cycle. The running process
            is never restarted — enabling or pausing a job writes to the
            database.
          </p>
        </form>
      </div>
    </PageBody>
  );
}
