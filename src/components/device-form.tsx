"use client";

import {
  ArrowLeft,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Network,
  ShieldCheck,
  Webcam,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PageBody, PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
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

function toFormState(device: PublicDevice): FormState {
  return {
    label: device.label ?? "",
    host: device.host ?? "",
    port: String(device.port ?? 80),
    scheme: device.scheme ?? "http",
    username: device.username ?? "admin",
    password: "",
    gateDirection: device.gateDirection ?? "none",
  };
}

export function DeviceForm({
  mode,
  initialDevice,
}: {
  mode: "create" | "edit";
  initialDevice?: PublicDevice;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    initialDevice ? toFormState(initialDevice) : EMPTY,
  );
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
      if (mode === "create") {
        await trpc.devices.create.mutate({
          ...form,
          port: Number(form.port),
        });
        router.push("/devices");
        return;
      }
      if (!initialDevice) {
        throw new Error("Missing device to edit");
      }
      await trpc.devices.update.mutate({
        id: initialDevice.id,
        label: form.label,
        scheme: form.scheme,
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password.length > 0 ? form.password : undefined,
        gateDirection: form.gateDirection,
      });
      router.push("/devices");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach the app server.",
      );
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "create" ? "Add device" : "Edit device";

  return (
    <PageBody>
      <PageHeader
        eyebrow="Infrastructure"
        title={title}
        description={
          mode === "create"
            ? "Connect a terminal on the local network. Credentials are verified against the device before they are saved."
            : "Update connection details. Leave the password blank to keep the stored one."
        }
        actions={
          <ButtonLink href="/devices" variant="outline">
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to devices
          </ButtonLink>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={submit}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl bg-card ring-1 ring-foreground/8">
            <SectionHeading
              title="Connection"
              description="Where the terminal answers on your network"
              icon={Network}
              className="border-b px-5 py-4"
            />
            <div className="p-5">
              <FieldGroup className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="device-host">
                    IP address or hostname{" "}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="device-host"
                    required
                    value={form.host}
                    onChange={(event) => update("host", event.target.value)}
                    placeholder="192.168.1.64"
                    autoComplete="off"
                    spellCheck={false}
                    className="max-w-md font-mono"
                  />
                  <FieldDescription>
                    IPv4 or hostname reachable from this server. HTTPS with
                    self-signed certificates is not supported yet.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="device-port">Port</FieldLabel>
                  <Input
                    id="device-port"
                    value={form.port}
                    onChange={(event) =>
                      update("port", event.target.value.replace(/\D/g, ""))
                    }
                    inputMode="numeric"
                    className="font-mono"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-scheme">Scheme</FieldLabel>
                  <Select
                    value={form.scheme}
                    onValueChange={(value) => {
                      if (value === "http" || value === "https") {
                        update("scheme", value);
                      }
                    }}
                  >
                    <SelectTrigger id="device-scheme" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="http">http</SelectItem>
                        <SelectItem value="https">https</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="device-label">Display label</FieldLabel>
                  <Input
                    id="device-label"
                    value={form.label}
                    onChange={(event) => update("label", event.target.value)}
                    placeholder="Front door"
                  />
                  <FieldDescription>
                    Shown on events, attendance rows and sync history.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-direction">
                    Attendance direction
                  </FieldLabel>
                  <Select
                    value={form.gateDirection}
                    onValueChange={(value) => {
                      if (value && isGateDirection(value)) {
                        update("gateDirection", value);
                      }
                    }}
                  >
                    <SelectTrigger id="device-direction" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="in">In — entry gate</SelectItem>
                        <SelectItem value="out">Out — exit gate</SelectItem>
                        <SelectItem value="none">None — not a gate</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Applied to future attendance records, never retroactively.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </div>
          </section>

          <section className="rounded-xl bg-card ring-1 ring-foreground/8">
            <SectionHeading
              title="Credentials"
              description="ISAPI account with access-control read permission"
              icon={Lock}
              className="border-b px-5 py-4"
            />
            <div className="p-5">
              <FieldGroup className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="device-username">
                    Username <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="device-username"
                    required
                    value={form.username}
                    onChange={(event) => update("username", event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-password">
                    {mode === "edit"
                      ? "Password (leave blank to keep)"
                      : "Password"}
                    {mode === "create" ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id="device-password"
                      required={mode === "create"}
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) =>
                        update("password", event.target.value)
                      }
                      autoComplete={mode === "create" ? "new-password" : "off"}
                      className="pr-9 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Eye aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  </div>
                  <FieldDescription>
                    Digest authentication is used; the password never leaves the
                    server after saving.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/8">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Security
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Credentials are stored in the local SQLite database and only used
              server-side. No API response ever includes the password — the UI
              only knows whether one is stored.
            </p>
          </div>
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/8">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Webcam
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Before you save
            </h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>The terminal must be reachable from this server.</li>
              <li>
                The account needs access-control read permission for events and
                face-library write permission for photos.
              </li>
              <li>
                Live streams may take 20–25 seconds to open on DS-K1T671MF-class
                devices.
              </li>
            </ul>
          </div>
        </aside>

        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:col-span-2 lg:rounded-xl lg:border lg:px-5">
          <p className="text-xs text-muted-foreground">
            {mode === "create"
              ? "The connection is tested before the device is saved."
              : "Changing the host or port restarts the live stream."}
          </p>
          <div className="flex items-center gap-2">
            <ButtonLink href="/devices" variant="outline">
              Cancel
            </ButtonLink>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {busy
                ? mode === "create"
                  ? "Testing connection…"
                  : "Saving…"
                : mode === "create"
                  ? "Add device"
                  : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </PageBody>
  );
}
